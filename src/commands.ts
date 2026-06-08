import { cleanArtifacts, cleanPorts, doctor, listProjectScripts, syncRepo, updateAll } from "./builtins.ts";
import { normalizeCommand } from "./config.ts";
import { bunRunScript, isTurboRepo, resolveScriptName } from "./project.ts";
import type { DispatchCommand, DispatchContext, ResolvedCommand } from "./types.ts";

function customOrScript(context: DispatchContext, args: string[], commandName: string, scriptNames: string[], fallback?: ResolvedCommand): ResolvedCommand | void {
  const custom = context.config.commands?.[commandName];
  if (custom) return { cmd: [...normalizeCommand(custom), ...args], cwd: context.repoRoot };

  const configuredAliases = context.config.scriptAliases?.[commandName] ?? [];
  const script = resolveScriptName(context.packageJson, [...configuredAliases, ...scriptNames]);
  if (script) return { cmd: bunRunScript(script, args), cwd: context.repoRoot };

  return fallback;
}

function turboTask(context: DispatchContext, task: string, args: string[] = []): ResolvedCommand | void {
  if (!isTurboRepo(context.packageJson)) return undefined;
  return { cmd: ["bunx", "--bun", "turbo", "run", task, ...args], cwd: context.repoRoot };
}

function scriptOrTurbo(context: DispatchContext, args: string[], commandName: string, scriptNames: string[], turboName = commandName): ResolvedCommand | void {
  return customOrScript(context, args, commandName, scriptNames, turboTask(context, turboName, args));
}

function runPackageScript(script: string): ResolvedCommand {
  return { cmd: bunRunScript(script), cwd: process.cwd() };
}

export const commands: DispatchCommand[] = [
  {
    name: "dev",
    category: "core",
    summary: "Run the project dev server.",
    examples: ["dispatch dev", "dx dev -- --host 0.0.0.0"],
    run: (context, args) => {
      const custom = context.config.commands?.dev;
      if (custom) return { cmd: [...normalizeCommand(custom), ...args], cwd: context.repoRoot };

      const appFilter = context.config.appFilter;
      if (appFilter && isTurboRepo(context.packageJson)) {
        return { cmd: ["bunx", "--bun", "turbo", "run", "dev", `--filter=${appFilter}`, ...args], cwd: context.repoRoot };
      }

      return customOrScript(context, args, "dev", ["dev", "dev:web", "dev:app"], turboTask(context, "dev", args));
    },
  },
  {
    name: "start",
    category: "core",
    summary: "Start the built project.",
    run: (context, args) => customOrScript(context, args, "start", ["start", "app:start"]),
  },
  {
    name: "preview",
    category: "core",
    summary: "Run the preview server when the project has one.",
    run: (context, args) => customOrScript(context, args, "preview", ["preview", "preview:web", "website:preview"], turboTask(context, "preview", args)),
  },
  {
    name: "menu",
    aliases: ["runner", "launcher"],
    category: "core",
    summary: "Open a project runner/menu if the project defines one.",
    run: (context, args) => customOrScript(context, args, "menu", ["menu", "runner", "launcher", "dev:menu"]),
  },
  {
    name: "install",
    aliases: ["i"],
    category: "repo",
    summary: "Run Bun install at the project root.",
    run: (context, args) => ({ cmd: ["bun", "install", ...args], cwd: context.repoRoot }),
  },
  {
    name: "update",
    aliases: ["update-all", "up"],
    category: "repo",
    summary: "Update dependencies. Uses project update script when present, otherwise updates all workspaces.",
    run: async (context, args) => {
      const scripted = customOrScript(context, args, "update", ["update", "update-all", "deps:update"]);
      if (scripted) return scripted;
      await updateAll(context, args);
    },
  },
  {
    name: "sync",
    category: "repo",
    summary: "Sync the repo. Uses project sync script when present, otherwise pull/rebase or --hard reset.",
    examples: ["dispatch sync", "dispatch sync --hard", "dispatch sync --dry-run"],
    run: async (context, args) => {
      const forcedBuiltin = args.includes("--builtin");
      const forwarded = args.filter((arg) => arg !== "--builtin");
      if (!forcedBuiltin) {
        const scripted = customOrScript(context, forwarded, "sync", ["sync", "sync:main", "branch:sync-main"]);
        if (scripted) return scripted;
      }
      await syncRepo(context, forwarded);
    },
  },
  {
    name: "port",
    aliases: ["ports", "portclean", "pc"],
    category: "repo",
    summary: "Clean common local dev ports and stale Next dev locks.",
    examples: ["dispatch port", "dispatch port --ports 3000,5173", "dispatch port --dry-run"],
    run: async (context, args) => {
      const forcedBuiltin = args.includes("--builtin");
      const forwarded = args.filter((arg) => arg !== "--builtin");
      if (!forcedBuiltin) {
        const scripted = customOrScript(context, forwarded, "port", ["port", "portclean", "checkport"]);
        if (scripted) return scripted;
      }
      await cleanPorts(context, forwarded);
    },
  },
  {
    name: "clean",
    category: "repo",
    summary: "Remove common local build/install artifacts.",
    examples: ["dispatch clean --dry-run", "dispatch clean"],
    run: async (context, args) => {
      const scripted = customOrScript(context, args, "clean", ["clean", "cleanup", "cleanup:build", "app:clean"]);
      if (scripted) return scripted;
      await cleanArtifacts(context, args);
    },
  },
  {
    name: "doctor",
    category: "repo",
    summary: "Print project/runtime diagnostics.",
    run: async (context) => doctor(context),
  },

  {
    name: "lint",
    category: "quality",
    summary: "Run lint.",
    run: (context, args) => scriptOrTurbo(context, args, "lint", ["lint"]),
  },
  {
    name: "fix",
    aliases: ["lint:fix"],
    category: "quality",
    summary: "Run lint/style fixes.",
    run: (context, args) => scriptOrTurbo(context, args, "fix", ["fix", "lint:fix"]),
  },
  {
    name: "typecheck",
    aliases: ["tc"],
    category: "quality",
    summary: "Run typecheck.",
    run: (context, args) => scriptOrTurbo(context, args, "typecheck", ["typecheck", "dev:typecheck"], "typecheck"),
  },
  {
    name: "test",
    aliases: ["t"],
    category: "quality",
    summary: "Run tests.",
    run: (context, args) => scriptOrTurbo(context, args, "test", ["test"], "test"),
  },
  {
    name: "check",
    category: "quality",
    summary: "Run normal local confidence checks.",
    run: (context, args) => scriptOrTurbo(context, args, "check", ["check", "ci:verify", "verify"], "check"),
  },
  {
    name: "ci",
    category: "quality",
    summary: "Run full CI confidence path.",
    run: (context, args) => customOrScript(context, args, "ci", ["ci", "appci", "siteci"], turboTask(context, "ci", args)),
  },
  {
    name: "build",
    aliases: ["b"],
    category: "quality",
    summary: "Build the project.",
    run: (context, args) => scriptOrTurbo(context, args, "build", ["build", "app:build"], "build"),
  },
  {
    name: "verify",
    category: "quality",
    summary: "Run project verification/preflight when available.",
    run: (context, args) => customOrScript(context, args, "verify", ["verify", "preflight", "ship:verify", "bundle:verify", "verify:generate"], turboTask(context, "check", args)),
  },
  {
    name: "prepare",
    category: "quality",
    summary: "Prepare/generated inputs when the project defines it.",
    run: (context, args) => customOrScript(context, args, "prepare", ["prepare", "build:prepare", "release:prepare"]),
  },

  {
    name: "deploy",
    aliases: ["dp", "ship"],
    category: "deploy",
    summary: "Deploy using project deploy script, configured script, or Vercel fallback.",
    run: (context, args) => {
      const configured = context.config.deployScript;
      if (configured) return { cmd: bunRunScript(configured, args), cwd: context.repoRoot };
      const scripted = customOrScript(context, args, "deploy", ["deploy", "deploy:prod", "deploy:web", "release:ship", "ship"]);
      if (scripted) return scripted;
      return { cmd: ["bunx", "--bun", "vercel", "deploy", "--prod", ...args], cwd: context.repoRoot };
    },
  },
  {
    name: "release",
    category: "deploy",
    summary: "Run release flow when available.",
    run: (context, args) => customOrScript(context, args, "release", ["release", "release:build", "release:prepare", "release:cut"]),
  },

  {
    name: "ops",
    category: "ops",
    summary: "List or run operational/project scripts through one command.",
    usage: "dispatch ops [list|script-name] [...args]",
    run: (context, args) => {
      const [name, ...rest] = args;
      if (!name || name === "list" || name === "--help" || name === "-h") {
        printOps(context);
        return;
      }
      const script = resolveScriptName(context.packageJson, [name]);
      if (script) return { cmd: bunRunScript(script, rest), cwd: context.repoRoot };
      console.error(`Unknown ops script: ${name}`);
      printOps(context);
      process.exit(1);
    },
  },
  {
    name: "scripts",
    category: "debug",
    summary: "List raw package.json scripts.",
    run: (context) => listProjectScripts(context),
  },
];

