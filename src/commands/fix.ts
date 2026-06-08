import type { DispatchCommand } from "../types.ts";
import { scriptOrTurbo } from "./shared.ts";

export const fixCommand: DispatchCommand = {
  name: "fix",
  aliases: ["lint:fix"],
  category: "quality",
  summary: "Run lint/style fixes.",
  run: (context, args) => scriptOrTurbo(context, args, "fix", ["fix", "lint:fix"]),
};
