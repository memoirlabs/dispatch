import type { DispatchCommand } from "../types.ts";
import { customOrScript } from "./shared.ts";

export const releaseCommand: DispatchCommand = {
  name: "release",
  category: "deploy",
  summary: "Run release flow when available.",
  run: (context, args) => customOrScript(context, args, "release", ["release", "release:build", "release:prepare", "release:cut"]),
};
