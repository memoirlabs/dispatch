import { runPackageScript } from "../project.ts";
import { runCi } from "../standard.ts";
import type { DispatchCommand } from "../types.ts";
import { customOrScript } from "./shared.ts";

export const deployCommand: DispatchCommand = {
  name: "deploy",
  aliases: ["dp"],
  category: "deploy",
  summary: "Run checks, then hand off to the repo-owned deploy script.",
  examples: ["dispatch deploy", "dispatch deploy --skip-checks"],
  run: async (context, args) => {
    const skipChecks = args.includes("--skip-checks");
    const forwarded = args.filter((arg) => arg !== "--skip-checks");

    if (!skipChecks) await runCi(context, []);

    const configured = context.config.deployScript;
    if (configured) return { cmd: runPackageScript(context.packageManager, configured, forwarded), cwd: context.repoRoot };
    const scripted = customOrScript(context, forwarded, "deploy", ["deploy"]);
    if (scripted) return scripted;

    console.error("No repo-owned deploy command is configured.");
    console.error("Add a deploy script, set deployScript/scriptAliases.deploy in dispatch.config.ts, or run a specific script with dispatch ops <script-name>.");
    process.exit(4);
  },
};
