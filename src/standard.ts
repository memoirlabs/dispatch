import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { commandExists, formatCommand, runResolved } from "./run.ts";
import { installCommand, runPackageScript } from "./project.ts";
import type { DispatchContext, PackageJson, ResolvedCommand } from "./types.ts";

export const PACKAGE_NAME = "@memoir/dispatch";
export const DISPATCH_BIN = "dispatch";

const TEST_PATTERNS = [
  ".test.js",
  ".test.jsx",
  ".test.ts",
  ".test.tsx",
  ".spec.js",
  ".spec.jsx",
  ".spec.ts",
  ".spec.tsx",
];

const SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "storybook-static",
]);

const CLEAN_TARGETS = [
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".output",
  ".vite",
  ".cache",
  "storybook-static",
  "tsconfig.tsbuildinfo",
];

const AGENTS_PATH = "AGENTS.md";
const DISPATCH_AGENTS_PATH = "dispatch/agents/default.md";
const DISPATCH_AGENTS_README_PATH = "dispatch/agents/README.md";
const DISPATCH_ASTRO_AGENTS_PATH = "dispatch/agents/bun-astro.md";
const DISPATCH_NEXT_AGENTS_PATH = "dispatch/agents/bun-next.md";
const DISPATCH_QUANT_AGENTS_PATH = "dispatch/agents/quant.md";
const DISPATCH_SCRIPTS_README_PATH = "dispatch/scripts/README.md";
const DISPATCH_SVELTE_AGENTS_PATH = "dispatch/agents/bun-svelte.md";
const DISPATCH_COMMANDS_README_PATH = "dispatch/commands/README.md";
const DISPATCH_README_PATH = "dispatch/README.md";
const AGENTS_START_MARKER = "<!-- dispatch:agents:start -->";
const AGENTS_END_MARKER = "<!-- dispatch:agents:end -->";
const PACKAGE_SCRIPTS_TEMPLATE = readPackageScriptsTemplate();
const OPTIONAL_PACKAGE_SCRIPT_NAMES = ["convex", "convex:dev", "convex:deploy"];

type ScriptResolution = {
  command?: ResolvedCommand;
  managed: boolean;
};

type ManagedScriptUpdate = {
  changes: string[];
};

type TestMode = "once" | "watch" | "coverage";
type TestRunner = "vitest" | "jest" | "node" | null;

export function managedScripts(): Record<string, string> {
  return { ...PACKAGE_SCRIPTS_TEMPLATE };
}

export function isDispatchInitialized(context: DispatchContext): boolean {
  const scripts = context.packageJson.scripts ?? {};
  const hasManagedWorkflowScript = Object.keys(PACKAGE_SCRIPTS_TEMPLATE)
    .some((name) => scripts[name] && isManagedScript(scripts[name], name));

  return (
    context.packageJson.name === PACKAGE_NAME ||
    (hasPackage(context.packageJson, PACKAGE_NAME) && hasManagedWorkflowScript)
  );
}

export function updateManagedPackageScripts(packageJson: PackageJson, _force = false): ManagedScriptUpdate {
  packageJson.scripts = { ...packageJson.scripts };

  const changes: string[] = [];

  for (const [name, wanted] of Object.entries(PACKAGE_SCRIPTS_TEMPLATE)) {
    const current = packageJson.scripts[name];
    if (current !== wanted) {
      packageJson.scripts[name] = wanted;
      changes.push(`package.json scripts.${name}`);
    }
  }

  return { changes };
}

export function scriptIfUnmanaged(context: DispatchContext, scriptName: string, args: string[]): ScriptResolution {
  const script = context.packageJson.scripts?.[scriptName];
  if (!script) return { managed: false };
  if (!isManagedScript(script, scriptName)) {
    return {
      managed: false,
      command: { cmd: runPackageScript(context.packageManager, scriptName, args), cwd: context.repoRoot },
    };
  }

  return { managed: true };
}

export function isManagedScript(script: string, scriptName?: string): boolean {
  const normalized = script.trim().replace(/\s+/g, " ");
  const expected = scriptName ? managedScripts()[scriptName] : undefined;
  if (expected && normalized === expected) return true;
  if (scriptName && normalized === packageScriptCommand(scriptName)) return true;
  if (/^bun run src\/cli\.ts\s+(ci|check|lint|typecheck|test|clean|build|dev|start|preview|sync|sync-careful|port|portclean|processes|doctor|update|update-all|deploy|dp|menu|convex|scripts|ops|fix|verify)(\s|$)/.test(normalized)) return true;
  return /^dispatch\s+(ci|check|lint|typecheck|test|clean|build|dev|start|preview|sync|sync-careful|port|portclean|processes|doctor|update|update-all|deploy|dp|menu|convex|scripts|ops|fix|verify)(\s|$)/.test(normalized);
}

