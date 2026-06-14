# Dispatch

Dispatch is a small Bun-powered command dispatcher for repository workflows.

It gives every project one stable entry point, `dispatch`, while keeping the real project behavior owned by the project. Dispatch provides common defaults for checks, sync, ports, process inspection, and setup, but repo-local scripts, config, and command files always have a path to take over.

## What It Does

Dispatch is meant to standardize how people and agents interact with a repo without forcing every repo to use the same implementation.

It can:

- add a small set of package scripts that point at `dispatch`
- create or update a Dispatch-managed block in the target repo's `AGENTS.md`
- add a shared oxlint config and a basic CI workflow
- run common quality commands like `lint`, `typecheck`, `test`, `check`, and `ci`
- provide safer repo maintenance commands like `sync-careful`, `portclean`, and `processes`
- hand off to repo-owned commands for app-specific workflows

It does not:

- replace project-specific scripts unless `dispatch init --force` is used
- infer a deployment platform
- hide destructive sync behavior behind a safe-sounding command
- require every quality command to be added to `package.json`

## Install And Initialize

The normal bootstrap command is:

```bash
bunx @memoir/dispatch
```

Running the package this way executes `dispatch` in the current repo. If Dispatch is not already initialized there, it runs the setup path.

Setup may update the target repo by:

- adding `@memoir/dispatch` to `devDependencies`
- adding the small managed script set to `package.json`
- creating or patching `AGENTS.md`
- writing `.oxlintrc.json`
- writing `.github/workflows/ci.yml`
- running the detected package manager install command

Preview setup without writing files:

```bash
bunx @memoir/dispatch --dry-run
```

Write files but skip the dependency install step:

```bash
bunx @memoir/dispatch --no-install
```

Refresh Dispatch-managed files later:

```bash
dispatch init
```

Force replacement of conflicting managed scripts:

```bash
dispatch init --force
```

Use `--force` carefully. It is appropriate after moving repo-specific behavior into `dispatch.config.ts` or `.dispatch/commands/*.ts`; it is not a safe way to blindly overwrite existing project scripts.

## Install Versus Init

Installing `@memoir/dispatch` only installs the npm package and exposes the `dispatch` binary through `node_modules/.bin`.

It does not automatically patch the consuming repo.

The repo is changed by running:

```bash
dispatch init
```

or by invoking the package as a bootstrap command:

```bash
bunx @memoir/dispatch
```

After initialization, package scripts such as `bun dev` or `bun sync` call the `dispatch` binary from `node_modules/.bin`. The command implementation still comes from the installed package unless the repo overrides it with local config, local command files, or unmanaged package scripts.

## Generated Package Scripts

`dispatch init` keeps `package.json` intentionally small. It manages only common human workflow aliases:

```json
{
  "scripts": {
    "dev": "dispatch dev",
    "sync": "dispatch sync",
    "sync-careful": "dispatch sync-careful",
    "portclean": "dispatch portclean",
    "update-all": "dispatch update-all",
    "dp": "dispatch dp",
    "menu": "dispatch menu"
  }
}
```

People can then use normal package-manager commands:

```bash
bun dev
bun sync
bun sync-careful
bun portclean
bun update-all
bun dp
```

Quality commands stay available through `dispatch` without adding more package-script noise:

```bash
dispatch lint
dispatch typecheck
dispatch test
dispatch check
dispatch ci
```

If the repo appears to use Convex, `dispatch init` also adds:

```json
{
  "scripts": {
    "convex": "dispatch convex",
    "convex:dev": "dispatch convex dev",
    "convex:deploy": "dispatch convex deploy"
  }
}
```

## Agent Instructions

`dispatch init` creates or updates the consuming repo's root `AGENTS.md`.

The important behavior is that the target codebase gets instructions when it runs setup. The package having its own `AGENTS.md` is not enough.

Dispatch writes only this managed block:

```md
<!-- dispatch:agents:start -->
...
<!-- dispatch:agents:end -->
```

User-authored content outside the block is preserved. On later runs, Dispatch replaces only the managed block.

If `AGENTS.md` contains only one marker, or markers are in the wrong order, setup refuses to continue. That prevents Dispatch from guessing and overwriting user content.

Check the state with:

```bash
dispatch doctor
```

Doctor reports agent instructions as missing, stale, malformed, or OK.

## Command Resolution

Dispatch resolves commands in this order:

1. `dispatch.config.ts` command override
2. project command file
3. unmanaged package script
4. built-in command

This order is what lets Dispatch provide defaults while still letting each repo own the behavior that matters.

### Config Overrides

Create `dispatch.config.ts` at the repo root:

```ts
import type { DispatchConfig } from "@memoir/dispatch";

const config: DispatchConfig = {
  ports: [3000, 3001, 5173],
  appFilter: "@my/app",
  deployScript: "deploy:prod",
  scriptAliases: {
    deploy: ["deploy:prod"],
  },
  commands: {
    menu: ["bun", "run", "--cwd", "apps/runner", "menu"],
  },
};

export default config;
```

