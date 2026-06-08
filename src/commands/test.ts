import type { DispatchCommand } from "../types.ts";
import { scriptOrTurbo } from "./shared.ts";

export const testCommand: DispatchCommand = {
  name: "test",
  aliases: ["t"],
  category: "quality",
  summary: "Run tests.",
  run: (context, args) => scriptOrTurbo(context, args, "test", ["test"], "test"),
};
