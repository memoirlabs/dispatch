import { dlxToolCommand, execToolCommand } from "../project.ts";
import { hasPackage } from "../standard.ts";
import type { DispatchCommand } from "../types.ts";
import { customOrScript } from "./shared.ts";

export const convexCommand: DispatchCommand = {
  name: "convex",
  category: "repo",
  summary: "Run Convex through the project package manager.",
  usage: "dispatch convex [...args]",
  examples: ["dispatch convex dev", "dispatch convex deploy"],
  run: (context, args) => {
    const scripted = customOrScript(context, args, "convex", ["convex", "convex:dev", "convex:deploy"]);
    if (scripted) return scripted;

    const command = hasPackage(context.packageJson, "convex")
      ? execToolCommand(context.packageManager, "convex", args)
      : dlxToolCommand(context.packageManager, "convex", args);

    return { cmd: command, cwd: context.repoRoot };
  },
};
