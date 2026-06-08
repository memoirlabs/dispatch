import type { DispatchCommand } from "../types.ts";
import { customOrScript } from "./shared.ts";

export const startCommand: DispatchCommand = {
  name: "start",
  category: "core",
  summary: "Start the built project.",
  run: (context, args) => customOrScript(context, args, "start", ["start", "app:start"]),
};
