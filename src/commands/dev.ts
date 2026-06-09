import { normalizeCommand } from "../config.ts";
import { isTurboRepo } from "../project.ts";
import type { DispatchCommand } from "../types.ts";
import { customOrScript, turboTask } from "./shared.ts";

export const devCommand: DispatchCommand = {
  name: "dev",
  category: "core",
  summary: "Run the project dev server.",
  examples: ["dispatch dev", "dispatch dev -- --host 0.0.0.0"],
  run: (context, args) => {
    const custom = context.config.commands?.dev;
    if (custom) return { cmd: [...normalizeCommand(custom), ...args], cwd: context.repoRoot };

    const appFilter = context.config.appFilter;
    if (appFilter && isTurboRepo(context.packageJson)) {
      const task = turboTask(context, "dev", [`--filter=${appFilter}`, ...args]);
      if (task) return task;
    }

    return customOrScript(context, args, "dev", ["dev", "dev:web", "dev:app"], turboTask(context, "dev", args));
  },
};