export async function lintCommandFor(context: DispatchContext, args: string[]): Promise<ResolvedCommand | void> {
  const script = scriptIfUnmanaged(context, "lint", args);
  if (script.command) return script.command;

  const { rest, passthrough } = splitPassthrough(args);
  const fix = rest.includes("--fix");
  const forwarded = rest.filter((arg) => arg !== "--fix");
  const oxlint = packageOwnedBin("oxlint");
  if (!oxlint) {
    console.error(`Oxlint is not installed with ${PACKAGE_NAME}. Run your package manager install command and try again.`);
    process.exit(3);
  }

  const cmd = [
    oxlint,
    ".",
    "--config",
    "./.oxlintrc.json",
    "--no-error-on-unmatched-pattern",
    ...(fix ? ["--fix"] : []),
    ...(process.env.GITHUB_ACTIONS === "true" ? ["--format", "github"] : []),
    ...forwarded,
    ...passthrough,
  ];
  return { cmd, cwd: context.repoRoot };
}

export async function typecheckCommandFor(context: DispatchContext, args: string[]): Promise<ResolvedCommand | void> {
  const script = scriptIfUnmanaged(context, "typecheck", args);
  if (script.command) return script.command;

  if (!await hasTypeScriptEvidence(context.repoRoot)) {
    if (!context.quiet) console.log("TypeScript: no TypeScript evidence found, skipping.");
    return;
  }

  const tsc = repoLocalBin(context.repoRoot, "tsc");
  if (!tsc) {
    console.error("TypeScript files were detected, but typescript is not installed. Add it to devDependencies and install dependencies.");
    process.exit(3);
  }

  const { passthrough } = splitPassthrough(args);
  return { cmd: [tsc, "--noEmit", "--pretty", "false", ...passthrough], cwd: context.repoRoot };
}

export async function testCommandFor(context: DispatchContext, args: string[]): Promise<ResolvedCommand | void> {
  const script = scriptIfUnmanaged(context, "test", args);
  if (script.command) return script.command;

  const { rest, passthrough } = splitPassthrough(args);
  const mode: TestMode = rest.includes("--watch") ? "watch" : rest.includes("--coverage") ? "coverage" : "once";
  if (mode === "watch" && process.env.CI === "true") {
    console.error("Watch mode is not supported in CI. Run dispatch test without --watch.");
    process.exit(2);
  }

  const runner = await detectTestRunner(context);
  if (!runner) {
    if (!context.quiet) console.log("Tests: no supported test runner or test files found, skipping.");
    return;
  }

  if (runner === "node" && mode !== "once") {
    if (!context.quiet) console.log(`Tests: node --test does not support ${mode} in this base package, skipping.`);
    return;
  }

  if (runner === "vitest") {
    const vitest = repoLocalBin(context.repoRoot, "vitest");
    if (!vitest) return missingRunner("vitest");
    return {
      cmd: [vitest, ...(mode === "watch" ? [] : ["run"]), ...(mode === "coverage" ? ["--coverage"] : []), ...passthrough],
      cwd: context.repoRoot,
    };
  }

  if (runner === "jest") {
    const jest = repoLocalBin(context.repoRoot, "jest");
    if (!jest) return missingRunner("jest");
    return {
      cmd: [jest, ...(mode === "watch" ? ["--watch"] : []), ...(mode === "coverage" ? ["--coverage"] : []), ...passthrough],
      cwd: context.repoRoot,
    };
  }

  if (!await commandExists("node", context.repoRoot)) {
    console.error("Test files were detected, but node is not available for node --test.");
    process.exit(3);
  }
  return { cmd: ["node", "--test", ...passthrough], cwd: context.repoRoot };
}

export async function runCheck(context: DispatchContext, args: string[]): Promise<void> {
  const script = scriptIfUnmanaged(context, "check", args);
  if (script.command) return runStep(context, "check", script.command);

  await runStandardSteps(context, [
    ["lint", await lintCommandFor(context, [])],
    ["typecheck", await typecheckCommandFor(context, [])],
    ["test", await testCommandFor(context, [])],
  ]);
}

export async function runCi(context: DispatchContext, args: string[]): Promise<void> {
  const script = scriptIfUnmanaged(context, "ci", args);
  if (script.command) return runStep(context, "ci", script.command);

  const steps: [string, ResolvedCommand | void][] = [
    ["lint", await lintCommandFor(context, [])],
    ["typecheck", await typecheckCommandFor(context, [])],
    ["test", await testCommandFor(context, [])],
  ];

  const build = context.packageJson.scripts?.build;
  if (build && !isManagedScript(build, "build")) {
    steps.push(["build", { cmd: runPackageScript(context.packageManager, "build"), cwd: context.repoRoot }]);
  }

  await runStandardSteps(context, steps);
}

export async function cleanStandardArtifacts(context: DispatchContext, args: string[]): Promise<void> {
  const script = scriptIfUnmanaged(context, "clean", args);
  if (script.command) {
    await runStep(context, "clean", script.command);
    return;
  }

  const dryRun = args.includes("--dry-run");
  const targets = new Set(CLEAN_TARGETS);
  for (const target of await collectTsBuildInfo(context.repoRoot)) targets.add(target);

  let removed = 0;
  for (const target of [...targets].sort()) {
    const path = join(context.repoRoot, target);
    if (!existsSync(path)) continue;
    if (dryRun) {
      console.log(`[dry-run] rm -rf ${target}`);
      continue;
    }
    await rm(path, { recursive: true, force: true });
    removed += 1;
    console.log(`removed ${target}`);
  }

  if (!removed && !dryRun && !context.quiet) console.log("Clean: no generated artifacts found.");
}

