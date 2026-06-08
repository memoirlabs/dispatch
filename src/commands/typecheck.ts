import type { DispatchCommand } from "../types.ts";
import { scriptOrTurbo } from "./shared.ts";

export const typecheckCommand: DispatchCommand = {
  name: "typecheck",
  aliases: ["tc"],
  category: "quality",
  summary: "Run typecheck.",
  run: (context, args) => scriptOrTurbo(context, args, "typecheck", ["typecheck", "dev:typecheck"], "typecheck"),
};
