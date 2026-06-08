import { syncRepo } from "../builtins.ts";
import type { DispatchCommand } from "../types.ts";
import { customOrScript } from "./shared.ts";

export const syncCommand: DispatchCommand = {
  name: "sync",
  category: "repo",
  summary: "Sync the repo. Uses project sync script when present, otherwise pull/rebase or --hard reset.",
  examples: ["dispatch sync", "dispatch sync --hard", "dispatch sync --dry-run"],
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
