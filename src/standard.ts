import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { commandExists, formatCommand, runResolved } from "./run.ts";
import { runPackageScript } from "./project.ts";
import type { DispatchContext, PackageJson, ResolvedCommand } from "./types.ts";

export const PACKAGE_NAME = "@memoir/dispatch";
export const DISPATCH_BIN = "dispatch";

const MANAGED_SCRIPTS: Record<string, string> = {
  ci: "dx ci",
  check: "dx check",
  lint: "dx lint",
  "lint:fix": "dx lint --fix",
  typecheck: "dx typecheck",
  test: "dx test",
  "test:watch": "dx test --watch",
  "test:coverage": "dx test --coverage",
  clean: "dx clean",
};

const REPO_OP_SCRIPTS: Record<string, string> = {
  dev: "dx dev",
  sync: "dx sync",
  portclean: "dx portclean",
  "update-all": "dx update-all",
  dp: "dx deploy",
  menu: "dx menu",
};

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

type ScriptResolution = {
  command?: ResolvedCommand;
  managed: boolean;
};

type TestMode = "once" | "watch" | "coverage";
type TestRunner = "vitest" | "jest" | "node" | null;

export function managedScripts(): Record<string, string> {
  return { ...MANAGED_SCRIPTS, ...REPO_OP_SCRIPTS };
}

export function scriptIfUnmanaged(context: DispatchContext, scriptName: string, args: string[]): ScriptResolution {
  const script = context.packageJson.scripts?.[scriptName];
  if (!script) return { managed: false };
  if (isManagedScript(script, scriptName)) return { managed: true };
  return {
    managed: false,
    command: { cmd: runPackageScript(context.packageManager, scriptName, args), cwd: context.repoRoot },
  };
}

export function isManagedScript(script: string, scriptName?: string): boolean {
  const normalized = script.trim().replace(/\s+/g, " ");
  const expected = scriptName ? managedScripts()[scriptName] : undefined;
  if (expected && normalized === expected) return true;
  if (/^bun run src\/cli\.ts\s+(ci|check|lint|typecheck|test|clean|build|dev|sync|port|portclean|update|update-all|deploy|menu)(\s|$)/.test(normalized)) return true;
  return /^(dispatch|dx|repo-tools)\s+(ci|check|lint|typecheck|test|clean|build|dev|sync|port|portclean|update|update-all|deploy|menu)(\s|$)/.test(normalized);
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
  const changes: string[] = [];
  const conflicts: string[] = [];
  const packageJson = { ...context.packageJson, scripts: { ...context.packageJson.scripts } };

  if (packageJson.name !== PACKAGE_NAME) {
    packageJson.devDependencies = { ...packageJson.devDependencies };
    if (!packageJson.devDependencies[PACKAGE_NAME] && !packageJson.dependencies?.[PACKAGE_NAME]) {
      packageJson.devDependencies[PACKAGE_NAME] = `^${packageVersion()}`;
      changes.push(`package.json devDependencies.${PACKAGE_NAME}`);
    }
  }

  for (const [name, wanted] of Object.entries(MANAGED_SCRIPTS)) {
    const current = packageJson.scripts?.[name];
    if (!current || isManagedScript(current, name) || force) {
      if (current !== wanted) {
        packageJson.scripts![name] = wanted;
        changes.push(`package.json scripts.${name}`);
      }
      continue;
    }

    conflicts.push(`Conflict: package.json scripts.${name} already exists.\nCurrent: ${current}\nWanted:  ${wanted}\n\nRun dispatch init --force to replace it.`);
  }

  if (conflicts.length) {
    console.error(conflicts.join("\n\n"));
    process.exit(4);
  }

  for (const [name, wanted] of Object.entries(REPO_OP_SCRIPTS)) {
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

  if (!changes.length) {
    console.log("dispatch init: no changes needed.");
    return;
  }

  console.log(dryRun ? "dispatch init dry run:" : "dispatch init updated:");
  for (const change of changes) console.log(`  ${change}`);
}

export async function doctorStandardRepo(context: DispatchContext): Promise<void> {
  const scripts = context.packageJson.scripts ?? {};
  const missingScripts = Object.keys(managedScripts()).filter((name) => !scripts[name]);
  const oxlintConfig = existsSync(join(context.repoRoot, ".oxlintrc.json"));
  const oxlintBase = existsSync(join(packageRoot(), "oxlint/base.json"));
  const ciWorkflow = existsSync(join(context.repoRoot, ".github/workflows/ci.yml"));
  const hasTs = await hasTypeScriptEvidence(context.repoRoot);
  const hasTypescript = Boolean(repoLocalBin(context.repoRoot, "tsc"));
  const testRunner = await detectTestRunner(context);
  const build = scripts.build;

  console.log("dispatch doctor");
  console.log("");
  console.log(`Package manager: ${context.packageManager}`);
  console.log(`Scripts: ${missingScripts.length ? `missing ${missingScripts.join(", ")}` : "OK"}`);
  console.log(`Installed package: ${hasPackage(context.packageJson, PACKAGE_NAME) || context.packageJson.name === PACKAGE_NAME ? "OK" : `missing ${PACKAGE_NAME}`}`);
  console.log(`Oxlint config: ${oxlintConfig && oxlintBase ? "OK" : "missing"}`);
  console.log(`TypeScript: ${hasTs ? `detected, ${hasTypescript ? "typescript installed" : "typescript missing"}` : "not detected"}`);
  console.log(`Test runner: ${testRunner ?? "none"}`);
  console.log(`Build script: ${build ? (isManagedScript(build, "build") ? "managed/ignored" : "repo-local build detected") : "none"}`);
  console.log(`CI workflow: ${ciWorkflow ? ".github/workflows/ci.yml" : "missing"}`);
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
  const path = join(packageRoot(), "node_modules/.bin", `${name}${suffix}`);
  return existsSync(path) ? path : null;
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

function hasPackage(packageJson: PackageJson, name: string): boolean {
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
