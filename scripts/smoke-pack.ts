import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = join(import.meta.dir, "..");
const scratch = await mkdtemp(join(tmpdir(), "dispatch-smoke-"));

try {
  await run(["bun", "pm", "pack"], repoRoot);
  const tarball = join(repoRoot, "memoir-dispatch-0.1.0.tgz");

  await writeFile(join(scratch, "package.json"), JSON.stringify({
    name: "dispatch-smoke",
    private: true,
    packageManager: "bun@1.3.14",
    devDependencies: {},
  }, null, 2) + "\n");

  await run(["bun", "add", "-d", tarball], scratch);
  await run(["bunx", "dispatch", "init"], scratch);
  await run(["bun", "run", "check"], scratch);
  await run(["bun", "run", "ps"], scratch);
} finally {
  await rm(scratch, { recursive: true, force: true });
  await rm(join(repoRoot, "memoir-dispatch-0.1.0.tgz"), { force: true });
}

async function run(cmd: string[], cwd: string): Promise<void> {
  console.log(`$ ${cmd.join(" ")}`);
  const proc = Bun.spawn(cmd, { cwd, stdio: ["ignore", "inherit", "inherit"] });
  const exitCode = await proc.exited;
  if (exitCode !== 0) process.exit(exitCode);
}
