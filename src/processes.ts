import { sep } from "node:path";

import { formatCommand, runCapture } from "./run.ts";
import type { DispatchContext } from "./types.ts";

type ProcessInfo = {
  pid: number;
  ppid: number;
  pgid: number;
  stat: string;
  etime: string;
  cpu: number;
  mem: number;
  command: string;
  cwd?: string;
  ports: string[];
  reasons: string[];
};

type ProcessOptions = {
  deep: boolean;
  json: boolean;
  all: boolean;
};

export async function listRepoProcesses(context: DispatchContext, args: string[]): Promise<void> {
  const options = parseProcessArgs(args);
  const processes = await collectProcesses(context, options);

  if (options.json) {
    console.log(JSON.stringify(processes, null, 2));
    return;
  }

  printProcesses(context, processes, options);
}

export async function collectProcesses(context: DispatchContext, options: ProcessOptions): Promise<ProcessInfo[]> {
  const ps = await readProcessTable(context.repoRoot);
  const cwdByPid = await readProcessCwds(context.repoRoot);
  const portsByPid = await readListeningPorts(context.repoRoot);
  const deepPids = options.deep ? await readRepoOpenFilePids(context.repoRoot) : new Set<number>();

  for (const process of ps.values()) {
    process.cwd = cwdByPid.get(process.pid);
    process.ports = portsByPid.get(process.pid) ?? [];
    addMatchReasons(process, context.repoRoot, deepPids);
  }

  if (options.all) return [...ps.values()].toSorted(compareProcesses);

  const matched = new Set<number>();
  for (const process of ps.values()) {
    if (process.reasons.length > 0) matched.add(process.pid);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const process of ps.values()) {
      if (matched.has(process.pid)) continue;
      if (matched.has(process.ppid)) {
        process.reasons.push(`child-of:${process.ppid}`);
        matched.add(process.pid);
        changed = true;
      }
    }
  }

  return [...matched]
    .map((pid) => ps.get(pid))
    .filter((process): process is ProcessInfo => Boolean(process))
    .toSorted(compareProcesses);
}

function parseProcessArgs(args: string[]): ProcessOptions {
  return {
    deep: args.includes("--deep"),
    json: args.includes("--json"),
    all: args.includes("--all"),
  };
}

async function readProcessTable(cwd: string): Promise<Map<number, ProcessInfo>> {
  const result = await runCapture(["ps", "-axo", "pid=,ppid=,pgid=,stat=,etime=,pcpu=,pmem=,command="], cwd);
  if (result.exitCode !== 0 && !result.stdout.trim()) {
    throw new Error(`Unable to read process table: ${result.stderr.trim()}`);
  }

  const processes = new Map<number, ProcessInfo>();
  for (const line of result.stdout.split(/\r?\n/)) {
    const process = parseProcessLine(line);
    if (process) processes.set(process.pid, process);
  }
  return processes;
}

export function parseProcessLine(line: string): ProcessInfo | null {
  const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+(.+)$/);
  if (!match) return null;
  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    pgid: Number(match[3]),
    stat: match[4],
    etime: match[5],
    cpu: Number(match[6]),
    mem: Number(match[7]),
    command: match[8],
    ports: [],
    reasons: [],
  };
}

async function readProcessCwds(cwd: string): Promise<Map<number, string>> {
  const result = await runCapture(["lsof", "-nP", "-F", "pcfn", "-d", "cwd"], cwd);
  if (result.exitCode !== 0 && !result.stdout.trim()) return new Map();
  return parseLsofCwds(result.stdout);
}

export function parseLsofCwds(output: string): Map<number, string> {
  const cwdByPid = new Map<number, string>();
  let pid: number | null = null;
  let currentFileIsCwd = false;

  for (const rawLine of output.split(/\r?\n/)) {
    if (!rawLine) continue;
    const tag = rawLine[0];
    const value = rawLine.slice(1);

    if (tag === "p") {
      pid = Number(value);
      currentFileIsCwd = false;
    } else if (tag === "f") {
      currentFileIsCwd = value === "cwd";
    } else if (tag === "n" && pid && currentFileIsCwd) {
      cwdByPid.set(pid, value);
      currentFileIsCwd = false;
    }
  }

  return cwdByPid;
}

async function readListeningPorts(cwd: string): Promise<Map<number, string[]>> {
  const result = await runCapture(["lsof", "-nP", "-F", "pn", "-iTCP", "-sTCP:LISTEN"], cwd);
  if (result.exitCode !== 0 && !result.stdout.trim()) return new Map();
  return parseLsofNamesByPid(result.stdout);
}

