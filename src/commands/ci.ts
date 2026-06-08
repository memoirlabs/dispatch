import type { DispatchCommand } from "../types.ts";
import { runCi } from "../standard.ts";

export const ciCommand: DispatchCommand = {
  name: "ci",
  category: "quality",
  summary: "Run full CI confidence path.",
  run: runCi,
};
