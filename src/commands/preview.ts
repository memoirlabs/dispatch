import type { DispatchCommand } from "../types.ts";
import { customOrScript, turboTask } from "./shared.ts";

export const previewCommand: DispatchCommand = {
  name: "preview",
  category: "core",
  summary: "Run the preview server when the project has one.",
  run: (context, args) => customOrScript(context, args, "preview", ["preview", "preview:web", "website:preview"], turboTask(context, "preview", args)),
};
