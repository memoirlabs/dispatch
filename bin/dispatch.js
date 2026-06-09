#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(packageRoot, "src/cli.ts");
const result = spawnSync("bun", [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error("dispatch requires Bun. Install Bun from https://bun.sh and try again.");
  process.exit(1);
}

process.exit(result.status ?? 1);
