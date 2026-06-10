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
dispatch processes
```

## Generated Scripts

`dispatch init` applies the static script template shipped at `templates/package-scripts.json`. It adds these package scripts when they are missing or already managed by Dispatch:

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
    "portclean": "dispatch portclean",
    "update-all": "dispatch update-all",
    "dp": "dispatch dp",
    "menu": "dispatch menu"
  }
}
```

After that, people use normal Bun scripts from the project:

```bash
bun sync
bun dev
bun portclean
bun update-all
bun dp
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

`dispatch init` also creates or updates `AGENTS.md` in the consuming user's target repo. This is an actual setup step that writes into their codebase; it is not just an `AGENTS.md` file shipped inside the npm package.

If the target repo already has `AGENTS.md`, Dispatch appends or replaces only its managed block:

```md
<!-- dispatch:agents:start -->
...
<!-- dispatch:agents:end -->
```

User-authored content outside that block is left alone.

`dispatch doctor` reports whether the target repo's Dispatch agent instructions are missing, stale, malformed, or OK.

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
dispatch portclean
dispatch processes
dispatch clean
dispatch update-all
```

Deploy:

```bash
bun run dp
dispatch dp
```

`dispatch deploy` runs the CI confidence path first, then prefers project scripts such as `deploy`, `deploy:prod`, and `deploy:web`. If none exist, it falls back to Vercel.

Use `dispatch deploy --skip-checks` only when you intentionally want to bypass the confidence path.

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

Verify a packed install in a temporary repo:

```bash
bun run smoke:pack
```

Publish:

```bash
bun publish
```

## License

MIT
