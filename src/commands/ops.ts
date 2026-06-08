import { resolveScriptName, runPackageScript } from "../project.ts";
import type { DispatchCommand } from "../types.ts";
import { printOps } from "./shared.ts";

export const opsCommand: DispatchCommand = {
  name: "ops",
  category: "ops",
  summary: "List or run operational/project scripts through one command.",
  usage: "dispatch ops [list|script-name] [...args]",
  run: (context, args) => {
    const [name, ...rest] = args;
    if (!name || name === "list" || name === "--help" || name === "-h") {
      printOps(context);
      return;
    }
    const script = resolveScriptName(context.packageJson, [name]);
    if (script) return { cmd: runPackageScript(context.packageManager, script, rest), cwd: context.repoRoot };
    console.error(`Unknown ops script: ${name}`);
    printOps(context);
    process.exit(1);
  },
};