export async function initStandardRepo(context: DispatchContext, args: string[]): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const noInstall = args.includes("--no-install");
  const changes: string[] = [];
  const conflicts: string[] = [];
  let needsInstall = false;
  const packageJson = { ...context.packageJson, scripts: { ...context.packageJson.scripts } };

  if (packageJson.name !== PACKAGE_NAME) {
    packageJson.devDependencies = { ...packageJson.devDependencies };
    if (!packageJson.devDependencies[PACKAGE_NAME] && !packageJson.dependencies?.[PACKAGE_NAME]) {
      packageJson.devDependencies[PACKAGE_NAME] = `^${packageVersion()}`;
      changes.push(`package.json devDependencies.${PACKAGE_NAME}`);
      needsInstall = true;
    }
  }

  const scriptUpdate = updateManagedPackageScripts(packageJson, force);
  changes.push(...scriptUpdate.changes);

  if (conflicts.length) {
    console.error(conflicts.join("\n\n"));
    process.exit(4);
  }

  const agentsPlan = planAgentInstructionsUpdate(context);
  if (agentsPlan.conflict) {
    console.error(agentsPlan.conflict);
    process.exit(4);
  }
  if (agentsPlan.content !== undefined) changes.push(AGENTS_PATH);

  const dispatchWorkspacePlan = planDispatchWorkspaceUpdate(context);
  if (dispatchWorkspacePlan.conflicts.length) {
    console.error(dispatchWorkspacePlan.conflicts.join("\n\n"));
    process.exit(4);
  }
  changes.push(...dispatchWorkspacePlan.files.map((file) => file.path));

  for (const [name, wanted] of Object.entries(await recommendedRepoScripts(context))) {
    const current = packageJson.scripts?.[name];
    if (current && !isManagedScript(current, name)) continue;
    if (current !== wanted) {
      packageJson.scripts![name] = wanted;
      changes.push(`package.json scripts.${name}`);
    }
  }

  const packageJsonPath = join(context.repoRoot, "package.json");
  if (changes.some((change) => change.startsWith("package.json")) && !dryRun) {
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  }

  await writeManagedFile(context, ".oxlintrc.json", JSON.stringify(rootOxlintConfig(), null, 2) + "\n", { force, dryRun, changes });
  await writeManagedFile(context, ".github/workflows/ci.yml", githubWorkflow(context), { force, dryRun, changes });
  if (agentsPlan.content !== undefined && !dryRun) {
    await writeFile(join(context.repoRoot, AGENTS_PATH), agentsPlan.content);
  }
  if (dispatchWorkspacePlan.files.length && !dryRun) {
    await writeManagedFiles(context, dispatchWorkspacePlan.files);
  }

  if (!changes.length) {
    console.log("dispatch init: no changes needed.");
    return;
  }

  console.log(dryRun ? "dispatch init dry run:" : "dispatch init updated:");
  for (const change of changes) console.log(`  ${change}`);

  if (needsInstall) {
    const command = installCommand(context.packageManager);
    if (dryRun || noInstall) {
      console.log("");
      console.log(`Next install step: ${formatCommand(command)}`);
      return;
    }

    console.log("");
    console.log(`$ ${formatCommand(command)}`);
    const exitCode = await runResolved({ cmd: command, cwd: context.repoRoot });
    if (exitCode !== 0) process.exit(exitCode);
  }
}

async function recommendedRepoScripts(context: DispatchContext): Promise<Record<string, string>> {
  const scripts: Record<string, string> = {};

  if (await hasConvexEvidence(context)) {
    scripts.convex = packageScriptCommand("convex");
    scripts["convex:dev"] = packageScriptCommand("convex:dev");
    scripts["convex:deploy"] = packageScriptCommand("convex:deploy");
  }

  return scripts;
}

async function hasConvexEvidence(context: DispatchContext): Promise<boolean> {
  return (
    hasPackage(context.packageJson, "convex") ||
    existsSync(join(context.repoRoot, "convex")) ||
    existsSync(join(context.repoRoot, "convex.json")) ||
    await hasFileMatching(context.repoRoot, (path) => relative(context.repoRoot, path).startsWith(`convex${sep}`))
  );
}

function hasDeployEvidence(context: DispatchContext): boolean {
  const scripts = context.packageJson.scripts ?? {};
  return Boolean(
    context.config.commands?.deploy ||
    context.config.deployScript ||
    context.config.scriptAliases?.deploy?.length ||
    scripts.deploy ||
    (scripts.dp && !isManagedScript(scripts.dp, "dp"))
  );
}

