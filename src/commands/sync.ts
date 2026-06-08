import { syncRepo } from "../builtins.ts";
import type { DispatchCommand } from "../types.ts";
import { customOrScript } from "./shared.ts";

export const syncCommand: DispatchCommand = {
  name: "sync",
  category: "repo",
  summary: "Force the worktree to match origin/main and discard local changes.",
  examples: ["dispatch sync", "dispatch sync --dry-run", "dispatch sync --branch release"],
  run: async (context, args) => {
    const forcedBuiltin = args.includes("--builtin");
    const forwarded = args.filter((arg) => arg !== "--builtin");
    if (!forcedBuiltin) {
      const scripted = customOrScript(context, forwarded, "sync", ["sync", "sync:main", "branch:sync-main"]);
      if (scripted) return scripted;
    }
    await syncRepo(context, forwarded);
  },
};
