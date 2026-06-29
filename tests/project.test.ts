import { afterAll, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parseDivergenceCounts } from "../src/builtins.ts";
import {
  detectPackageManager,
  dlxToolCommand,
  execToolCommand,
  installCommand,
  runPackageScript,
  updateLatestCommand,
} from "../src/project.ts";
import { deployCommand } from "../src/commands/deploy.ts";
import { resolveLocalCommand } from "../src/local-commands.ts";
import { parseLsofCwds, parseLsofNamesByPid, parseProcessLine } from "../src/processes.ts";
import { isDispatchInitialized, isManagedScript, managedScripts, planAgentInstructionsUpdate, planDispatchWorkspaceUpdate, updateManagedPackageScripts, upsertManagedBlock } from "../src/standard.ts";
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

test("detectPackageManager defaults to bun without package manager evidence", async () => {
  const root = join(tmpRoot, "default-bun");
  await mkdir(root, { recursive: true });

  expect(detectPackageManager(root, {})).toBe("bun");
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

test("managed package scripts include the default Bun-friendly command surface", () => {
  expect(managedScripts()).toEqual({
    clean: "bun run dispatch/scripts/clean.ts",
    sync: "bun run dispatch/scripts/sync.ts",
    "sync-careful": "bun run dispatch/scripts/sync-careful.ts",
    port: "bun run dispatch/scripts/port.ts",
    portclean: "bun run dispatch/scripts/portclean.ts",
    processes: "bun run dispatch/scripts/processes.ts",
    update: "bun run dispatch/scripts/update.ts",
    "update-all": "bun run dispatch/scripts/update-all.ts",
    scripts: "bun run dispatch/scripts/scripts.ts",
    ops: "bun run dispatch/scripts/ops.ts",
    menu: "bun run dispatch/scripts/menu.ts",
  });
});

test("managed package script update writes Dispatch utility scripts by default", () => {
  const packageJson = {
    name: "target-repo",
    scripts: {
      dev: "vite dev",
      sync: "bash scripts/sync-with-main.sh",
      portclean: "bash scripts/portclean.sh",
    },
  };

  const result = updateManagedPackageScripts(packageJson);

  expect(packageJson.scripts.dev).toBe("vite dev");
  expect(packageJson.scripts.sync).toBe("bun run dispatch/scripts/sync.ts");
  expect(packageJson.scripts.portclean).toBe("bun run dispatch/scripts/portclean.ts");
  expect(packageJson.scripts.check).toBeUndefined();
  expect(packageJson.scripts.lint).toBeUndefined();
  expect(packageJson.scripts.port).toBe("bun run dispatch/scripts/port.ts");
  expect(packageJson.scripts["sync-careful"]).toBe("bun run dispatch/scripts/sync-careful.ts");
  expect(packageJson.scripts["update-all"]).toBe("bun run dispatch/scripts/update-all.ts");
  expect(result.changes).toContain("package.json scripts.sync");
  expect(result.changes).toContain("package.json scripts.portclean");
});

test("managed package script update does not manage normal project dev script", () => {
  const packageJson = {
    name: "target-repo",
    scripts: {
      dev: "vite dev",
      sync: "bash scripts/sync-with-main.sh",
      portclean: "bash scripts/portclean.sh",
    },
  };

  const result = updateManagedPackageScripts(packageJson, true);

  expect(packageJson.scripts.dev).toBe("vite dev");
  expect(packageJson.scripts.sync).toBe("bun run dispatch/scripts/sync.ts");
  expect(packageJson.scripts.portclean).toBe("bun run dispatch/scripts/portclean.ts");
  expect(result.changes).not.toContain("package.json scripts.dev");
});

test("managed script detection recognizes generated optional Dispatch script wrappers", () => {
  expect(isManagedScript("bun run dispatch/scripts/convex.ts", "convex")).toBe(true);
  expect(isManagedScript("bun run dispatch/scripts/convex-dev.ts", "convex:dev")).toBe(true);
  expect(isManagedScript("bun run dispatch/scripts/convex-deploy.ts", "convex:deploy")).toBe(true);
});

test("parseDivergenceCounts reads git ahead behind counts", () => {
  expect(parseDivergenceCounts("0\t3\n")).toEqual({ ahead: 0, behind: 3 });
  expect(parseDivergenceCounts("2 0")).toEqual({ ahead: 2, behind: 0 });
  expect(parseDivergenceCounts("not counts")).toBeNull();
});

test("resolveLocalCommand supports visible Dispatch command files", async () => {
  const root = join(tmpRoot, "typescript-command");
  const commandPath = join(root, "dispatch/commands/sync.ts");
  await mkdir(join(root, "dispatch/commands"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "typescript-command" }));
  await writeFile(commandPath, "export default ['git', 'fetch', 'origin'];\n");

  const resolved = await resolveLocalCommand(testContext(root), "sync", ["--dry-run"]);

  expect(resolved).toEqual({
    cmd: ["git", "fetch", "origin", "--dry-run"],
    cwd: root,
  });
});

test("resolveLocalCommand keeps legacy hidden Dispatch command files working", async () => {
  const root = join(tmpRoot, "legacy-typescript-command");
  const commandPath = join(root, ".dispatch/commands/sync.ts");
  await mkdir(join(root, ".dispatch/commands"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "legacy-typescript-command" }));
  await writeFile(commandPath, "export default ['git', 'fetch', 'origin'];\n");

  const resolved = await resolveLocalCommand(testContext(root), "sync", ["--dry-run"]);

  expect(resolved).toEqual({
    cmd: ["git", "fetch", "origin", "--dry-run"],
    cwd: root,
  });
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
  expect(plan.content).toContain("dispatch/agents/default.md");
  expect(plan.content).toContain("<!-- dispatch:agents:end -->");
});

