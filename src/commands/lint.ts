import type { DispatchCommand } from "../types.ts";
import { scriptOrTurbo } from "./shared.ts";

export const lintCommand: DispatchCommand = {
  name: "lint",
  category: "quality",
  summary: "Run lint.",
  run: (context, args) => scriptOrTurbo(context, args, "lint", ["lint"]),
};
