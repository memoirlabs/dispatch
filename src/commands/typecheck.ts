import type { DispatchCommand } from "../types.ts";
import { typecheckCommandFor } from "../standard.ts";

export const typecheckCommand: DispatchCommand = {
  name: "typecheck",
  category: "quality",
  summary: "Run typecheck.",
  run: typecheckCommandFor,
};
