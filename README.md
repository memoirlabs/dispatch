# Dispatch

Dispatch is a Bun-powered command dispatcher for repeated project workflows.

It gives a repository a small, consistent command surface while keeping the actual behavior project-owned. Commands can come from package scripts, config overrides, or one-file command modules checked into the project.

## Install

```bash
bun add -d @memoir/dispatch
```

Dispatch requires Bun at runtime because the package bin runs TypeScript directly.

## Binaries

```bash
dispatch
dx
```

`dx` is a short alias for `dispatch`.

## Quick Start

Run a command directly:

```bash
dispatch check
dx test
dx processes
```

Or add package scripts:

```json
{
  "scripts": {
    "check": "dispatch check",
    "test": "dispatch test",
    "lint": "dispatch lint",
    "typecheck": "dispatch typecheck"
  }
}
```

Arguments are forwarded to the resolved command:

```bash
dispatch test -- --watch
dispatch lint -- --fix
```

## How Commands Resolve

When you run:

```bash
dispatch <name> [...args]
```

Dispatch resolves in this order:

1. `dispatch.config.ts` command override
2. project command file
3. package manager script
4. built-in command

The goal is to let each repository own its specific workflows without rewriting the same dispatcher code.

## Project Command Files

For custom workflows, add one file per command:

```txt
.dispatch/commands/<name>.ts
```

Example:

```ts
import type { DispatchContext } from "@memoir/dispatch";

export default {
  summary: "Run the local seed task.",
  run: (_context: DispatchContext, args: string[]) => ({
    cmd: ["bun", "run", "scripts/seed.ts", ...args],
  }),
};
```

Simple commands can export a string or argv array:

```ts
export default "pnpm run db:migrate";
```

Supported lookup locations:

```txt
.dispatch/commands/<name>.ts
.dispatch/<name>.ts
dispatch/commands/<name>.ts
dispatch/<name>.ts
```

Command names may also use aliases. For example, if a built-in command has an alias, Dispatch checks the alias and canonical command name.

## Config

Optional config files at the project root:

```txt
dispatch.config.ts
dispatch.config.js
dispatch.config.mjs
.dispatchrc.json
```

Example:

```ts
import type { DispatchConfig } from "@memoir/dispatch";

const config: DispatchConfig = {
  commandDir: ".dispatch/commands",
  ports: [3000, 5173],
  scriptAliases: {
    typecheck: ["type-check"],
  },
  commands: {
    // Full command override.
    // check: "bun run lint && bun run typecheck && bun run test",
  },
};

export default config;
```

## Package Managers

Dispatch itself runs on Bun. Project scripts are run with the package manager used by the repository.

Detection order:

```txt
packageManager field
bun.lock / bun.lockb
pnpm-lock.yaml
yarn.lock
package-lock.json / npm-shrinkwrap.json
```

If no package manager is detected, Dispatch defaults to Bun.

## Built-In Commands

Built-ins are intentionally small and generic. Project-specific behavior should live in package scripts or command files.

Common commands include:

```txt
dev
start
preview
install
check
lint
typecheck
test
build
clean
port
ps
doctor
scripts
```

List available commands:

```bash
dispatch list
```

### Process Inspection

Use `dispatch processes` to surface processes that appear to belong to the current repository:

```bash
dispatch processes
dispatch processes --json
dispatch processes --deep
```

Default matching checks:

```txt
process cwd inside repo
command line contains repo root
descendants of matched processes
listening ports for matched processes
```

`--deep` also scans open files under the repository with `lsof +D`. That is slower, but useful when a worker process is holding project files open after the original command exits.

## Publishing

The package is configured for the `@memoir` npm scope.

Dry-run the package contents:

```bash
bun run pack:dry-run
```

Publish:

```bash
bun publish
```

Current publish config:

```json
{
  "publishConfig": {
    "access": "restricted"
  }
}
```

Change `publishConfig.access` to `"public"` before publishing if this package should be publicly installable.

## License

MIT
