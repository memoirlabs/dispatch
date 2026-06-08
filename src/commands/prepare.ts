import type { DispatchCommand } from "../types.ts";
import { customOrScript } from "./shared.ts";

export const prepareCommand: DispatchCommand = {
  name: "prepare",
  category: "quality",
  summary: "Prepare/generated inputs when the project defines it.",
  run: (context, args) => customOrScript(context, args, "prepare", ["prepare", "build:prepare", "release:prepare"]),
};
