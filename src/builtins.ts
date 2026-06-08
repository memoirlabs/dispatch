import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { collectWorkspacePackages, isTurboRepo } from "./project.ts";
import { commandExists, formatCommand, runCapture, runResolved } from "./run.ts";
import type { DispatchContext } from "./types.ts";

const DEFAULT_PORTS = [3000, 3001, 3002, 3003, 3004, 3005, 5173, 5174, 5175, 8080, 8787];

export async function cleanPorts(context: DispatchContext, args: string[]): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const ports = parsePortArgs(args) ?? context.config.ports ?? DEFAULT_PORTS;
  const pids = new Set<number>();

  for (const port of ports) {
    for (const pid of await pidsForPort(context.repoRoot, port)) {
      pids.add(pid);
    }
  }

  for (const pid of await nextDevLockPids(context.repoRoot)) {
    pids.add(pid);
  }

  const sorted = [...pids].sort((a, b) => a - b);
  if (sorted.length === 0) {
    await clearStaleNextLocks(context.repoRoot);
    console.log(`No listening processes found on ports ${ports.join(", ")}.`);
    return;
  }

  console.log(`Stopping processes: ${sorted.join(" ")}`);
  if (dryRun) {
    console.log("[dry-run] no processes were stopped.");
    return;
  }

  await runCapture(["kill", ...sorted.map(String)], context.repoRoot);
  await Bun.sleep(600);

  const stubborn = [];
  for (const pid of sorted) {
    const alive = await runCapture(["kill", "-0", String(pid)], context.repoRoot);
    if (alive.exitCode === 0) stubborn.push(pid);
  }

  if (stubborn.length) {
    console.log(`Force killing stubborn processes: ${stubborn.join(" ")}`);
    await runCapture(["kill", "-9", ...stubborn.map(String)], context.repoRoot);
  }

  await clearStaleNextLocks(context.repoRoot);
  console.log(`Ports clean: ${ports.join(", ")}`);
}

export async function syncRepo(context: DispatchContext, args: string[]): Promise<void> {
  const hard = args.includes("--hard") || context.config.syncMode === "hard";
  const dryRun = args.includes("--dry-run");

  const branchResult = await runCapture(["git", "branch", "--show-current"], context.repoRoot);
  const branch = branchResult.stdout.trim() || "main";
  const commands = hard
    ? [
      ["git", "fetch", "origin"],
      ["git", "reset", "--hard", `origin/${branch}`],
      ["git", "clean", "-fd"],
    ]
    : [
      ["git", "pull", "--rebase", "--autostash"],
      ["bun", "install"],
    ];

  for (const cmd of commands) {
    if (dryRun) {
      console.log(`[dry-run] ${formatCommand(cmd)}`);
      continue;
    }
    console.log(`$ ${formatCommand(cmd)}`);
    const exitCode = await runResolved({ cmd, cwd: context.repoRoot });
    if (exitCode !== 0) process.exit(exitCode);
  }
}

export async function updateAll(context: DispatchContext, args: string[]): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const forwarded = args.filter((arg) => arg !== "--dry-run");
  const packages = (await collectWorkspacePackages(context.repoRoot, context.packageJson))
    .filter((workspace) => workspace.hasDependencies);

  if (!packages.length) {
    console.log("No dependency-bearing packages found.");
    return;
  }

  for (const workspace of packages) {
    const cmd = ["bun", "update", "--latest", ...forwarded];
    console.log(`\n==> ${workspace.relativePath}`);
    if (dryRun) {
      console.log(`[dry-run] ${formatCommand(cmd)}`);
      continue;
    }
    const exitCode = await runResolved({ cmd, cwd: workspace.root });
    if (exitCode !== 0) process.exit(exitCode);
  }
}

