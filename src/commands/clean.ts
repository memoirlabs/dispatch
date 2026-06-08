import type { DispatchCommand } from "../types.ts";
import { cleanStandardArtifacts } from "../standard.ts";

export const cleanCommand: DispatchCommand = {
  name: "clean",
  category: "repo",
  summary: "Remove common local build/install artifacts.",
  examples: ["dispatch clean --dry-run", "dispatch clean"],
  run: cleanStandardArtifacts,
};
