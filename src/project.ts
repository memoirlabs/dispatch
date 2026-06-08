import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import type { PackageManager, PackageJson, WorkspacePackage } from "./types.ts";

export async function readPackageJson(directory: string): Promise<PackageJson | null> {
  const path = join(directory, "package.json");
  if (!existsSync(path)) return null;

  try {
    return await Bun.file(path).json() as PackageJson;
  } catch {
    return null;
  }
}

export async function findProjectRoot(start = process.cwd()): Promise<string> {
  let current = resolve(start);
  let best: string | null = null;

  while (true) {
    const packageJson = await readPackageJson(current);
    if (packageJson) {
      best = current;
      if (packageJson.workspaces || existsSync(join(current, ".git"))) {
        return current;
      }
    }

    const parent = dirname(current);
    if (parent === current) return best ?? resolve(start);
    current = parent;
  }
}

export function hasScript(packageJson: PackageJson, name: string): boolean {
  return Boolean(packageJson.scripts?.[name]);
}

export function resolveScriptName(packageJson: PackageJson, names: string[]): string | null {
  for (const name of names) {
    if (hasScript(packageJson, name)) return name;
  }
  return null;
}

export function detectPackageManager(repoRoot: string, packageJson: PackageJson): PackageManager {
  const declared = packageJson.packageManager?.split("@")[0];
  if (declared === "bun" || declared === "pnpm" || declared === "npm" || declared === "yarn") {
    return declared;
  }

  if (existsSync(join(repoRoot, "bun.lock")) || existsSync(join(repoRoot, "bun.lockb"))) return "bun";
  if (existsSync(join(repoRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(repoRoot, "yarn.lock"))) return "yarn";
  if (existsSync(join(repoRoot, "package-lock.json")) || existsSync(join(repoRoot, "npm-shrinkwrap.json"))) return "npm";

  return "bun";
}

export function runPackageScript(packageManager: PackageManager, script: string, args: string[] = []): string[] {
  switch (packageManager) {
    case "npm":
      return ["npm", "run", script, ...withRunSeparator(args)];
    case "pnpm":
      return ["pnpm", "run", script, ...withRunSeparator(args)];
    case "yarn":
      return ["yarn", "run", script, ...args];
    case "bun":
      return ["bun", "run", script, ...args];
  }
}

export function installCommand(packageManager: PackageManager, args: string[] = []): string[] {
  switch (packageManager) {
    case "npm":
      return ["npm", "install", ...args];
    case "pnpm":
      return ["pnpm", "install", ...args];
    case "yarn":
      return ["yarn", "install", ...args];
    case "bun":
      return ["bun", "install", ...args];
  }
}

export function updateLatestCommand(packageManager: PackageManager, args: string[] = []): string[] {
  switch (packageManager) {
    case "npm":
      return ["npm", "update", ...args];
    case "pnpm":
      return ["pnpm", "update", "--latest", ...args];
    case "yarn":
      return ["yarn", "up", ...args];
    case "bun":
      return ["bun", "update", "--latest", ...args];
  }
}

export function execToolCommand(packageManager: PackageManager, tool: string, args: string[] = []): string[] {
  switch (packageManager) {
    case "npm":
      return ["npx", tool, ...args];
    case "pnpm":
      return ["pnpm", "exec", tool, ...args];
    case "yarn":
      return ["yarn", tool, ...args];
    case "bun":
      return ["bunx", "--bun", tool, ...args];
  }
}

export function dlxToolCommand(packageManager: PackageManager, tool: string, args: string[] = []): string[] {
  switch (packageManager) {
    case "npm":
      return ["npx", tool, ...args];
    case "pnpm":
      return ["pnpm", "dlx", tool, ...args];
    case "yarn":
      return ["yarn", "dlx", tool, ...args];
    case "bun":
      return ["bunx", "--bun", tool, ...args];
  }
}

export function isTurboRepo(packageJson: PackageJson): boolean {
  return Boolean(packageJson.dependencies?.turbo || packageJson.devDependencies?.turbo);
}

export async function collectWorkspacePackages(repoRoot: string, packageJson: PackageJson): Promise<WorkspacePackage[]> {
  const patterns = getWorkspacePatterns(packageJson);
  const roots = new Set<string>([repoRoot]);

  for (const pattern of patterns) {
    for (const directory of await expandWorkspacePattern(repoRoot, pattern)) {
      roots.add(directory);
    }
  }

  const packages: WorkspacePackage[] = [];
  for (const root of [...roots].sort()) {
    const childPackageJson = await readPackageJson(root);
    if (!childPackageJson) continue;

    packages.push({
      root,
      relativePath: relative(repoRoot, root) || ".",
      packageJson: childPackageJson,
      hasDependencies: hasAnyDependencies(childPackageJson),
    });
  }

  return packages;
}

function getWorkspacePatterns(packageJson: PackageJson): string[] {
  if (Array.isArray(packageJson.workspaces)) return packageJson.workspaces;
  return packageJson.workspaces?.packages ?? [];
}

async function expandWorkspacePattern(repoRoot: string, pattern: string): Promise<string[]> {
  const wildcardIndex = pattern.indexOf("*");
  if (wildcardIndex === -1) return [resolve(repoRoot, pattern)];

  const prefix = pattern.slice(0, wildcardIndex);
  const suffix = pattern.slice(wildcardIndex + 1);
  const parent = resolve(repoRoot, prefix);
  if (!existsSync(parent)) return [];

  const entries = await readdir(parent, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(parent, entry.name, suffix));
}

function hasAnyDependencies(packageJson: PackageJson): boolean {
  return [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
  ].some((deps) => deps && Object.keys(deps).length > 0);
}

function withRunSeparator(args: string[]): string[] {
  return args.length ? ["--", ...args] : [];
}