export async function cleanArtifacts(context: DispatchContext, args: string[]): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const targets = [
    "node_modules",
    "bun.lockb",
    ".turbo",
    ".next",
    ".svelte-kit",
    "dist",
    "coverage",
  ];

  for (const target of targets) {
    const path = join(context.repoRoot, target);
    if (!existsSync(path)) continue;
    if (dryRun) {
      console.log(`[dry-run] rm -rf ${target}`);
      continue;
    }
    await rm(path, { recursive: true, force: true });
    console.log(`removed ${target}`);
  }
}

export async function doctor(context: DispatchContext): Promise<void> {
  console.log(`project: ${context.packageJson.name ?? "(unnamed)"}`);
  console.log(`root:    ${context.repoRoot}`);
  console.log(`bun:     ${Bun.version}`);
  console.log(`pm:      ${context.packageJson.packageManager ?? "(none)"}`);
  console.log(`turbo:   ${isTurboRepo(context.packageJson) ? "yes" : "no"}`);
  console.log(`git:     ${await commandExists("git", context.repoRoot) ? "yes" : "no"}`);
  console.log(`scripts: ${Object.keys(context.packageJson.scripts ?? {}).length}`);
}

export function listProjectScripts(context: DispatchContext): void {
  const scripts = context.packageJson.scripts ?? {};
  const entries = Object.entries(scripts).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) {
    console.log("No package scripts found.");
    return;
  }

  for (const [name, script] of entries) {
    console.log(`${name.padEnd(28)} ${script}`);
  }
}

async function pidsForPort(cwd: string, port: number): Promise<number[]> {
  const result = await runCapture(["lsof", "-nP", `-tiTCP:${port}`, "-sTCP:LISTEN"], cwd);
  if (result.exitCode !== 0 && !result.stdout.trim()) return [];
  return parsePidLines(result.stdout);
}

function parsePidLines(output: string): number[] {
  return output
    .split(/\r?\n/)
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function parsePortArgs(args: string[]): number[] | null {
  const ports: number[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--port" || arg === "-p") {
      const next = args[index + 1];
      if (next) ports.push(...parsePortValue(next));
      index += 1;
    } else if (arg.startsWith("--port=")) {
      ports.push(...parsePortValue(arg.slice("--port=".length)));
    } else if (arg === "--ports") {
      const next = args[index + 1];
      if (next) ports.push(...parsePortValue(next));
      index += 1;
    } else if (arg.startsWith("--ports=")) {
      ports.push(...parsePortValue(arg.slice("--ports=".length)));
    }
  }

  return ports.length ? [...new Set(ports)].sort((a, b) => a - b) : null;
}

function parsePortValue(value: string): number[] {
  return value
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((port) => Number.isInteger(port) && port > 0 && port < 65536);
}

async function nextDevLockPids(repoRoot: string): Promise<number[]> {
  const candidates = [
    join(repoRoot, ".next/dev/lock"),
    join(repoRoot, "apps/full-stack-next-app/.next/dev/lock"),
    join(repoRoot, "apps/web-app/.next/dev/lock"),
    join(repoRoot, "apps/landing-page/.next/dev/lock"),
  ];

  const pids: number[] = [];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const payload = await Bun.file(file).json() as { pid?: unknown };
      if (typeof payload.pid === "number" && Number.isInteger(payload.pid) && payload.pid > 0) {
        pids.push(payload.pid);
      }
    } catch {
      // Ignore corrupt lock files. They are cleaned separately when stale.
    }
  }
  return pids;
}

async function clearStaleNextLocks(repoRoot: string): Promise<void> {
  const candidates = [
    join(repoRoot, ".next/dev/lock"),
    join(repoRoot, "apps/full-stack-next-app/.next/dev/lock"),
    join(repoRoot, "apps/web-app/.next/dev/lock"),
    join(repoRoot, "apps/landing-page/.next/dev/lock"),
  ];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const pids = await nextDevLockPids(repoRoot);
    let hasLivePid = false;
    for (const pid of pids) {
      const result = await runCapture(["kill", "-0", String(pid)], repoRoot);
      if (result.exitCode === 0) hasLivePid = true;
    }
    if (!hasLivePid) await rm(file, { force: true });
  }
}
