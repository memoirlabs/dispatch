import type { DispatchCommand } from "../types.ts";
import { runCheck } from "../standard.ts";

export const checkCommand: DispatchCommand = {
  name: "check",
  category: "quality",
  summary: "Run normal local confidence checks.",
  run: runCheck,
};
