import { listProjectScripts } from "../builtins.ts";
import type { DispatchCommand } from "../types.ts";

export const scriptsCommand: DispatchCommand = {
  name: "scripts",
  category: "debug",
  summary: "List raw package.json scripts.",
  run: (context) => listProjectScripts(context),
};
