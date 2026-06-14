import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = join(import.meta.dir, "..");
const scratch = await mkdtemp(join(tmpdir(), "dispatch-smoke-"));
const npmCache = join(tmpdir(), "dispatch-npm-cache");

try {
  await run(["npm", "--cache", npmCache, "pack", "--pack-destination", scratch], repoRoot);
  const tarball = join(scratch, await packedTarballName(scratch));

  await writeFile(join(scratch, "package.json"), JSON.stringify({
    name: "dispatch-smoke",
    private: true,
    packageManager: "bun@1.3.14",
    devDependencies: {},
  }, null, 2) + "\n");

  await run(["bun", "add", "-d", tarball], scratch);
  await run(["bunx", "dispatch"], scratch);
  await run(["bun", "sync", "--dry-run"], scratch);
  await run(["bun", "sync-careful", "--dry-run"], scratch);
} finally {
  await rm(scratch, { recursive: true, force: true });
}

async function packedTarballName(directory: string): Promise<string> {
  const tarballs = (await readdir(directory)).filter((entry) => entry.endsWith(".tgz"));
  if (tarballs.length !== 1) {
    throw new Error(`Expected one packed tarball in ${directory}, found ${tarballs.length}.`);
  }
  return tarballs[0];
}

async function run(cmd: string[], cwd: string): Promise<void> {
  console.log(`$ ${cmd.join(" ")}`);
  const proc = Bun.spawn(cmd, { cwd, stdio: ["ignore", "inherit", "inherit"] });
  const exitCode = await proc.exited;
  if (exitCode !== 0) process.exit(exitCode);
}