export async function doctorStandardRepo(context: DispatchContext): Promise<void> {
  const scripts = context.packageJson.scripts ?? {};
  const managedScriptNames = Object.keys(managedScripts());
  const missingScripts = managedScriptNames.filter((name) => !scripts[name]);
  const customScripts = managedScriptNames.filter((name) => scripts[name] && !isManagedScript(scripts[name], name));
  const oxlintConfig = existsSync(join(context.repoRoot, ".oxlintrc.json"));
  const oxlintBase = existsSync(join(packageRoot(), "oxlint/base.json"));
  const ciWorkflow = existsSync(join(context.repoRoot, ".github/workflows/ci.yml"));
  const agentInstructions = agentInstructionsStatus(context);
  const hasTs = await hasTypeScriptEvidence(context.repoRoot);
  const hasTypescript = Boolean(repoLocalBin(context.repoRoot, "tsc"));
  const testRunner = await detectTestRunner(context);
  const build = scripts.build;

  console.log("dispatch doctor");
  console.log("");
  console.log(`Package manager: ${context.packageManager}`);
  console.log(`Scripts: ${scriptsStatus(missingScripts, customScripts)}`);
  console.log(`Installed package: ${hasPackage(context.packageJson, PACKAGE_NAME) || context.packageJson.name === PACKAGE_NAME ? "OK" : `missing ${PACKAGE_NAME}`}`);
  console.log(`Oxlint config: ${oxlintConfig && oxlintBase ? "OK" : "missing"}`);
  console.log(`TypeScript: ${hasTs ? `detected, ${hasTypescript ? "typescript installed" : "typescript missing"}` : "not detected"}`);
  console.log(`Test runner: ${testRunner ?? "none"}`);
  console.log(`Build script: ${build ? (isManagedScript(build, "build") ? "managed/ignored" : "repo-local build detected") : "none"}`);
  console.log(`CI workflow: ${ciWorkflow ? ".github/workflows/ci.yml" : "missing"}`);
  console.log(`Agent instructions: ${agentInstructions}`);
  console.log(`Dispatch folder: ${dispatchWorkspaceStatus(context)}`);
}

function scriptsStatus(missingScripts: string[], customScripts: string[]): string {
  const parts: string[] = [];
  if (missingScripts.length) parts.push(`missing ${missingScripts.join(", ")}`);
  if (customScripts.length) parts.push(`custom ${customScripts.join(", ")}`);
  return parts.length ? parts.join("; ") : "OK";
}

async function runStandardSteps(context: DispatchContext, steps: [string, ResolvedCommand | void][]): Promise<void> {
  for (const [name, command] of steps) {
    if (!command) continue;
    await runStep(context, name, command);
  }
}

async function runStep(context: DispatchContext, name: string, command: ResolvedCommand): Promise<void> {
  if (!context.quiet) console.log(`\n[dispatch] ${name}: ${formatCommand(command.cmd)}`);
  const exitCode = await runResolved({ ...command, cwd: command.cwd ?? context.repoRoot });
  if (exitCode !== 0) process.exit(exitCode);
}

function repoLocalBin(repoRoot: string, name: string): string | null {
  const suffix = process.platform === "win32" ? ".cmd" : "";
  const path = join(repoRoot, "node_modules/.bin", `${name}${suffix}`);
  return existsSync(path) ? path : null;
}

function packageOwnedBin(name: string): string | null {
  const suffix = process.platform === "win32" ? ".cmd" : "";
  const candidates = [
    join(packageRoot(), "node_modules/.bin", `${name}${suffix}`),
    join(packageRoot(), "../../.bin", `${name}${suffix}`),
    join(packageRoot(), `../../${name}/bin/${name}${suffix}`),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

function packageRoot(): string {
  return dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
}

function packageVersion(): string {
  const version = packageSelfJson().version;
  return typeof version === "string" ? version : "0.1.0";
}

function packageSelfJson(): PackageJson {
  try {
    return JSON.parse(readFileSync(join(packageRoot(), "package.json"), "utf8")) as PackageJson;
  } catch {
    return {};
  }
}

function readPackageScriptsTemplate(): Record<string, string> {
  try {
    const raw = readFileSync(join(packageRoot(), "templates/package-scripts.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
}

function splitPassthrough(args: string[]): { rest: string[]; passthrough: string[] } {
  const separator = args.indexOf("--");
  if (separator === -1) return { rest: args, passthrough: [] };
  return { rest: args.slice(0, separator), passthrough: args.slice(separator + 1) };
}

async function hasTypeScriptEvidence(repoRoot: string): Promise<boolean> {
  if (existsSync(join(repoRoot, "tsconfig.json")) || existsSync(join(repoRoot, "tsconfig.base.json"))) return true;
  return await hasFileMatching(repoRoot, (path) => {
    const rel = relative(repoRoot, path);
    return (
      /^(src|app)\/.*\.tsx?$/.test(rel) ||
      /^packages\/[^/]+\/tsconfig\.json$/.test(rel)
    );
  });
}

async function detectTestRunner(context: DispatchContext): Promise<TestRunner> {
  if (hasPackage(context.packageJson, "vitest") || repoLocalBin(context.repoRoot, "vitest")) return "vitest";
  if (hasPackage(context.packageJson, "jest") || repoLocalBin(context.repoRoot, "jest")) return "jest";
  if (await hasTestFiles(context.repoRoot)) return "node";
  return null;
}

export function hasPackage(packageJson: PackageJson, name: string): boolean {
  return Boolean(
    packageJson.dependencies?.[name] ||
    packageJson.devDependencies?.[name] ||
    packageJson.optionalDependencies?.[name] ||
    packageJson.peerDependencies?.[name]
  );
}

async function hasTestFiles(repoRoot: string): Promise<boolean> {
  return await hasFileMatching(repoRoot, (path) => {
    const rel = relative(repoRoot, path);
    return TEST_PATTERNS.some((suffix) => rel.endsWith(suffix)) || rel.includes("/__tests__/");
  });
}

async function hasFileMatching(root: string, predicate: (path: string) => boolean): Promise<boolean> {
  async function visit(directory: string): Promise<boolean> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return false;
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (await visit(path)) return true;
      } else if (entry.isFile() && predicate(path)) {
        return true;
      }
    }

    return false;
  }

  return visit(root);
}

async function collectTsBuildInfo(repoRoot: string): Promise<string[]> {
  const targets: string[] = [];
  await collectMatchingFiles(repoRoot, (path) => path.endsWith(".tsbuildinfo"), targets);
  return targets.map((path) => relative(repoRoot, path));
}

async function collectMatchingFiles(root: string, predicate: (path: string) => boolean, targets: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) await collectMatchingFiles(path, predicate, targets);
    else if (entry.isFile() && predicate(path)) targets.push(path);
  }
}

