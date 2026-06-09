# Dispatch

Dispatch is a small command runner for project workflows.

It gives each repo one consistent command, `dispatch`, while still letting the repo decide what each workflow actually does.

## Install

```bash
bun add -d @memoir/dispatch
```

Then initialize the common scripts:

```bash
dispatch init
```

## Command

```bash
dispatch <command> [...args]
```

Examples:

```bash
dispatch check
dispatch sync
dispatch deploy
dispatch convex dev
dispatch ps
```

## Generated Scripts

`dispatch init` adds simple package scripts when they are missing or already managed by Dispatch:

```json
{
  "scripts": {
    "ci": "dispatch ci",
    "check": "dispatch check",
    "lint": "dispatch lint",
    "lint:fix": "dispatch lint --fix",
    "typecheck": "dispatch typecheck",
    "test": "dispatch test",
    "test:watch": "dispatch test --watch",
    "test:coverage": "dispatch test --coverage",
    "clean": "dispatch clean",
    "dev": "dispatch dev",
    "sync": "dispatch sync",
    "portclean": "dispatch port",
    "ps": "dispatch ps",
    "update-all": "dispatch update",
    "dp": "dispatch deploy"
  }
}
```

If the repo looks like it uses Convex, `init` also adds:

```json
{
  "scripts": {
    "convex": "dispatch convex",
    "convex:dev": "dispatch convex dev",
    "convex:deploy": "dispatch convex deploy"
  }
}
```

## Standard Commands

Quality:

```bash
dispatch lint
dispatch typecheck
dispatch test
dispatch check
dispatch ci
```

Repo operations:

```bash
dispatch sync
dispatch port
dispatch ps
dispatch clean
dispatch update
```

Deploy:

```bash
bun run dp
dispatch deploy
```

`dispatch deploy` prefers project scripts such as `deploy`, `deploy:prod`, and `deploy:web`. If none exist, it falls back to Vercel.

Convex:

```bash
dispatch convex dev
dispatch convex deploy
```

If `convex` is installed in the repo, Dispatch runs the local binary. Otherwise it uses the package manager's one-off runner.

## Command Resolution

Dispatch resolves commands in this order:

1. `dispatch.config.ts` command override
2. project command file
3. package script
4. built-in command

Project command files live at:

```txt
.dispatch/commands/<name>.ts
.dispatch/<name>.ts
dispatch/commands/<name>.ts
dispatch/<name>.ts
```

## Package Managers

Dispatch itself runs on Bun. Project scripts are run with the package manager detected from the repo:

```txt
packageManager field
pnpm-lock.yaml
package-lock.json / npm-shrinkwrap.json
yarn.lock
bun.lock / bun.lockb
```

## Publishing

Dry-run package contents:

```bash
bun run pack:dry-run
```

Publish:

```bash
bun publish
```

## License

MIT
