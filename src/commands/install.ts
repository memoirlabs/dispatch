import { installCommand } from "../project.ts";
import type { DispatchCommand } from "../types.ts";

export const installDispatchCommand: DispatchCommand = {
  name: "install",
  category: "repo",
  summary: "Install dependencies at the project root.",
  run: (context, args) => ({ cmd: installCommand(context.packageManager, args), cwd: context.repoRoot }),
};