function missingRunner(name: string): void {
  console.error(`${name} is declared but its binary was not found in node_modules/.bin. Install dependencies and try again.`);
  process.exit(3);
}

async function writeManagedFile(
  context: DispatchContext,
  relativePath: string,
  content: string,
  options: { force: boolean; dryRun: boolean; changes: string[] },
): Promise<void> {
  const path = join(context.repoRoot, relativePath);
  if (existsSync(path) && !options.force) return;
  options.changes.push(relativePath);
  if (options.dryRun) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function writeManagedFiles(context: DispatchContext, files: ManagedFilePlan[]): Promise<void> {
  for (const file of files) {
    const path = join(context.repoRoot, file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.content);
  }
}

type AgentInstructionsPlan = {
  content?: string;
  conflict?: string;
};

type ManagedFilePlan = {
  path: string;
  content: string;
};

type DispatchWorkspacePlan = {
  files: ManagedFilePlan[];
  conflicts: string[];
};

export function planAgentInstructionsUpdate(context: DispatchContext): AgentInstructionsPlan {
  const path = join(context.repoRoot, AGENTS_PATH);
  const block = dispatchAgentInstructions(context);

  if (!existsSync(path)) return { content: `${block}\n` };

  const current = readFileSync(path, "utf8");
  const next = upsertManagedBlock(current, block, AGENTS_PATH);
  if (typeof next === "string") {
    return next === current ? {} : { content: next };
  }

  return { conflict: next.conflict };
}

export function agentInstructionsStatus(context: DispatchContext): string {
  const path = join(context.repoRoot, AGENTS_PATH);
  if (!existsSync(path)) return "missing";

  const current = readFileSync(path, "utf8");
  const start = current.indexOf(AGENTS_START_MARKER);
  const end = current.indexOf(AGENTS_END_MARKER);
  if (start === -1 && end === -1) return "missing managed block";
  if (start === -1 || end === -1 || end < start) return "malformed managed block";

  return current.includes(dispatchAgentInstructions(context)) ? "OK" : "stale";
}

export function dispatchWorkspaceStatus(context: DispatchContext): string {
  const plan = planDispatchWorkspaceUpdate(context);
  if (plan.conflicts.length) return `malformed (${plan.conflicts.length} path conflict${plan.conflicts.length === 1 ? "" : "s"})`;
  if (!plan.files.length) return "OK";

  const missing = plan.files.filter((file) => !existsSync(join(context.repoRoot, file.path)));
  const stale = plan.files.length - missing.length;
  const parts: string[] = [];
  if (missing.length) parts.push(`missing ${missing.map((file) => file.path).join(", ")}`);
  if (stale) parts.push(`stale ${stale} file${stale === 1 ? "" : "s"}`);
  return parts.join("; ");
}

export function planDispatchWorkspaceUpdate(context: DispatchContext): DispatchWorkspacePlan {
  const files = dispatchWorkspaceFiles(context);
  const plan: DispatchWorkspacePlan = { files: [], conflicts: [] };

  for (const [relativePath, content] of Object.entries(files)) {
    const conflict = managedFilePathConflict(context.repoRoot, relativePath);
    if (conflict) {
      plan.conflicts.push(conflict);
      continue;
    }

    const path = join(context.repoRoot, relativePath);
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      plan.files.push({ path: relativePath, content });
    }
  }

  return plan;
}

function managedFilePathConflict(repoRoot: string, relativePath: string): string | null {
  const parts = relativePath.split("/");
  let current = repoRoot;

  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]);
    if (!existsSync(current)) continue;

    const stats = statSync(current);
    const isLeaf = index === parts.length - 1;
    if (!isLeaf && !stats.isDirectory()) {
      return `Conflict: ${parts.slice(0, index + 1).join("/")} exists but is not a directory. Move it before running dispatch init.`;
    }
    if (isLeaf && !stats.isFile()) {
      return `Conflict: ${relativePath} exists but is not a file. Move it before running dispatch init.`;
    }
  }

  return null;
}

