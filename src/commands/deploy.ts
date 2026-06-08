import { dlxToolCommand, runPackageScript } from "../project.ts";
import type { DispatchCommand } from "../types.ts";
import { customOrScript } from "./shared.ts";

export const deployCommand: DispatchCommand = {
  name: "deploy",
  aliases: ["dp"],
  category: "deploy",
  summary: "Deploy using project deploy script, configured script, or Vercel fallback.",
  run: (context, args) => {
    const configured = context.config.deployScript;
    if (configured) return { cmd: runPackageScript(context.packageManager, configured, args), cwd: context.repoRoot };
    const scripted = customOrScript(context, args, "deploy", ["deploy", "deploy:prod", "deploy:web", "release:ship", "ship"]);
    if (scripted) return scripted;
    return { cmd: dlxToolCommand(context.packageManager, "vercel", ["deploy", "--prod", ...args]), cwd: context.repoRoot };
  },
};
