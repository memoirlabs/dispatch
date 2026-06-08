# Dispatch

Tiny Bun-only command dispatcher for the repeated project commands you keep copying between repos.

It exposes two binaries:

```bash
dispatch
dx
```

The package is intentionally small:

- no Commander
- no yargs
- no runtime dependencies
- Bun TypeScript directly through `#!/usr/bin/env bun`
- project-local scripts are preferred when they exist
- fast built-ins cover the repeated stuff: ports, sync, update all workspaces, clean, doctor

## Why this exists

Across the inspected repos, the repeated shape was:

```txt
dev
build
check
ci
portclean
sync
update-all
deploy / dp
release
ops/provider scripts
```

`dispatch` standardizes that without forcing every repo to use the exact same internal folder layout.

## Install inside a project

For a workspace repo:

```bash
bun add -d @memoir/dispatch
```

For local development from this folder:

```bash
bun install
bun link
cd ../some-project
bun link @memoir/dispatch
```

Or copy it into a monorepo as:

```txt
packages/dispatch
```

Then add:

```json
{
  "devDependencies": {
    "@memoir/dispatch": "workspace:*"
  }
}
```

## Root scripts to use everywhere

```json
{
  "scripts": {
    "dev": "dispatch dev",
    "port": "dispatch port",
    "portclean": "dispatch port",
    "sync": "dispatch sync",
    "update": "dispatch update",
    "update-all": "dispatch update",
    "check": "dispatch check",
    "ci": "dispatch ci",
    "build": "dispatch build",
    "test": "dispatch test",
    "deploy": "dispatch deploy",
    "dp": "dispatch deploy",
    "ops": "dispatch ops"
  }
}
```

Then your muscle memory stays simple:

```bash
bun run dev
bun run port
bun run sync
bun run ci
bun run dp
```

Direct usage also works:

```bash
dispatch dev
dx port
dx ci
dx dp
```

## Command behavior

Dispatch tries hard to **use the current repo's scripts first**.

Example:

```bash
dispatch ci
```

Resolution:

1. `dispatch.config.ts` override for `ci`
2. current repo's `package.json` script named `ci`
3. Turbo `ci` task if the repo uses Turbo
4. error if none exists

So it adapts cleanly to Memoir, NiceJewish, TrenchClaw, Liq, Pump Kit, landing apps, and smaller single-package projects.

## Built-ins

### `dispatch port`

Cleans common dev ports and stale Next dev lock files.

```bash
dispatch port
dispatch port --ports 3000,5173
dispatch port --dry-run
```

If the project has `port`, `portclean`, or `checkport`, Dispatch runs that first. To force the built-in:

```bash
dispatch port --builtin
```

### `dispatch sync`

Uses the project `sync`, `sync:main`, or `branch:sync-main` script when present.

Without a project script, the built-in default is safe:

```bash
git pull --rebase --autostash
bun install
```

For the hard-reset style used in some internal scripts:

```bash
dispatch sync --hard
```

That does:

```bash
git fetch origin
git reset --hard origin/<current-branch>
git clean -fd
```

### `dispatch update`

Uses `update`, `update-all`, or `deps:update` if present.

Without a project script, it discovers workspaces and runs:

```bash
bun update --latest
```

inside every dependency-bearing workspace.

### `dispatch clean`

Removes common local artifacts:

```txt
node_modules
bun.lockb
.turbo
.next
.svelte-kit
dist
coverage
```

Use dry-run first:

```bash
dispatch clean --dry-run
```

### `dispatch doctor`

Prints project root, Bun version, package manager, Turbo presence, Git presence, and script count.

## Config

Optional file at project root:

```ts
import type { DispatchConfig } from "@memoir/dispatch";

const config: DispatchConfig = {
  ports: [3000, 3001, 5173],
  appFilter: "@memoir/full-stack-next-app",
  deployScript: "deploy:prod",
  syncMode: "pull",
  scriptAliases: {
    port: ["portclean"],
    verify: ["preflight"]
  },
  commands: {
    // full override
    // dev: ["bunx", "--bun", "turbo", "run", "dev", "--filter=@memoir/full-stack-next-app"]
  }
};

export default config;
```

## Ops

List operational scripts:

```bash
dispatch ops list
```

Run one:

```bash
dispatch ops env:vercel:verify
dispatch ops stripe:sync-catalog -- --check
dispatch ops media:gcs-content:repair -- --dry-run
```

`ops` is intentionally just a clean entry point over existing project scripts. Secrets and provider logic stay in the project.

## Publishing

Private package:

```bash
bun publish --access restricted
```

Compile optional native-ish executable:

```bash
bun run build:binary
```

The normal recommended mode is still package-bin TypeScript, because Bun runs it directly and keeps the package easy to edit.