export function upsertManagedBlock(current: string, block: string, filename = AGENTS_PATH): string | { conflict: string } {
  const start = current.indexOf(AGENTS_START_MARKER);
  const end = current.indexOf(AGENTS_END_MARKER);

  if (start === -1 && end === -1) {
    const separator = current.endsWith("\n") ? "\n" : "\n\n";
    return `${current}${separator}${block}\n`;
  }

  if (start === -1 || end === -1 || end < start) {
    return {
      conflict: `Conflict: ${filename} contains a partial Dispatch agent instructions block.\nFix the ${AGENTS_START_MARKER} / ${AGENTS_END_MARKER} markers, then run dispatch init again.`,
    };
  }

  const afterEnd = end + AGENTS_END_MARKER.length;
  const next = `${current.slice(0, start)}${block}${current.slice(afterEnd)}`;
  return next.endsWith("\n") ? next : `${next}\n`;
}

function dispatchAgentInstructions(context: DispatchContext): string {
  const packageScripts = context.packageJson.scripts ?? {};
  const hasBuild = Boolean(packageScripts.build && !isManagedScript(packageScripts.build, "build"));
  const hasDeploy = hasDeployEvidence(context);

  return `${AGENTS_START_MARKER}
## Dispatch

This repo uses Dispatch for common project workflows.

Read \`${DISPATCH_AGENTS_PATH}\` before changing Dispatch workflows or running repo automation.

Use these commands when they are relevant:

- \`dispatch lint\` for lint checks
- \`dispatch typecheck\` for TypeScript checks
- \`dispatch test\` for tests
- \`dispatch check\` for the standard local confidence path
- \`dispatch ci\` for the CI confidence path${hasBuild ? "\n- `dispatch build` or the repo's existing build script for production builds" : ""}${hasDeploy ? "\n- `dispatch deploy` for deployments" : ""}

Setup and maintenance:

- \`dispatch init\` refreshes Dispatch-managed repo files and scripts.
- \`dispatch doctor\` prints Dispatch diagnostics for this repo.
- Project-specific Dispatch command files live in \`dispatch/commands\`.
- The package manager detected for this repo is \`${context.packageManager}\`.

Respect project-local scripts, command files, and config overrides. Dispatch resolves commands in this order: config override, project command file, package script, then built-in command.
${AGENTS_END_MARKER}`;
}

function dispatchWorkspaceFiles(context: DispatchContext): Record<string, string> {
  return {
    [DISPATCH_README_PATH]: dispatchWorkspaceReadme(),
    [DISPATCH_AGENTS_README_PATH]: dispatchAgentsReadme(),
    [DISPATCH_AGENTS_PATH]: dispatchAgentOption(context),
    [DISPATCH_SVELTE_AGENTS_PATH]: dispatchBunSvelteAgentOption(),
    [DISPATCH_NEXT_AGENTS_PATH]: dispatchBunNextAgentOption(),
    [DISPATCH_ASTRO_AGENTS_PATH]: dispatchBunAstroAgentOption(),
    [DISPATCH_QUANT_AGENTS_PATH]: dispatchQuantAgentOption(),
    [DISPATCH_COMMANDS_README_PATH]: dispatchCommandsReadme(),
    [DISPATCH_SCRIPTS_README_PATH]: dispatchScriptsReadme(),
    ...dispatchScriptFiles(),
  };
}

function dispatchWorkspaceReadme(): string {
  return `# Dispatch

This folder is the visible Dispatch workspace for this repo.

- \`agents/default.md\` contains the Dispatch agent instruction option referenced from the root \`AGENTS.md\`.
- \`agents/\` contains optional agent instruction profiles for common project types.
- \`scripts/\` contains the package-script entrypoints generated by Dispatch.
- \`commands/\` is where repo-specific Dispatch command files live.

Run \`dispatch doctor\` after editing this folder to check whether the root agent hook and Dispatch workspace are current.
`;
}

function dispatchAgentsReadme(): string {
  return `# Dispatch Agent Profiles

Use these files as project-specific agent instruction options:

- \`default.md\` is the base Dispatch workflow profile.
- \`bun-svelte.md\` is for Bun Svelte or SvelteKit apps.
- \`bun-next.md\` is for Bun Next.js apps.
- \`bun-astro.md\` is for Bun Astro sites and apps.
- \`quant.md\` is for research, trading, backtesting, and analysis-heavy projects.

The root \`AGENTS.md\` points at \`default.md\`. If a repo should use a more specific profile, copy the relevant guidance into the root managed block only through \`dispatch init\` changes, or add a short user-authored note outside the managed block.
`;
}

