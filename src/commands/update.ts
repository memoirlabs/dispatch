import { updateAll } from "../builtins.ts";
import type { DispatchCommand } from "../types.ts";
import { customOrScript } from "./shared.ts";

export const updateCommand: DispatchCommand = {
  name: "update",
  aliases: ["update-all"],
  category: "repo",
  summary: "Update dependencies. Uses project update script when present, otherwise updates all workspaces.",
  run: async (context, args) => {
    const scripted = customOrScript(context, args, "update", ["update", "update-all", "deps:update"]);
    if (scripted) return scripted;
    await updateAll(context, args);
  },
};
