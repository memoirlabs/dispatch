import type { DispatchCommand } from "../types.ts";
import { testCommandFor } from "../standard.ts";

export const testCommand: DispatchCommand = {
  name: "test",
  category: "quality",
  summary: "Run tests.",
  run: testCommandFor,
};
