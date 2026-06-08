import type { DispatchCommand } from "../types.ts";
import { customOrScript, turboTask } from "./shared.ts";

export const ciCommand: DispatchCommand = {
  name: "ci",
  category: "quality",
  summary: "Run full CI confidence path.",
  run: (context, args) => customOrScript(context, args, "ci", ["ci", "appci", "siteci"], turboTask(context, "ci", args)),
};