function dispatchAgentOption(context: DispatchContext): string {
  const packageScripts = context.packageJson.scripts ?? {};
  const hasBuild = Boolean(packageScripts.build && !isManagedScript(packageScripts.build, "build"));
  const hasDeploy = hasDeployEvidence(context);

  return `# Dispatch Agent Instructions

This repo uses Dispatch for common project workflows. Prefer the repo scripts that call Dispatch instead of invoking lower-level tools directly.

## Commands

- \`dispatch lint\` runs lint checks.
- \`dispatch typecheck\` runs TypeScript checks.
- \`dispatch test\` runs tests.
- \`dispatch check\` runs the standard local confidence path.
- \`dispatch ci\` runs the CI confidence path.${hasBuild ? "\n- `dispatch build` or the repo's existing build script runs production builds." : ""}${hasDeploy ? "\n- `dispatch deploy` runs deployments." : ""}

## Setup

- \`dispatch init\` refreshes Dispatch-managed repo files and scripts.
- \`dispatch doctor\` prints Dispatch diagnostics for this repo.
- The package manager detected for this repo is \`${context.packageManager}\`.

## Project Commands

Put repo-specific Dispatch command files in \`dispatch/commands/<name>.ts\`. For example, \`dispatch/commands/sync-db.ts\` can be run with \`dispatch sync-db\`.

Avoid creating command files with the same name as built-in Dispatch commands unless the repo intentionally wants to override that command.

Dispatch resolves commands in this order: config override, project command file, package script, then built-in command. Respect project-local scripts, command files, and config overrides.
`;
}

function dispatchBunSvelteAgentOption(): string {
  return `# Bun Svelte Agent Instructions

Use this profile for Bun Svelte and SvelteKit projects.

## Workflow

- Use Bun for package scripts and dependency operations unless the repo clearly documents another package manager.
- Prefer \`dispatch check\` before handing off changes.
- Use \`dispatch typecheck\` for TypeScript and Svelte type validation when the repo has Svelte tooling installed.
- Use \`dispatch test\` for unit or component tests.

## Svelte Guidance

- Keep route behavior in the existing SvelteKit structure: \`src/routes\`, \`src/lib\`, and project-local modules.
- Preserve server/client boundaries. Do not move browser-only code into server modules or server secrets into client modules.
- Prefer existing stores, load functions, actions, and form patterns over introducing new state libraries.
- Keep component styles scoped and consistent with the repo's current CSS approach.

## Verification

- Run \`dispatch check\` for normal changes.
- For UI changes, also run the app locally and verify the changed route in a browser when feasible.
`;
}

function dispatchBunNextAgentOption(): string {
  return `# Bun Next Agent Instructions

Use this profile for Bun Next.js projects.

## Workflow

- Use Bun for package scripts and dependency operations unless the repo clearly documents another package manager.
- Prefer \`dispatch check\` before handing off changes.
- Use \`dispatch typecheck\` for TypeScript checks and \`dispatch test\` for tests.

## Next.js Guidance

- Respect the App Router and Server Component boundaries already used by the repo.
- Keep server-only code out of Client Components. Add \`"use client"\` only when interactivity or browser APIs require it.
- Use Server Actions, route handlers, caching, and revalidation in the style already present in the codebase.
- Preserve existing auth, data-fetching, environment variable, and deployment conventions.

## Verification

- Run \`dispatch check\` for normal changes.
- For page or component changes, run the app locally and verify the affected route in a browser when feasible.
`;
}

function dispatchBunAstroAgentOption(): string {
  return `# Bun Astro Agent Instructions

Use this profile for Bun Astro projects.

## Workflow

- Use Bun for package scripts and dependency operations unless the repo clearly documents another package manager.
- Prefer \`dispatch check\` before handing off changes.
- Use \`dispatch typecheck\` and \`dispatch test\` when the repo has those toolchains installed.

## Astro Guidance

- Keep content, pages, layouts, and components in the repo's existing Astro structure.
- Use islands intentionally. Add client hydration directives only when browser interactivity requires them.
- Preserve existing content collections, integrations, image handling, and deployment settings.
- Keep generated or fetched content reproducible and documented.

## Verification

- Run \`dispatch check\` for normal changes.
- For visual or routing changes, run the Astro dev server and verify the affected page in a browser when feasible.
`;
}

function dispatchQuantAgentOption(): string {
  return `# Quant Agent Instructions

Use this profile for quantitative research, trading, backtesting, and analysis-heavy projects.

## Workflow

- Keep research code reproducible. Record data sources, time ranges, filters, and assumptions near the analysis.
- Separate raw data, derived data, notebooks, scripts, and reports using the repo's existing structure.
- Prefer deterministic scripts over one-off manual analysis.
- Treat financial calculations as high-risk. Check units, time zones, fees, slippage, lookahead bias, survivorship bias, and missing data before trusting results.

## Implementation

- Keep strategy logic, data loading, feature engineering, simulation, and reporting separately testable.
- Avoid changing historical data or cached research outputs unless the task requires regeneration.
- Add focused tests around formulas, date windows, joins, and edge cases.
- Do not add live trading behavior, credentials, or network execution paths unless explicitly requested.

## Verification

- Run \`dispatch check\` when available.
- For research changes, run the smallest deterministic backtest or notebook/script slice that proves the changed logic.
- Summarize residual data-quality limits and assumptions in the handoff.
`;
}

function dispatchCommandsReadme(): string {
  return `# Dispatch Commands

Add repo-specific Dispatch command files here.

Examples:

\`\`\`ts
export default ["git", "fetch", "origin"];
\`\`\`

\`\`\`ts
export default async () => {
  const proc = Bun.spawn(["git", "status", "--short"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) process.exit(exitCode);
};
\`\`\`

A file named \`dispatch/commands/sync-db.ts\` is available as \`dispatch sync-db\`.
`;
}

