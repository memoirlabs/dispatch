import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

import type { DispatchConfig } from "./types.ts";

const CONFIG_FILES = [
  "dispatch.config.ts",
  "dispatch.config.js",
  "dispatch.config.mjs",
  ".dispatchrc.json",
] as const;

export async function loadConfig(repoRoot: string): Promise<DispatchConfig> {
  for (const file of CONFIG_FILES) {
    const path = join(repoRoot, file);
    if (!existsSync(path)) continue;

    if (file.endsWith(".json")) {
      return await Bun.file(path).json() as DispatchConfig;
    }

    const mod = await import(pathToFileURL(path).href);
    return (mod.default ?? mod.config ?? {}) as DispatchConfig;
  }

  return {};
}

export function normalizeCommand(value: string | string[]): string[] {
  if (Array.isArray(value)) return value;
  return ["bash", "-lc", value];
}
