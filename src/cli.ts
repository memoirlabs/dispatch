#!/usr/bin/env bun

import { buildCommandMap, fallbackPackageScript, printCommandList } from "./commands.ts";
import { loadConfig } from "./config.ts";
import { resolveConfigCommand, resolveLocalCommand } from "./local-commands.ts";
import { detectPackageManager, findProjectRoot, readPackageJson } from "./project.ts";
import { formatCommand, runResolved } from "./run.ts";
import type { DispatchContext } from "./types.ts";

const VERSION = "0.1.0";

async function main(): Promise<void> {
  const parsed = parseGlobalArgs(process.argv.slice(2));
  const [name, ...args] = parsed.args;

  if (!name || name === "help" || name === "list" || name === "--help" || name === "-h") {
    printCommandList();
    return;
  }

  if (name === "version" || name === "--version" || name === "-v") {
    console.log(VERSION);
    return;
  }

  const startCwd = parsed.cwd ?? process.cwd();
  const repoRoot = await findProjectRoot(startCwd);
  const packageJson = await readPackageJson(repoRoot);
  if (!packageJson) {
    throw new Error(`No package.json found from ${startCwd}`);
  }

  const context: DispatchContext = {
    startCwd,
    repoRoot,
    packageJson,
    packageManager: detectPackageManager(repoRoot, packageJson),
    config: await loadConfig(repoRoot),
    verbose: parsed.verbose,
    quiet: parsed.quiet,
  };

  const map = buildCommandMap();
  const command = map.get(name);
  const canonicalName = command?.name ?? name;
  const resolved =
    await resolveConfigCommand(context, name, args) ??
    await resolveLocalCommand(context, name, args) ??
    (canonicalName === name ? null : await resolveConfigCommand(context, canonicalName, args)) ??
    (canonicalName === name ? null : await resolveLocalCommand(context, canonicalName, args)) ??
    (command ? await command.run(context, args) : fallbackPackageScript(context, name, args));

  if (!resolved) {
    if (!command) {
      console.error(`Unknown command: ${name}\n`);
      printCommandList();
      process.exit(1);
    }
    return;
  }

  const finalCommand = {
    ...resolved,
    cwd: resolved.cwd ?? context.repoRoot,
  };

  console.log(`\n$ ${formatCommand(finalCommand.cmd)}\n`);
  const exitCode = await runResolved(finalCommand);
  if (exitCode !== 0) process.exit(exitCode);
}

function parseGlobalArgs(args: string[]): { args: string[]; cwd?: string; verbose?: boolean; quiet?: boolean } {
  const remaining: string[] = [];
  let cwd: string | undefined;
  let verbose = false;
  let quiet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--cwd") {
      const value = args[index + 1];
      if (!value) usageError("--cwd requires a path.");
      cwd = value;
      index += 1;
    } else if (arg.startsWith("--cwd=")) {
      cwd = arg.slice("--cwd=".length);
    } else if (arg === "--verbose") {
      verbose = true;
    } else if (arg === "--quiet") {
      quiet = true;
    } else {
      remaining.push(arg);
    }
  }

  return { args: remaining, cwd, verbose, quiet };
}

function usageError(message: string): never {
  console.error(message);
  process.exit(2);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
