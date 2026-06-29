import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { normalizeCommand } from "./config.ts";
import type { CommandResult, DispatchContext, ProjectCommand, ResolvedCommand } from "./types.ts";

const EXTENSIONS = [".ts"] as const;

export async function resolveConfigCommand(context: DispatchContext, name: string, args: string[]): Promise<ResolvedCommand | null> {
  const configured = context.config.commands?.[name];
  if (!configured) return null;
  return { cmd: [...normalizeCommand(configured), ...args], cwd: context.repoRoot };
}

export async function resolveLocalCommand(context: DispatchContext, name: string, args: string[]): Promise<ResolvedCommand | null> {
  const paths = commandFileCandidates(context, name);
  for (const path of paths) {
    if (!existsSync(path)) continue;

    const mod = await import(pathToFileURL(path).href);
    const definition = (mod.default ?? mod.command ?? mod.run) as ProjectCommand | undefined;
    if (!definition) {
      throw new Error(`Command file ${path} must export default, command, or run.`);
    }

    return coerceProjectCommand(definition, context, args, path);
  }

  return null;
}

export async function coerceProjectCommand(
  definition: ProjectCommand,
  context: DispatchContext,
  args: string[],
  source = "project command",
): Promise<ResolvedCommand | null> {
  if (typeof definition === "string" || Array.isArray(definition)) {
    return { cmd: [...normalizeCommand(definition), ...args], cwd: context.repoRoot };
  }

  if (typeof definition === "function") {
    return coerceCommandResult(await definition(context, args), context, args, source);
  }

  if (definition.run) {
    return coerceCommandResult(await definition.run(context, args), context, args, source);
  }

  if (definition.command) {
    return { cmd: [...normalizeCommand(definition.command), ...args], cwd: context.repoRoot };
  }

  throw new Error(`Invalid ${source}: expected a command string, argv array, function, or object with run/command.`);
}

function coerceCommandResult(result: CommandResult, context: DispatchContext, args: string[], source: string): ResolvedCommand | null {
  if (!result) return null;
  if (typeof result === "string" || Array.isArray(result)) {
    return { cmd: [...normalizeCommand(result), ...args], cwd: context.repoRoot };
  }
  if (Array.isArray(result.cmd) && result.cmd.length > 0) return result;
  throw new Error(`Invalid result from ${source}: expected string, argv array, or { cmd: string[] }.`);
}

function commandFileCandidates(context: DispatchContext, name: string): string[] {
  assertSafeCommandName(name);

  const commandDir = context.config.commandDir ?? "dispatch/commands";
  const aliases = fileNameAliases(name);
  const directories = unique([
    commandDir,
    "dispatch/commands",
    "dispatch",
    ".dispatch/commands",
    ".dispatch",
  ]);

  const candidates: string[] = [];
  for (const directory of directories) {
    for (const alias of aliases) {
      for (const extension of EXTENSIONS) {
        candidates.push(join(context.repoRoot, directory, `${alias}${extension}`));
      }
    }
  }
  return candidates;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function fileNameAliases(name: string): string[] {
  const dashed = name.replaceAll(":", "-");
  return dashed === name ? [name] : [name, dashed];
}

function assertSafeCommandName(name: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/.test(name)) {
    throw new Error(`Invalid command name: ${name}`);
  }
}
