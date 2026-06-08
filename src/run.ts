import type { ResolvedCommand } from "./types.ts";

export function formatCommand(command: string[]): string {
  return command.map(formatCommandPart).join(" ");
}

export function formatCommandPart(part: string): string {
  if (/^[a-zA-Z0-9_./:@=+,%^-]+$/.test(part)) return part;
  return JSON.stringify(part);
}

export async function runResolved(command: ResolvedCommand): Promise<number> {
  const proc = Bun.spawn(command.cmd, {
    cwd: command.cwd,
    env: {
      ...process.env,
      ...command.env,
    },
    stdin: command.stdin ?? "inherit",
    stdout: command.stdout ?? "inherit",
    stderr: command.stderr ?? "inherit",
  });

  return proc.exited;
}

export async function runCapture(cmd: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    Bun.readableStreamToText(proc.stdout),
    Bun.readableStreamToText(proc.stderr),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
}

export async function commandExists(name: string, cwd: string): Promise<boolean> {
  const result = await runCapture(["bash", "-lc", `command -v ${shellQuote(name)} >/dev/null 2>&1`], cwd);
  return result.exitCode === 0;
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
