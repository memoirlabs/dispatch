# AGENTS.md

## Dispatch Agent Instruction Rule

When working on Dispatch's agent-instruction feature, remember the requirement:

- The important behavior is not that `@memoir/dispatch` contains an `AGENTS.md` file.
- The important behavior is that a consuming user's codebase gets an `AGENTS.md` file when they run `dispatch init`.
- That means the implementation belongs in the CLI setup path, currently `src/standard.ts`, not only in package docs or package-local files.

`dispatch init` must create or patch the target repo's root `AGENTS.md` with a Dispatch-managed block:

```md
<!-- dispatch:agents:start -->
...
<!-- dispatch:agents:end -->
```

Preserve user-authored content outside that block. Replace only the Dispatch-managed block on later runs. Refuse malformed partial marker state instead of overwriting the file.

`dispatch doctor` should report whether the target repo's agent instructions are missing, stale, malformed, or OK.

## Verification

For changes to this behavior, run:

- `bun run test`
- `bun run typecheck`
- `bun run src/cli.ts init --force --dry-run`

Use `bun run check` when making broader changes.
