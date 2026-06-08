import type { DispatchCommand } from "../types.ts";
import { scriptOrTurbo } from "./shared.ts";

export const checkCommand: DispatchCommand = {
  name: "check",
  category: "quality",
  summary: "Run normal local confidence checks.",
  run: (context, args) => scriptOrTurbo(context, args, "check", ["check", "ci:verify", "verify"], "check"),
};
