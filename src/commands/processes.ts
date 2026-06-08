import { listRepoProcesses } from "../processes.ts";
import type { DispatchCommand } from "../types.ts";

export const processesCommand: DispatchCommand = {
  name: "processes",
  category: "repo",
  summary: "Show processes that appear to belong to the current repo.",
  usage: "dispatch processes [--deep] [--json] [--all]",
  examples: ["dispatch processes", "dispatch processes --deep", "dispatch processes --json"],
  run: listRepoProcesses,
};
