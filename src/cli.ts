#!/usr/bin/env bun

import { buildCommandMap, fallbackPackageScript, printCommandList } from "./commands.ts";
import { loadConfig } from "./config.ts";
import { resolveConfigCommand, resolveLocalCommand } from "./local-commands.ts";
import { detectPackageManager, findProjectRoot, readPackageJson } from "./project.ts";
import { formatCommand, runResolved } from "./run.ts";
import type { DispatchContext } from "./types.ts";

const VERSION = "0.1.0";

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const [name, ...args] = rawArgs;

  if (!name || name === "help" || name === "list" || name === "--help" || name === "-h") {
    printCommandList();
    return;
  }

  if (name === "version" || name === "--version" || name === "-v") {
    console.log(VERSION);
    return;
  }

  const repoRoot = await findProjectRoot(process.cwd());
  const packageJson = await readPackageJson(repoRoot);
  if (!packageJson) {
    throw new Error(`No package.json found from ${process.cwd()}`);
  }

  const context: DispatchContext = {
    startCwd: process.cwd(),
    repoRoot,
    packageJson,
    packageManager: detectPackageManager(repoRoot, packageJson),
    config: await loadConfig(repoRoot),
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

await main();
