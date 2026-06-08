import { normalizeCommand } from "../config.ts";
import { execToolCommand, isTurboRepo, resolveScriptName, runPackageScript } from "../project.ts";
import { isManagedScript } from "../standard.ts";
import type { DispatchContext, ResolvedCommand } from "../types.ts";

export function customOrScript(context: DispatchContext, args: string[], commandName: string, scriptNames: string[], fallback?: ResolvedCommand): ResolvedCommand | void {
  const custom = context.config.commands?.[commandName];
  if (custom) return { cmd: [...normalizeCommand(custom), ...args], cwd: context.repoRoot };

  const configuredAliases = context.config.scriptAliases?.[commandName] ?? [];
  const script = resolveScriptName(context.packageJson, [...configuredAliases, ...scriptNames]);
  if (script && !isManagedScript(context.packageJson.scripts?.[script] ?? "", script)) {
    return { cmd: runPackageScript(context.packageManager, script, args), cwd: context.repoRoot };
  }

  return fallback;
}

export function turboTask(context: DispatchContext, task: string, args: string[] = []): ResolvedCommand | undefined {
  if (!isTurboRepo(context.packageJson)) return undefined;
  return { cmd: execToolCommand(context.packageManager, "turbo", ["run", task, ...args]), cwd: context.repoRoot };
}

export function scriptOrTurbo(context: DispatchContext, args: string[], commandName: string, scriptNames: string[], turboName = commandName): ResolvedCommand | void {
  return customOrScript(context, args, commandName, scriptNames, turboTask(context, turboName, args));
}

export function printOps(context: DispatchContext): void {
  const scripts = Object.keys(context.packageJson.scripts ?? {}).sort();
  const ops = scripts.filter((script) => /^(deploy|env|config|design|mimi|stripe|gcs|media|profiles|audit|users|cities|resend|release|module|convex|sync|refresh|deps):?/.test(script));
  const list = ops.length ? ops : scripts;

  console.log("Project ops scripts");
  console.log("");
  for (const script of list) {
    console.log(`  ${script}`);
  }
  console.log("");
  console.log("Run one with:");
  console.log("  dispatch ops <script-name> [...args]");
}
