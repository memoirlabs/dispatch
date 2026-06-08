import { cleanPorts } from "../builtins.ts";
import type { DispatchCommand } from "../types.ts";
import { customOrScript } from "./shared.ts";

export const portCommand: DispatchCommand = {
  name: "port",
  aliases: ["ports", "portclean"],
  category: "repo",
  summary: "Clean common local dev ports and stale Next dev locks.",
  examples: ["dispatch port", "dispatch port --ports 3000,5173", "dispatch port --dry-run"],
  run: async (context, args) => {
    const forcedBuiltin = args.includes("--builtin");
    const forwarded = args.filter((arg) => arg !== "--builtin");
    if (!forcedBuiltin) {
      const scripted = customOrScript(context, forwarded, "port", ["port", "portclean", "checkport"]);
      if (scripted) return scripted;
    }
    await cleanPorts(context, forwarded);
  },
};
