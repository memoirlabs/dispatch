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

const tmpRoot = join(import.meta.dir, ".tmp");

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

test("detectPackageManager prefers packageManager over lockfiles", async () => {
  const root = join(tmpRoot, "declared");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "bun.lock"), "");

  expect(detectPackageManager(root, { packageManager: "pnpm@9.0.0" })).toBe("pnpm");
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
