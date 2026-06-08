import type { DispatchCommand } from "../types.ts";
import { scriptOrTurbo } from "./shared.ts";

export const buildCommand: DispatchCommand = {
  name: "build",
  aliases: ["b"],
  category: "quality",
  summary: "Build the project.",
  run: (context, args) => scriptOrTurbo(context, args, "build", ["build", "app:build"], "build"),
};
