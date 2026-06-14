import type { DispatchCommand } from "../types.ts";
import { customOrScript } from "./shared.ts";

export const menuCommand: DispatchCommand = {
  name: "menu",
  category: "core",
  summary: "Open the project menu if the project defines one.",
  run: (context, args) => customOrScript(context, args, "menu", ["menu", "dev:menu"]),
};