export function buildCommandMap(): Map<string, DispatchCommand> {
  const map = new Map<string, DispatchCommand>();
  for (const command of commands) {
    map.set(command.name, command);
    for (const alias of command.aliases ?? []) map.set(alias, command);
  }
  return map;
}

export function printCommandList(): void {
  const categories = ["core", "repo", "quality", "deploy", "ops", "debug"] as const;
  console.log("Dispatch");
  console.log("");
  console.log("Usage:");
  console.log("  dispatch <command> [...args]");
  console.log("  dx <command> [...args]");
  console.log("");

  for (const category of categories) {
    const visible = commands.filter((command) => command.category === category && !command.hidden);
    if (!visible.length) continue;
    console.log(`${category}:`);
    for (const command of visible) {
      const aliases = command.aliases?.length ? ` (${command.aliases.join(", ")})` : "";
      console.log(`  ${command.name.padEnd(16)} ${command.summary}${aliases}`);
    }
    console.log("");
  }
}

function printOps(context: DispatchContext): void {
  const scripts = Object.keys(context.packageJson.scripts ?? {}).sort();
  const ops = scripts.filter((script) => /^(deploy|env|config|design|mimi|stripe|gcs|media|profiles|audit|users|cities|resend|release|module|convex|sync|refresh|deps):?/.test(script));
  const list = ops.length ? ops : scripts;

  console.log("Project ops scripts");
  console.log("");
  for (const script of list) {
    console.log(`  ${script}`);
  }
  console.log("");
  console.log("Run one with:");
  console.log("  dispatch ops <script-name> [...args]");
}

export function fallbackPackageScript(context: DispatchContext, name: string, args: string[]): ResolvedCommand | null {
  const alias = context.config.aliases?.[name];
  const target = alias ?? name;
  if (context.packageJson.scripts?.[target]) return { cmd: bunRunScript(target, args), cwd: context.repoRoot };
  return null;
}

export { runPackageScript };
