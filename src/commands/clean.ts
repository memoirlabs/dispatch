import { cleanArtifacts } from "../builtins.ts";
import type { DispatchCommand } from "../types.ts";
import { customOrScript } from "./shared.ts";

export const cleanCommand: DispatchCommand = {
  name: "clean",
  category: "repo",
  summary: "Remove common local build/install artifacts.",
  examples: ["dispatch clean --dry-run", "dispatch clean"],
  run: async (context, args) => {
    const scripted = customOrScript(context, args, "clean", ["clean", "cleanup", "cleanup:build", "app:clean"]);
    if (scripted) return scripted;
    await cleanArtifacts(context, args);
  },
};
