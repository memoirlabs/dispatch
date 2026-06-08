import { doctorStandardRepo } from "../standard.ts";
import type { DispatchCommand } from "../types.ts";

export const doctorCommand: DispatchCommand = {
  name: "doctor",
  category: "repo",
  summary: "Print project/runtime diagnostics.",
  run: doctorStandardRepo,
};
