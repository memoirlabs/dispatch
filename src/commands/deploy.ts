import { dlxToolCommand, runPackageScript } from "../project.ts";
import { runCi } from "../standard.ts";
import type { DispatchCommand } from "../types.ts";
import { customOrScript } from "./shared.ts";

export const deployCommand: DispatchCommand = {
  name: "deploy",
  aliases: ["dp"],
  category: "deploy",
  summary: "Run checks, then deploy using project deploy script, configured script, or Vercel fallback.",
  examples: ["dispatch deploy", "dispatch deploy --skip-checks"],
  run: async (context, args) => {
    const skipChecks = args.includes("--skip-checks");
    const forwarded = args.filter((arg) => arg !== "--skip-checks");

    if (!skipChecks) await runCi(context, []);

    const configured = context.config.deployScript;
    if (configured) return { cmd: runPackageScript(context.packageManager, configured, forwarded), cwd: context.repoRoot };
    const scripted = customOrScript(context, forwarded, "deploy", ["deploy", "deploy:prod", "deploy:web", "release:ship", "ship"]);
    if (scripted) return scripted;
    return { cmd: dlxToolCommand(context.packageManager, "vercel", ["deploy", "--prod", ...forwarded]), cwd: context.repoRoot };
  },
};
