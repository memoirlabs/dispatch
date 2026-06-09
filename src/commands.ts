import { buildCommand } from "./commands/build.ts";
import { checkCommand } from "./commands/check.ts";
import { ciCommand } from "./commands/ci.ts";
import { cleanCommand } from "./commands/clean.ts";
import { convexCommand } from "./commands/convex.ts";
import { deployCommand } from "./commands/deploy.ts";
import { devCommand } from "./commands/dev.ts";
import { doctorCommand } from "./commands/doctor.ts";
import { fixCommand } from "./commands/fix.ts";
import { installDispatchCommand } from "./commands/install.ts";
import { initCommand } from "./commands/init.ts";
import { lintCommand } from "./commands/lint.ts";
import { menuCommand } from "./commands/menu.ts";
import { opsCommand } from "./commands/ops.ts";
import { portCommand } from "./commands/port.ts";
import { processesCommand } from "./commands/processes.ts";
import { prepareCommand } from "./commands/prepare.ts";
import { previewCommand } from "./commands/preview.ts";
import { releaseCommand } from "./commands/release.ts";
import { scriptsCommand } from "./commands/scripts.ts";
import { startCommand } from "./commands/start.ts";
import { syncCommand } from "./commands/sync.ts";
import { testCommand } from "./commands/test.ts";
import { typecheckCommand } from "./commands/typecheck.ts";
import { updateCommand } from "./commands/update.ts";
import { verifyCommand } from "./commands/verify.ts";
import { runPackageScript } from "./project.ts";
import { isManagedScript } from "./standard.ts";
import type { Category, DispatchCommand, DispatchContext, ResolvedCommand } from "./types.ts";

const CATEGORIES: Category[] = ["core", "repo", "quality", "deploy", "ops", "debug"];

export const commands: DispatchCommand[] = [
  devCommand,
  startCommand,
  previewCommand,
  menuCommand,
  initCommand,
  installDispatchCommand,
  updateCommand,
  syncCommand,
  portCommand,
  processesCommand,
  cleanCommand,
  convexCommand,
  doctorCommand,
  lintCommand,
  fixCommand,
  typecheckCommand,
  testCommand,
  checkCommand,
  ciCommand,
  buildCommand,
  verifyCommand,
  prepareCommand,
  deployCommand,
  releaseCommand,
  opsCommand,
  scriptsCommand,
];

export function buildCommandMap(): Map<string, DispatchCommand> {
  const map = new Map<string, DispatchCommand>();
  for (const command of commands) {
    map.set(command.name, command);
    for (const alias of command.aliases ?? []) map.set(alias, command);
  }
  return map;
}

export function printCommandList(): void {
  console.log("Dispatch");
  console.log("");
  console.log("Usage:");
  console.log("  dispatch <command> [...args]");
  console.log("");

  for (const category of CATEGORIES) {
    const visible = commands.filter((command) => command.category === category && !command.hidden);
    if (!visible.length) continue;
    console.log(`${category}:`);
    for (const command of visible) {
      const aliases = command.aliases?.length ? ` (${command.aliases.join(", ")})` : "";
      console.log(`  ${command.name.padEnd(16)} ${command.summary}${aliases}`);
    }
    console.log("");
  }
}

export function fallbackPackageScript(context: DispatchContext, name: string, args: string[]): ResolvedCommand | null {
  const alias = context.config.aliases?.[name];
  const target = alias ?? name;
  const script = context.packageJson.scripts?.[target];
  if (script && !isManagedScript(script, target)) {
    return { cmd: runPackageScript(context.packageManager, target, args), cwd: context.repoRoot };
  }
  return null;
}