function dispatchScriptsReadme(): string {
  const scripts = dispatchScriptNames()
    .map((name) => `- \`${scriptFilePath(name)}\` runs \`dispatch ${dispatchScriptArgs(name).join(" ")}\`.`)
    .join("\n");

  return `# Dispatch Scripts

These files are generated package-script entrypoints.

${scripts}

The generated \`package.json\` scripts call these files with \`bun run\`. Each file delegates to the Dispatch CLI so project scripts are visible in this folder without overriding built-in Dispatch commands.

Do not put built-in command overrides here. Use \`dispatch/commands/<name>.ts\` only when the repo intentionally wants \`dispatch <name>\` to replace a built-in command.
`;
}

function dispatchScriptFiles(): Record<string, string> {
  return Object.fromEntries(
    dispatchScriptNames().map((name) => [scriptFilePath(name), dispatchScriptFile(name)]),
  );
}

function dispatchScriptNames(): string[] {
  return [...Object.keys(PACKAGE_SCRIPTS_TEMPLATE), ...OPTIONAL_PACKAGE_SCRIPT_NAMES];
}

function packageScriptCommand(name: string): string {
  return `bun run ${scriptFilePath(name)}`;
}

function scriptFilePath(name: string): string {
  return `dispatch/scripts/${name.replaceAll(":", "-")}.ts`;
}

function dispatchScriptFile(name: string): string {
  const [command, ...defaultArgs] = dispatchScriptArgs(name);
  return `#!/usr/bin/env bun

const command = ${JSON.stringify(command)};
const defaultArgs = ${JSON.stringify(defaultArgs)};
const args = process.argv.slice(2);
const suffix = process.platform === "win32" ? ".cmd" : "";
const localDispatch = \`\${process.cwd()}/node_modules/.bin/dispatch\${suffix}\`;
const dispatchBin = await Bun.file(localDispatch).exists() ? localDispatch : "dispatch";

const proc = Bun.spawn([dispatchBin, command, ...defaultArgs, ...args], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(await proc.exited);
`;
}

function dispatchScriptArgs(name: string): string[] {
  return name.split(":");
}

function rootOxlintConfig(): Record<string, unknown> {
  return {
    $schema: `./node_modules/${PACKAGE_NAME}/oxlint/configuration_schema.json`,
    extends: [`./node_modules/${PACKAGE_NAME}/oxlint/base.json`],
    ignorePatterns: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      ".turbo/**",
      ".next/**",
      ".nuxt/**",
      ".svelte-kit/**",
      ".output/**",
      ".vite/**",
      ".cache/**",
      "storybook-static/**",
      "*.min.*",
      "**/*.generated.*",
      "**/generated/**",
    ],
    options: {
      reportUnusedDisableDirectives: "warn",
      respectEslintDisableDirectives: true,
    },
    overrides: [
      {
        files: [
          "**/*.test.js",
          "**/*.test.jsx",
          "**/*.test.ts",
          "**/*.test.tsx",
          "**/*.spec.js",
          "**/*.spec.jsx",
          "**/*.spec.ts",
          "**/*.spec.tsx",
          "**/__tests__/**/*.js",
          "**/__tests__/**/*.jsx",
          "**/__tests__/**/*.ts",
          "**/__tests__/**/*.tsx",
        ],
        env: { jest: true, vitest: true, node: true },
      },
      {
        files: [
          "*.config.js",
          "*.config.ts",
          "*.config.mjs",
          "*.config.cjs",
          "*.config.mts",
          "*.config.cts",
          "**/*.config.js",
          "**/*.config.ts",
          "**/*.config.mjs",
          "**/*.config.cjs",
          "**/*.config.mts",
          "**/*.config.cts",
          "scripts/**/*.js",
          "scripts/**/*.ts",
          "scripts/**/*.mjs",
          "scripts/**/*.cjs",
          "scripts/**/*.mts",
          "scripts/**/*.cts",
        ],
        env: { node: true },
        rules: { "no-console": "off" },
      },
      {
        files: ["**/*.cjs", "**/*.cts"],
        env: { commonjs: true, node: true },
      },
    ],
  };
}

function githubWorkflow(context: DispatchContext): string {
  if (context.packageManager === "pnpm") return pnpmWorkflow();
  if (context.packageManager === "bun") return bunWorkflow();
  if (context.packageManager === "yarn") return yarnWorkflow();
  return npmWorkflow();
}

function pnpmWorkflow(): string {
  return `name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  ci:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup pnpm
        uses: pnpm/action-setup@v6
        with:
          run_install: false

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run CI
        run: pnpm run ci
`;
}

function npmWorkflow(): string {
  return `name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  ci:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run CI
        run: npm run ci
`;
}

function bunWorkflow(): string {
  return `name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  ci:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run CI
        run: bun run ci
`;
}

function yarnWorkflow(): string {
  return `name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  ci:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: yarn

      - name: Install dependencies
        run: yarn install --immutable

      - name: Run CI
        run: yarn ci
`;
}