async function readRepoOpenFilePids(repoRoot: string): Promise<Set<number>> {
  const result = await runCapture(["lsof", "-nP", "-F", "p", "+D", repoRoot], repoRoot);
  if (result.exitCode !== 0 && !result.stdout.trim()) return new Set();

  const pids = new Set<number>();
  for (const rawLine of result.stdout.split(/\r?\n/)) {
    if (rawLine.startsWith("p")) pids.add(Number(rawLine.slice(1)));
  }
  return pids;
}

export function parseLsofNamesByPid(output: string): Map<number, string[]> {
  const namesByPid = new Map<number, string[]>();
  let pid: number | null = null;

  for (const rawLine of output.split(/\r?\n/)) {
    if (!rawLine) continue;
    const tag = rawLine[0];
    const value = rawLine.slice(1);

    if (tag === "p") {
      pid = Number(value);
      if (!namesByPid.has(pid)) namesByPid.set(pid, []);
    } else if (tag === "n" && pid) {
      namesByPid.get(pid)?.push(value);
    }
  }

  return namesByPid;
}

function addMatchReasons(process: ProcessInfo, repoRoot: string, deepPids: Set<number>): void {
  if (process.cwd && isInsidePath(process.cwd, repoRoot)) process.reasons.push("cwd");
  if (process.command.includes(repoRoot)) process.reasons.push("cmd");
  if (deepPids.has(process.pid)) process.reasons.push("open-file");
}

function isInsidePath(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}${sep}`);
}

function compareProcesses(left: ProcessInfo, right: ProcessInfo): number {
  if (left.pgid !== right.pgid) return left.pgid - right.pgid;
  if (left.ppid !== right.ppid) return left.ppid - right.ppid;
  return left.pid - right.pid;
}

function printProcesses(context: DispatchContext, processes: ProcessInfo[], options: ProcessOptions): void {
  const scan = options.deep ? "cwd, command, descendants, open files" : "cwd, command, descendants";
  console.log(`Repo: ${context.repoRoot}`);
  console.log(`Scan: ${scan}`);
  console.log("");

  if (!processes.length) {
    console.log("No matching processes found.");
    console.log("Try: dispatch processes --deep");
    return;
  }

  const rows = processes.map((process) => ({
    pid: String(process.pid),
    ppid: String(process.ppid),
    pgid: String(process.pgid),
    stat: process.stat,
    etime: process.etime,
    cpu: process.cpu.toFixed(1),
    mem: process.mem.toFixed(1),
    reason: process.reasons.join(","),
    ports: process.ports.map(simplifyPortName).join(","),
    command: process.command,
    cwd: process.cwd && isInsidePath(process.cwd, context.repoRoot) ? relativePath(process.cwd, context.repoRoot) : process.cwd,
  }));

  printTable(rows, ["pid", "ppid", "pgid", "stat", "etime", "cpu", "mem", "reason", "ports", "command"]);

  const cwdRows = rows.filter((row) => row.cwd && row.cwd !== ".");
  if (cwdRows.length) {
    console.log("");
    console.log("CWD:");
    for (const row of cwdRows) console.log(`  ${row.pid.padStart(6)}  ${row.cwd}`);
  }

  console.log("");
  console.log(`Inspect one: ${formatCommand(["ps", "-p", "<pid>", "-o", "pid,ppid,pgid,stat,lstart,etime,pcpu,pmem,command"])}`);
}

function simplifyPortName(name: string): string {
  const match = name.match(/TCP\s+(.+?)\s+\(LISTEN\)/);
  return match?.[1] ?? name;
}

function relativePath(path: string, root: string): string {
  if (path === root) return ".";
  return path.slice(root.length + 1);
}

function printTable<T extends Record<string, string | undefined>>(rows: T[], columns: (keyof T)[]): void {
  const widths = new Map<keyof T, number>();
  for (const column of columns) {
    widths.set(column, Math.max(String(column).length, ...rows.map((row) => (row[column] ?? "").length)));
  }

  console.log(columns.map((column) => String(column).padEnd(widths.get(column) ?? 0)).join("  "));
  console.log(columns.map((column) => "-".repeat(widths.get(column) ?? 0)).join("  "));
  for (const row of rows) {
    console.log(columns.map((column) => (row[column] ?? "").padEnd(widths.get(column) ?? 0)).join("  "));
  }
}
