import { initStandardRepo } from "../standard.ts";
import type { DispatchCommand } from "../types.ts";

export const initCommand: DispatchCommand = {
  name: "init",
  category: "repo",
  summary: "Add standard repo tooling files and scripts.",
  examples: ["dispatch init", "dispatch init --dry-run", "dispatch init --force"],
  run: initStandardRepo,
};