Use `commands` when you want to fully override a Dispatch command with an argv array or shell string. Use `scriptAliases` when a Dispatch command should call one of the repo's package scripts.

### Project Command Files

Project command files live at:

```txt
.dispatch/commands/<name>.ts
```

Example:

```txt
package.json                  "sync": "dispatch sync"
.dispatch/commands/sync.ts    repo-specific implementation
```

A command file can export an argv array:

```ts
export default ["git", "fetch", "origin"];
```

Or it can run Bun code directly:

```ts
export default async () => {
  const proc = Bun.spawn(["git", "status", "--short"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) process.exit(exitCode);
};
```

## Commands

### Core

```bash
dispatch dev
dispatch start
dispatch preview
dispatch menu
```

These commands prefer repo-owned behavior. For example, `dispatch dev` runs a configured command, a local command file, an unmanaged `dev` script, or a Turbo `dev` task when appropriate.

### Quality

```bash
dispatch lint
dispatch fix
dispatch lint:fix
dispatch typecheck
dispatch test
dispatch check
dispatch ci
dispatch build
dispatch verify
dispatch prepare
```

`dispatch check` runs the normal local confidence path:

```txt
lint -> typecheck -> test
```

`dispatch ci` runs the CI confidence path:

```txt
lint -> typecheck -> test -> build when the repo has an unmanaged build script
```

If the repo already defines an unmanaged script for one of these commands, Dispatch runs that script. Otherwise it uses standard behavior where possible:

- `lint` uses the package-owned `oxlint` binary with the repo `.oxlintrc.json`
- `typecheck` runs the repo-local `tsc` when TypeScript evidence exists
- `test` detects Vitest, Jest, or Node test files

### Repo Maintenance

```bash
dispatch init
dispatch doctor
dispatch install
dispatch sync
dispatch sync-careful
dispatch port
dispatch portclean
dispatch processes
dispatch clean
dispatch update
dispatch update-all
dispatch scripts
dispatch ops
```

`dispatch sync` is intentionally destructive. It fetches `origin`, hard-resets to `origin/main` by default, and removes untracked files.

Preview it:

```bash
dispatch sync --dry-run
```

Target a different branch:

```bash
dispatch sync --branch release
```

`dispatch sync-careful` is the safe update path. It fetches, refuses uncommitted changes, refuses local commits that are not on the remote target, and only fast-forwards.

`dispatch port` and `dispatch portclean` clean common local dev ports and stale Next.js dev locks.

`dispatch processes` lists processes that appear to belong to the current repo. Use `--json` for machine-readable output and `--deep` for more process metadata.

`dispatch scripts` lists raw `package.json` scripts.

`dispatch ops` lists operational scripts and can run a specific script:

```bash
dispatch ops list
dispatch ops deploy:prod
dispatch ops env:vercel:sync
```

### Deploy

```bash
dispatch deploy
dispatch dp
dispatch deploy --skip-checks
```

Deploy is deliberately unopinionated. Dispatch does not infer Vercel, npm publishing, servers, environments, or deployment targets.

`dispatch deploy` runs checks first, then hands off only to repo-owned deploy behavior:

- `dispatch.config.ts` `commands.deploy`
- `dispatch.config.ts` `deployScript`
- `dispatch.config.ts` `scriptAliases.deploy`
- a plain unmanaged package script named `deploy`

If none of those exists, Dispatch exits and tells you to configure deploy or run a specific script with `dispatch ops <script-name>`.

Use `--skip-checks` only when you intentionally want to bypass the confidence path.

### Convex

```bash
dispatch convex dev
dispatch convex deploy
```

If `convex` is installed in the repo, Dispatch runs the local tool through the detected package manager. Otherwise it uses the package manager's one-off runner.

## Package Manager Detection

Dispatch itself requires Bun. Project scripts are run with the package manager detected from the target repo:

```txt
packageManager field
pnpm-lock.yaml
package-lock.json / npm-shrinkwrap.json
yarn.lock
bun.lock / bun.lockb
default: bun
```

If the `packageManager` field conflicts with a lockfile, Dispatch refuses to guess.

## Safety Rules

Dispatch tries to be boring and predictable:

- user-authored `AGENTS.md` content is preserved outside Dispatch markers
- partial marker state is treated as a conflict
- existing package scripts are preserved unless they are already managed by Dispatch or `--force` is used
- deploy has no platform fallback
- `sync` is labeled as destructive and supports `--dry-run`
- `sync-careful` exists for the common safe update case

## Development

Run the local CLI:

```bash
bun run dev
```

List commands:

```bash
bun run list
```

Run the normal verification path:

```bash
bun run check
```

Individual checks:

```bash
bun run lint
bun run typecheck
bun run test
```

For changes to initialization or agent-instruction behavior, run:

```bash
bun run test
bun run typecheck
bun run src/cli.ts init --force --dry-run
```

Use the broader check before release:

```bash
bun run check
```

## Packaging

Preview npm package contents:

```bash
bun run pack:dry-run
```

Verify a packed install in a temporary repo:

```bash
bun run smoke:pack
```

Publish:

```bash
npm publish --access public
```

## License

MIT
