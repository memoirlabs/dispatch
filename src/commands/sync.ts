import { syncRepo, syncRepoCareful } from "../builtins.ts";
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
      const scripted = customOrScript(context, forwarded, "sync", ["sync"]);
      if (scripted) return scripted;
    }
    await syncRepo(context, forwarded);
  },
};

export const syncCarefulCommand: DispatchCommand = {
  name: "sync-careful",
  category: "repo",
  summary: "Fast-forward to origin/main only when the worktree has no local changes or divergent commits.",
  examples: ["dispatch sync-careful", "dispatch sync-careful --dry-run", "dispatch sync-careful --branch release"],
  run: async (context, args) => {
    const forcedBuiltin = args.includes("--builtin");
    const forwarded = args.filter((arg) => arg !== "--builtin");
    if (!forcedBuiltin) {
      const scripted = customOrScript(context, forwarded, "sync-careful", ["sync-careful"]);
      if (scripted) return scripted;
    }
    await syncRepoCareful(context, forwarded);
  },
};
