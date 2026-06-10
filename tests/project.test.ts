import { afterAll, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  detectPackageManager,
  dlxToolCommand,
  execToolCommand,
  installCommand,
  runPackageScript,
  updateLatestCommand,
} from "../src/project.ts";
import { parseLsofCwds, parseLsofNamesByPid, parseProcessLine } from "../src/processes.ts";
import { planAgentInstructionsUpdate, upsertManagedBlock } from "../src/standard.ts";
import type { DispatchContext } from "../src/types.ts";

const tmpRoot = join(import.meta.dir, ".tmp");

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

test("detectPackageManager prefers packageManager over lockfiles", async () => {
  const root = join(tmpRoot, "declared");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "pnpm-lock.yaml"), "");

  expect(detectPackageManager(root, { packageManager: "pnpm@9.0.0" })).toBe("pnpm");
});

test("detectPackageManager rejects packageManager and lockfile conflicts", async () => {
  const root = join(tmpRoot, "conflict");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "bun.lock"), "");

  expect(() => detectPackageManager(root, { packageManager: "pnpm@9.0.0" })).toThrow("packageManager declares pnpm");
});

test("detectPackageManager falls back through common lockfiles", async () => {
  const pnpmRoot = join(tmpRoot, "pnpm");
  const npmRoot = join(tmpRoot, "npm");
  await mkdir(pnpmRoot, { recursive: true });
  await mkdir(npmRoot, { recursive: true });
  await writeFile(join(pnpmRoot, "pnpm-lock.yaml"), "");
  await writeFile(join(npmRoot, "package-lock.json"), "");

  expect(detectPackageManager(pnpmRoot, {})).toBe("pnpm");
  expect(detectPackageManager(npmRoot, {})).toBe("npm");
});

test("runPackageScript uses the right argument conventions", () => {
  expect(runPackageScript("bun", "check", ["--watch"])).toEqual(["bun", "run", "check", "--watch"]);
  expect(runPackageScript("pnpm", "check", ["--watch"])).toEqual(["pnpm", "run", "check", "--", "--watch"]);
  expect(runPackageScript("npm", "check", ["--watch"])).toEqual(["npm", "run", "check", "--", "--watch"]);
  expect(runPackageScript("yarn", "check", ["--watch"])).toEqual(["yarn", "run", "check", "--watch"]);
});

test("package manager helpers build install update exec and dlx commands", () => {
  expect(installCommand("pnpm")).toEqual(["pnpm", "install"]);
  expect(updateLatestCommand("bun", ["--dry-run"])).toEqual(["bun", "update", "--latest", "--dry-run"]);
  expect(execToolCommand("npm", "turbo", ["run", "build"])).toEqual(["npx", "turbo", "run", "build"]);
  expect(dlxToolCommand("pnpm", "vercel", ["deploy"])).toEqual(["pnpm", "dlx", "vercel", "deploy"]);
});

test("parseProcessLine reads ps rows", () => {
  expect(parseProcessLine("123 1 123 S 01:02 0.0 0.1 python scripts/worker.py")).toMatchObject({
    pid: 123,
    ppid: 1,
    pgid: 123,
    stat: "S",
    etime: "01:02",
    command: "python scripts/worker.py",
  });
});

test("parseLsofCwds maps cwd records by pid", () => {
  const cwd = parseLsofCwds(["p123", "cpython", "fcwd", "n/tmp/repo", "p456", "fmem", "n/nope"].join("\n"));
  expect(cwd.get(123)).toBe("/tmp/repo");
  expect(cwd.has(456)).toBe(false);
});

test("parseLsofNamesByPid maps names by pid", () => {
  const names = parseLsofNamesByPid(["p123", "nTCP *:3000 (LISTEN)", "nTCP 127.0.0.1:5173 (LISTEN)"].join("\n"));
  expect(names.get(123)).toEqual(["TCP *:3000 (LISTEN)", "TCP 127.0.0.1:5173 (LISTEN)"]);
});

test("upsertManagedBlock appends dispatch agent instructions to existing content", () => {
  const block = [
    "<!-- dispatch:agents:start -->",
    "## Dispatch",
    "<!-- dispatch:agents:end -->",
  ].join("\n");

  expect(upsertManagedBlock("# Existing\n", block)).toBe(`# Existing\n\n${block}\n`);
});

test("upsertManagedBlock replaces only the dispatch managed block", () => {
  const oldBlock = [
    "<!-- dispatch:agents:start -->",
    "old",
    "<!-- dispatch:agents:end -->",
  ].join("\n");
  const newBlock = [
    "<!-- dispatch:agents:start -->",
    "new",
    "<!-- dispatch:agents:end -->",
  ].join("\n");

  expect(upsertManagedBlock(`# Existing\n\n${oldBlock}\n\nKeep me.\n`, newBlock)).toBe(`# Existing\n\n${newBlock}\n\nKeep me.\n`);
});

test("upsertManagedBlock reports partial marker conflicts", () => {
  const block = [
    "<!-- dispatch:agents:start -->",
    "## Dispatch",
    "<!-- dispatch:agents:end -->",
  ].join("\n");

  expect(upsertManagedBlock("# Existing\n<!-- dispatch:agents:start -->\n", block)).toEqual({
    conflict: expect.stringContaining("partial Dispatch agent instructions block"),
  });
});

test("planAgentInstructionsUpdate creates AGENTS.md content for target repos", async () => {
  const root = join(tmpRoot, "agents-create");
  await mkdir(root, { recursive: true });

  const plan = planAgentInstructionsUpdate(testContext(root));

  expect(plan.conflict).toBeUndefined();
  expect(plan.content).toContain("<!-- dispatch:agents:start -->");
  expect(plan.content).toContain("dispatch check");
  expect(plan.content).toContain("<!-- dispatch:agents:end -->");
});

function testContext(repoRoot: string): DispatchContext {
  return {
    startCwd: repoRoot,
    repoRoot,
    packageJson: {
      name: "target-repo",
      scripts: {},
    },
    packageManager: "bun",
    config: {},
  };
}
