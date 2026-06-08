import type { DispatchCommand } from "../types.ts";
import { lintCommandFor } from "../standard.ts";

export const lintCommand: DispatchCommand = {
  name: "lint",
  category: "quality",
  summary: "Run lint.",
  run: lintCommandFor,
};
