import type { DispatchCommand } from "../types.ts";
import { customOrScript } from "./shared.ts";

export const menuCommand: DispatchCommand = {
  name: "menu",
  aliases: ["runner", "launcher"],
  category: "core",
  summary: "Open a project runner/menu if the project defines one.",
  run: (context, args) => customOrScript(context, args, "menu", ["menu", "runner", "launcher", "dev:menu"]),
};