test("planDispatchWorkspaceUpdate creates visible Dispatch workspace files", async () => {
  const root = join(tmpRoot, "dispatch-workspace-create");
  await mkdir(root, { recursive: true });

  const plan = planDispatchWorkspaceUpdate(testContext(root));

  expect(plan.conflicts).toEqual([]);
  expect(plan.files.map((file) => file.path).sort()).toEqual([
    "dispatch/README.md",
    "dispatch/agents/README.md",
    "dispatch/agents/bun-astro.md",
    "dispatch/agents/bun-next.md",
    "dispatch/agents/bun-svelte.md",
    "dispatch/agents/default.md",
    "dispatch/agents/quant.md",
    "dispatch/commands/README.md",
    "dispatch/scripts/README.md",
    "dispatch/scripts/clean.ts",
    "dispatch/scripts/convex-deploy.ts",
    "dispatch/scripts/convex-dev.ts",
    "dispatch/scripts/convex.ts",
    "dispatch/scripts/menu.ts",
    "dispatch/scripts/ops.ts",
    "dispatch/scripts/port.ts",
    "dispatch/scripts/portclean.ts",
    "dispatch/scripts/processes.ts",
    "dispatch/scripts/scripts.ts",
    "dispatch/scripts/sync-careful.ts",
    "dispatch/scripts/sync.ts",
    "dispatch/scripts/update-all.ts",
    "dispatch/scripts/update.ts",
  ]);
  expect(plan.files.find((file) => file.path === "dispatch/agents/default.md")?.content).toContain("dispatch/commands/<name>.ts");
  expect(plan.files.find((file) => file.path === "dispatch/agents/bun-svelte.md")?.content).toContain("SvelteKit");
  expect(plan.files.find((file) => file.path === "dispatch/agents/bun-next.md")?.content).toContain("Server Component");
  expect(plan.files.find((file) => file.path === "dispatch/agents/bun-astro.md")?.content).toContain("Astro");
  expect(plan.files.find((file) => file.path === "dispatch/agents/quant.md")?.content).toContain("lookahead bias");
  expect(plan.files.find((file) => file.path === "dispatch/scripts/sync.ts")?.content).toContain('const command = "sync"');
  expect(plan.files.find((file) => file.path === "dispatch/scripts/convex-dev.ts")?.content).toContain('const defaultArgs = ["dev"]');
});

test("isDispatchInitialized requires package dependency and managed workflow script", () => {
  const root = join(tmpRoot, "dispatch-initialized");

  expect(isDispatchInitialized(testContext(root))).toBe(false);
  expect(isDispatchInitialized({
    ...testContext(root),
    packageJson: {
      name: "target-repo",
      devDependencies: { "@memoir/dispatch": "^0.1.0" },
      scripts: { sync: "dispatch sync" },
    },
  })).toBe(true);
  expect(isDispatchInitialized({
    ...testContext(root),
    packageJson: {
      name: "target-repo",
      devDependencies: { "@memoir/dispatch": "^0.1.0" },
      scripts: { sync: "custom sync" },
    },
  })).toBe(false);
});

test("deploy command uses only explicitly configured repo deploy scripts", async () => {
  const root = join(tmpRoot, "configured-deploy-script");
  const context = {
    ...testContext(root),
    packageJson: {
      name: "target-repo",
      scripts: {
        "deploy:gce": "bun run scripts/deploy-gce.ts",
      },
    },
    config: {
      deployScript: "deploy:gce",
    },
  };

  const resolved = await deployCommand.run(context, ["--skip-checks", "--dry-run"]);

  expect(resolved).toEqual({
    cmd: ["bun", "run", "deploy:gce", "--dry-run"],
    cwd: root,
  });
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
