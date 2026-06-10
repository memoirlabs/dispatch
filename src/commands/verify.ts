import type { DispatchCommand } from "../types.ts";
import { customOrScript, turboTask } from "./shared.ts";

export const verifyCommand: DispatchCommand = {
  name: "verify",
  category: "quality",
  summary: "Run project verification/preflight when available.",
  run: (context, args) => customOrScript(context, args, "verify", ["verify", "preflight", "bundle:verify", "verify:generate"], turboTask(context, "check", args)),
};
