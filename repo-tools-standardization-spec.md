# Repository Utility + Dev Tooling Standardization Package

**Working package name:** `@your-scope/repo-tools`  
**Working CLI name:** `repo-tools`  
**Document status:** implementation spec / v1 proposal  
**Last reviewed:** 2026-06-08

---

## 1. Purpose

We repeatedly add the same repo hygiene scripts, lint config, CI workflow, and cleanup behavior to many JavaScript and TypeScript repositories. That creates drift. Every repo slowly ends up with slightly different `ci`, `lint`, `typecheck`, `test`, and `clean` behavior.

This package should centralize the repeatable parts.

The package should provide one stable CLI, one standard script surface, one base Oxlint rule policy, one GitHub Actions CI scaffold, and one predictable initialization command.

The package should **not** become a framework, build system, release system, monorepo platform, deploy abstraction, database tool, Docker tool, or app runtime wrapper.

The correct mental model:

```txt
@your-scope/repo-tools = shared repo hygiene + verification tooling
repo itself             = app/framework/build/runtime/deploy behavior
```

---

## 2. Guiding principles

### 2.1 Keep the surface small

Do not add a command just because one repo has it.

The standard package should own commands that make sense in nearly every repo:

```txt
ci
check
lint
lint:fix
typecheck
test
test:watch
test:coverage
clean
```

Do not standardize commands that are framework-specific or product-specific:

```txt
dev
build
start
preview
serve
deploy
release
db:*
docker:*
e2e
storybook
```

The CLI can **call** a repo-local `build` script during CI when the repo already defines one. It should not define what `build` means.

### 2.2 Prefer detection over configuration

The package should work in a normal repo without needing a custom config file.

Detect:

```txt
package manager
TypeScript presence
test runner
build script
CI environment
lockfile
workspace layout, where obvious
```

Avoid adding a custom `repo-tools.config.*` in v1. Add one later only when real repo variation requires it.

### 2.3 Never clobber custom repo behavior

`repo-tools init` must be idempotent and conservative.

It may create missing files.
It may update scripts that already point to `repo-tools`.
It must not silently overwrite custom scripts that do something else.

When there is a conflict, it should print a clear diff and require an explicit force flag.

### 2.4 Keep warnings useful but not noisy

The baseline should catch actual correctness issues and suspicious patterns.

It should not start style fights.
It should not enforce file naming style.
It should not ban `console`.
It should not require every repo to be React, Next, Node-only, browser-only, or library-only.

### 2.5 Make CI deterministic

CI should run the same verification path as local development, with CI-safe output and lockfile-based installs.

CI should not rely on globally installed packages.
CI should not use floating behavior unless intentionally configured.
CI should not run deploys, releases, or database migrations in the base workflow.

---

## 3. What this package owns

The package owns these repeated repo utility concerns:

| Area | Owned by `repo-tools` | Notes |
|---|---:|---|
| Standard package scripts | Yes | Adds the same script names across repos. |
| Lint command | Yes | Uses Oxlint through package-controlled behavior. |
| Base Oxlint rules | Yes | Rules/categories are centralized. |
| Root Oxlint scaffold | Yes | Path-sensitive fields are scaffolded into the repo root. |
| TypeScript typecheck command | Yes | Runs only when TypeScript is present. |
| Test command | Yes | Detects common runners. |
| CI verification command | Yes | Runs lint, typecheck, tests, and repo-local build when present. |
| GitHub Actions CI file | Yes | Basic Node package CI only. |
| Clean command | Yes | Removes generated artifacts only. |
| Framework dev server | No | Leave `dev` local. |
| App build definition | No | Leave `build` local. |
| App runtime start command | No | Leave `start` local. |
| Deploys | No | Product/platform-specific. |
| Releases | No | Too opinionated for base v1. |
| Commit hooks | No | Useful later, but not base v1. |
| Formatters | Not in v1 | Add only if formatter is standardized. |

---

## 4. Final repo script surface

Every repo should end up with this shape:

```json
{
  "scripts": {
    "ci": "repo-tools ci",
    "check": "repo-tools check",
    "lint": "repo-tools lint",
    "lint:fix": "repo-tools lint --fix",
    "typecheck": "repo-tools typecheck",
    "test": "repo-tools test",
    "test:watch": "repo-tools test --watch",
    "test:coverage": "repo-tools test --coverage",
    "clean": "repo-tools clean",
    "dev": "<repo-specific>",
    "build": "<repo-specific>",
    "start": "<repo-specific>"
  },
  "devDependencies": {
    "@your-scope/repo-tools": "^1.0.0"
  }
}
```

Only these scripts are standardized by default:

```txt
ci
check
lint
lint:fix
typecheck
test
test:watch
test:coverage
clean
```

These remain repo-local when needed:

```txt
dev
build
start
preview
serve
deploy
release
e2e
storybook
db:*
docker:*
```

---

## 5. Script behavior

### 5.1 `ci`

Purpose: full automated verification gate.

Command:

```sh
repo-tools ci
```

Execution order:

```txt
1. lint
2. typecheck
3. test
4. build, only if the repo has a repo-local build script
```

Rules:

- `ci` should fail on the first failed required step.
- `ci` should run in non-interactive mode.
- `ci` should use CI-friendly output where supported.
- `ci` should not run `dev`, `start`, `deploy`, `release`, database migrations, Docker publishing, or E2E tests by default.
- `ci` may call `build` only when `package.json` has a `build` script that does **not** point back to `repo-tools build`.
- `ci` should skip missing optional capabilities cleanly.

Build recursion guard:

```txt
if scripts.build exists and scripts.build does not start with "repo-tools":
  run package-manager run build
else:
  skip build
```

Why `build` is not standardized:

```txt
Next.js build     -> next build
Vite build        -> vite build
tsup build        -> tsup
library build     -> tsc / rollup / tsup / vite / unbuild
Node service      -> sometimes no build
monorepo          -> package orchestration needed
```

The package should not guess that.

### 5.2 `check`

Purpose: local verification before pushing.

Command:

```sh
repo-tools check
```

Execution order:

```txt
1. lint
2. typecheck
3. test
```

Difference from `ci`:

- `check` does not run `build` by default.
- `check` is faster and meant for developer use.
- `check` should still fail on real errors.

### 5.3 `lint`

Purpose: run Oxlint using the standard config.

Command:

```sh
repo-tools lint
```

Base behavior:

```txt
run Oxlint from the repo root
use the root .oxlintrc.json when present
add GitHub output formatting when running inside GitHub Actions
avoid assuming a globally installed oxlint binary
```

Recommended internal command shape:

```sh
oxlint . --config ./.oxlintrc.json --no-error-on-unmatched-pattern
```

When `GITHUB_ACTIONS=true`, add:

```sh
--format github
```

Do not add `--deny-warnings` in v1. The base should fail on errors and show warnings without making warnings instantly block every repo.

### 5.4 `lint:fix`

Purpose: apply safe auto-fixes.

Script:

```json
{
  "lint:fix": "repo-tools lint --fix"
}
```

Internal behavior:

```sh
oxlint . --config ./.oxlintrc.json --fix --no-error-on-unmatched-pattern
```

Do not use these in the standard script:

```txt
--fix-suggestions
--fix-dangerously
```

Those may change behavior and should remain explicit manual commands.

### 5.5 `typecheck`

Purpose: run TypeScript checking only when the repo uses TypeScript.

Command:

```sh
repo-tools typecheck
```

Detection:

The repo should be considered TypeScript-based when any of these are true:

```txt
tsconfig.json exists
tsconfig.base.json exists
src/**/*.ts exists
src/**/*.tsx exists
app/**/*.ts exists
app/**/*.tsx exists
packages/**/tsconfig.json exists
```

Behavior:

| Condition | Behavior |
|---|---|
| No TypeScript evidence | Skip successfully. |
| TypeScript evidence exists and `typescript` is installed | Run typecheck. |
| TypeScript evidence exists and `typescript` is missing | Fail with a clear install message. |
| Existing repo needs custom typecheck | Repo can keep overriding the `typecheck` script instead of using `repo-tools`. |

Default command:

```sh
tsc --noEmit --pretty false
```

Use the repo-local TypeScript binary, not a global binary.

Do not bundle `typescript` as a required dependency of `repo-tools` in v1. JavaScript-only repos should not inherit TypeScript cost.

### 5.6 `test`

Purpose: run unit tests once.

Command:

```sh
repo-tools test
```

Detection order:

```txt
1. Vitest
2. Jest
3. Node test runner
4. no test runner / no tests -> skip successfully
```

Runner behavior:

| Detected runner | Once | Watch | Coverage |
|---|---|---|---|
| Vitest | `vitest run` | `vitest` | `vitest run --coverage` |
| Jest | `jest` | `jest --watch` | `jest --coverage` |
| Node test runner | `node --test` | not supported in base | not supported in base |
| None | skip | skip | skip |

Test file patterns:

```txt
**/*.test.js
**/*.test.jsx
**/*.test.ts
**/*.test.tsx
**/*.spec.js
**/*.spec.jsx
**/*.spec.ts
**/*.spec.tsx
**/__tests__/**/*.js
**/__tests__/**/*.jsx
**/__tests__/**/*.ts
**/__tests__/**/*.tsx
```

Do not install Vitest or Jest automatically. The package detects and uses what the repo already has.

### 5.7 `test:watch`

Purpose: run tests in watch mode when supported.

Script:

```json
{
  "test:watch": "repo-tools test --watch"
}
```

Rules:

- Use watch mode only for Vitest/Jest.
- Do not run watch mode in CI.
- If `CI=true`, fail with a clear message or fall back to non-watch mode. Prefer failing because watch mode in CI is almost always a mistake.

### 5.8 `test:coverage`

Purpose: generate coverage when the repo's test runner supports it.

Script:

```json
{
  "test:coverage": "repo-tools test --coverage"
}
```

Rules:

- Vitest: `vitest run --coverage`
- Jest: `jest --coverage`
- Node test runner: skip or fail with an unsupported message in v1
- Do not configure coverage thresholds in the base package

Coverage thresholds are repo policy, not universal utility policy.

### 5.9 `clean`

Purpose: remove generated artifacts.

Command:

```sh
repo-tools clean
```

Default deletion targets:

```txt
dist
build
coverage
.turbo
.next
.nuxt
.svelte-kit
.output
.vite
.cache
storybook-static
tsconfig.tsbuildinfo
*.tsbuildinfo
```

Optional package-specific additions can be added later, but v1 should stay conservative.

Never delete by default:

```txt
node_modules
.pnpm-store
.env
.env.*
.git
.github
package-lock.json
pnpm-lock.yaml
yarn.lock
bun.lock
bun.lockb
local database files
uploads
public assets
```

A future `clean:all` may remove `node_modules`, but do not ship that in base v1.

---

## 6. CLI command surface

The package should expose one binary:

```json
{
  "bin": {
    "repo-tools": "./dist/cli.js"
  }
}
```

Commands:

```txt
repo-tools init
repo-tools ci
repo-tools check
repo-tools lint
repo-tools lint --fix
repo-tools typecheck
repo-tools test
repo-tools test --watch
repo-tools test --coverage
repo-tools clean
repo-tools doctor
```

`doctor` is acceptable because it does not add policy; it diagnoses setup problems.

Avoid aliases in v1:

```txt
verify
validate
full-check
fix
clean:all
bootstrap
prepare
```

Aliases create drift and confusion.

### 6.1 Shared CLI flags

Recommended global flags:

```txt
--cwd <path>       Run against another repo path.
--dry-run          Print changes without writing.
--force            Allow overwriting known managed files/scripts.
--verbose          Print executed commands.
--quiet            Reduce non-error output.
```

Keep the flags minimal. Do not add config flags until there is real demand.

### 6.2 Exit codes

| Code | Meaning |
|---:|---|
| `0` | Success or intentional skip. |
| `1` | Verification failure. |
| `2` | Invalid CLI usage. |
| `3` | Repo setup problem, such as missing TypeScript in a TypeScript repo. |
| `4` | Init conflict that requires `--force`. |

---

## 7. Package manager detection

`repo-tools` should detect the package manager in this order:

```txt
1. package.json packageManager field
2. pnpm-lock.yaml
3. package-lock.json or npm-shrinkwrap.json
4. yarn.lock
5. bun.lock or bun.lockb
6. npm fallback
```

Conflict behavior:

| Situation | Behavior |
|---|---|
| `packageManager` says pnpm and `pnpm-lock.yaml` exists | Use pnpm. |
| `packageManager` says npm and `pnpm-lock.yaml` exists | Fail with conflict message. |
| Multiple lockfiles exist | Fail unless one matches `packageManager`. |
| No lockfile and no packageManager | Use npm fallback. |

Run commands through the detected manager:

| Manager | Run script | Install in CI |
|---|---|---|
| pnpm | `pnpm run <script>` | `pnpm install --frozen-lockfile` |
| npm | `npm run <script>` | `npm ci` |
| yarn | `yarn <script>` | `yarn install --immutable` or repo-specific fallback |
| bun | `bun run <script>` | `bun install --frozen-lockfile` |

For v1, the scaffold can fully support pnpm and npm first. Yarn and Bun can be detected by the CLI but CI templates may be added after the first rollout.

---

## 8. `repo-tools init`

Purpose: add standard utility wiring to a repo.

Command:

```sh
repo-tools init
```

Default behavior:

```txt
1. Read package.json.
2. Detect package manager.
3. Add @your-scope/repo-tools to devDependencies if missing.
4. Add standard scripts if missing.
5. Create or update .oxlintrc.json.
6. Create .github/workflows/ci.yml if missing.
7. Print a summary of changes.
```

### 8.1 Files created or updated

```txt
package.json
.oxlintrc.json
.github/workflows/ci.yml
```

Optional later:

```txt
.editorconfig
.vscode/settings.json
```

Do not create these in v1:

```txt
.husky/**
.lintstagedrc
commitlint.config.*
.changeset/**
release.config.*
Dockerfile
docker-compose.yml
playwright.config.*
storybook config
knip config
syncpack config
```

### 8.2 Script insertion policy

For each managed script:

| Current state | Action |
|---|---|
| Missing | Add it. |
| Already equals the expected `repo-tools` command | Leave it. |
| Starts with `repo-tools` but old command shape | Update it. |
| Custom command exists | Do not overwrite unless `--force`. |

Managed scripts:

```json
{
  "ci": "repo-tools ci",
  "check": "repo-tools check",
  "lint": "repo-tools lint",
  "lint:fix": "repo-tools lint --fix",
  "typecheck": "repo-tools typecheck",
  "test": "repo-tools test",
  "test:watch": "repo-tools test --watch",
  "test:coverage": "repo-tools test --coverage",
  "clean": "repo-tools clean"
}
```

Do not overwrite these:

```txt
dev
build
start
preview
serve
deploy
release
```

### 8.3 Init conflict example

If the repo has this:

```json
{
  "scripts": {
    "lint": "eslint ."
  }
}
```

`repo-tools init` should print:

```txt
Conflict: package.json scripts.lint already exists.
Current: eslint .
Wanted:  repo-tools lint

Run repo-tools init --force to replace it.
```

This protects repo-specific behavior.

### 8.4 Idempotence requirement

Running this repeatedly should be safe:

```sh
repo-tools init
repo-tools init
repo-tools init
```

The second and third runs should produce no file changes unless package templates have changed.

---

## 9. Oxlint standard

Oxlint is the standard linter for this package.

Important design constraint: some Oxlint fields are path-sensitive. In particular, `ignorePatterns` are resolved from the config file path. Therefore, the shared package-level JSON config should contain path-independent rules and categories only. The repo root `.oxlintrc.json` should contain repo-root-sensitive fields like `ignorePatterns`, `overrides`, and root-only `options`.

This avoids subtle bugs where an ignore pattern in `node_modules/@your-scope/repo-tools/oxlint/base.json` is interpreted relative to the package directory instead of the repo root.

### 9.1 Shared package config

File inside package:

```txt
oxlint/base.json
```

Content:

```json
{
  "categories": {
    "correctness": "error",
    "suspicious": "warn",
    "perf": "warn",
    "style": "off",
    "pedantic": "off",
    "restriction": "off",
    "nursery": "off"
  },
  "rules": {
    "no-console": "off",
    "no-debugger": "warn",
    "unicorn/prevent-abbreviations": "off",
    "unicorn/filename-case": "off"
  }
}
```

Why this is intentionally small:

- `correctness` should fail because those issues are usually real bugs.
- `suspicious` should warn because it may catch risky code without blocking adoption.
- `perf` should warn because performance suggestions are useful but not always mandatory.
- `style`, `pedantic`, `restriction`, and `nursery` should stay off by default.
- `no-console` should stay off because CLIs, scripts, services, and debugging code commonly use it.
- filename and abbreviation rules are too subjective for a universal baseline.

### 9.2 Root repo Oxlint config

File generated in each repo:

```txt
.oxlintrc.json
```

Content:

```json
{
  "$schema": "./node_modules/@your-scope/repo-tools/oxlint/configuration_schema.json",
  "extends": [
    "./node_modules/@your-scope/repo-tools/oxlint/base.json"
  ],
  "ignorePatterns": [
    "node_modules/**",
    "dist/**",
    "build/**",
    "coverage/**",
    ".turbo/**",
    ".next/**",
    ".nuxt/**",
    ".svelte-kit/**",
    ".output/**",
    ".vite/**",
    ".cache/**",
    "storybook-static/**",
    "*.min.*",
    "**/*.generated.*",
    "**/generated/**"
  ],
  "options": {
    "reportUnusedDisableDirectives": "warn",
    "respectEslintDisableDirectives": true
  },
  "overrides": [
    {
      "files": [
        "**/*.test.js",
        "**/*.test.jsx",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.js",
        "**/*.spec.jsx",
        "**/*.spec.ts",
        "**/*.spec.tsx",
        "**/__tests__/**/*.js",
        "**/__tests__/**/*.jsx",
        "**/__tests__/**/*.ts",
        "**/__tests__/**/*.tsx"
      ],
      "env": {
        "jest": true,
        "vitest": true,
        "node": true
      }
    },
    {
      "files": [
        "*.config.js",
        "*.config.ts",
        "*.config.mjs",
        "*.config.cjs",
        "*.config.mts",
        "*.config.cts",
        "**/*.config.js",
        "**/*.config.ts",
        "**/*.config.mjs",
        "**/*.config.cjs",
        "**/*.config.mts",
        "**/*.config.cts",
        "scripts/**/*.js",
        "scripts/**/*.ts",
        "scripts/**/*.mjs",
        "scripts/**/*.cjs",
        "scripts/**/*.mts",
        "scripts/**/*.cts"
      ],
      "env": {
        "node": true
      },
      "rules": {
        "no-console": "off"
      }
    },
    {
      "files": [
        "**/*.cjs",
        "**/*.cts"
      ],
      "env": {
        "commonjs": true,
        "node": true
      }
    }
  ]
}
```

Replace `@your-scope/repo-tools` with the real package name.

### 9.3 Why the root config includes ignores and overrides

These fields are repo-root-sensitive:

```txt
ignorePatterns
overrides.files
```

Keeping them in `.oxlintrc.json` makes path matching predictable from the repository root.

The package still owns the template. `repo-tools init` can rewrite the managed sections when templates change.

### 9.4 Why the package should not set `plugins` in the base config

Do not set `plugins` in the universal base unless absolutely necessary.

Reason: setting `plugins` overwrites Oxlint's default plugin set. A universal config that declares plugins can accidentally remove defaults or force framework-specific plugins on repos that do not need them.

Add framework-specific configs later if needed:

```txt
oxlint/react.json
oxlint/next.json
oxlint/node.json
oxlint/library.json
oxlint/strict.json
```

### 9.5 Optional future React config

Do not include this in v1 by default.

Possible future file:

```txt
oxlint/react.json
```

Example shape:

```json
{
  "plugins": ["react", "jsx-a11y"],
  "settings": {
    "react": {
      "version": "detect"
    }
  }
}
```

Only add this once enough repos need it.

### 9.6 Optional future Next.js config

Do not include this in v1 by default.

Possible future file:

```txt
oxlint/next.json
```

Example shape:

```json
{
  "plugins": ["nextjs"],
  "settings": {
    "next": {
      "rootDir": "."
    }
  }
}
```

Next.js root directory handling gets tricky in monorepos. Keep it out of the universal base.

### 9.7 Optional future strict config

Do not include this in v1 by default.

Possible future file:

```txt
oxlint/strict.json
```

Example direction:

```json
{
  "categories": {
    "correctness": "error",
    "suspicious": "error",
    "perf": "warn"
  },
  "options": {
    "denyWarnings": true
  }
}
```

This should be opt-in only.

---

## 10. GitHub Actions CI standard

The base CI workflow should verify pull requests and pushes to `main`.

It should not publish packages, deploy applications, upload Docker images, or run release automation.

### 10.1 Standard workflow goals

```txt
checkout repo
install Node
install package manager
install dependencies from lockfile
run package script ci
```

### 10.2 pnpm workflow

Generated when the repo uses pnpm.

File:

```txt
.github/workflows/ci.yml
```

Content:

```yml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  ci:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup pnpm
        uses: pnpm/action-setup@v6
        with:
          run_install: false

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run CI
        run: pnpm run ci
```

Important pnpm note:

If the repo does not have a `packageManager` field, `repo-tools init` should either add one or generate a `version` input for `pnpm/action-setup`.

Preferred package.json field:

```json
{
  "packageManager": "pnpm@10.0.0"
}
```

Use the real pnpm version used by the repo.

### 10.3 npm workflow

Generated when the repo uses npm.

```yml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  ci:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run CI
        run: npm run ci
```

### 10.4 Why `pnpm run ci` / `npm run ci` and not `npm ci`

`npm ci` means dependency installation.

The repo verification script is:

```sh
npm run ci
```

Do not confuse those names in docs or workflow labels.

### 10.5 CI output behavior

When running inside GitHub Actions:

```txt
repo-tools lint -> oxlint --format github
```

This gives GitHub-native annotations without requiring a separate Oxlint action.

### 10.6 CI permissions

Use minimum permissions:

```yml
permissions:
  contents: read
```

Do not add write permissions in the base CI workflow.

Release/publish workflows can request more permissions in separate files when needed.

---

## 11. Internal package layout

Recommended package structure:

```txt
@your-scope/repo-tools/
  bin/
    repo-tools.js
  dist/
    cli.js
    index.js
  src/
    cli.ts
    commands/
      init.ts
      ci.ts
      check.ts
      lint.ts
      typecheck.ts
      test.ts
      clean.ts
      doctor.ts
    lib/
      detect-package-manager.ts
      read-package-json.ts
      write-package-json.ts
      run.ts
      scripts.ts
      paths.ts
      detect-typescript.ts
      detect-test-runner.ts
      github-actions.ts
      oxlint.ts
  oxlint/
    base.json
    configuration_schema.json
  templates/
    github/
      ci.pnpm.yml
      ci.npm.yml
    oxlint/
      root.oxlintrc.json
  package.json
  README.md
```

### 11.1 Package `package.json`

Example package metadata:

```json
{
  "name": "@your-scope/repo-tools",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "repo-tools": "./dist/cli.js"
  },
  "exports": {
    ".": "./dist/index.js",
    "./oxlint/base.json": "./oxlint/base.json",
    "./oxlint/configuration_schema.json": "./oxlint/configuration_schema.json"
  },
  "files": [
    "dist",
    "bin",
    "oxlint",
    "templates",
    "README.md"
  ],
  "engines": {
    "node": ">=20.19.0"
  },
  "dependencies": {
    "oxlint": "^1.0.0"
  },
  "peerDependenciesMeta": {
    "typescript": {
      "optional": true
    },
    "vitest": {
      "optional": true
    },
    "jest": {
      "optional": true
    }
  }
}
```

Version placeholders should be replaced with the actual versions used when the package is created.

### 11.2 Why `oxlint` is a package dependency

`repo-tools lint` should work when the repo installs only:

```sh
pnpm add -D @your-scope/repo-tools
```

The repo should not need to separately install Oxlint just to use the standard lint command.

The CLI should resolve the package-local Oxlint binary. It should not assume `oxlint` exists globally or that the repo has a direct `oxlint` devDependency.

### 11.3 Why the package ships the Oxlint schema

The generated root config uses:

```json
{
  "$schema": "./node_modules/@your-scope/repo-tools/oxlint/configuration_schema.json"
}
```

That path should exist without requiring every repo to install Oxlint directly.

At package build/publish time, copy the schema from the installed Oxlint package into:

```txt
oxlint/configuration_schema.json
```

This makes editor validation predictable.

---

## 12. Command implementation notes

### 12.1 Process execution

Use `child_process.spawn` or a small process library.

Requirements:

```txt
stream stdout/stderr by default
preserve exit codes
quote arguments safely
work on Windows/macOS/Linux
allow --verbose to print exact commands
```

Do not use shell interpolation unless necessary.

Preferred internal shape:

```ts
run(command, args, {
  cwd,
  env,
  stdio: "inherit"
});
```

### 12.2 Running repo-local binaries

When using repo tools like `tsc`, `vitest`, or `jest`, prefer the repo-local binary.

Resolution order:

```txt
1. repo node_modules/.bin
2. package manager exec, if safe
3. fail with a clear message
```

Do not use globally installed binaries.

### 12.3 Running package-owned binaries

When running Oxlint, use the package-owned Oxlint dependency.

Resolution order:

```txt
1. resolve oxlint from @your-scope/repo-tools dependency graph
2. execute that binary directly
3. fail with package installation diagnostic if missing
```

This keeps lint versions centralized.

### 12.4 Pass-through arguments

Allow pass-through where useful:

```sh
repo-tools lint -- --debug=files
repo-tools test -- --runInBand
repo-tools typecheck -- --incremental false
```

Parsing convention:

```txt
repo-tools command [repo-tools flags] -- [underlying tool flags]
```

Do not over-document pass-through until implemented.

---

## 13. `doctor` command

`doctor` should diagnose repo setup without changing files.

Command:

```sh
repo-tools doctor
```

Checks:

```txt
package.json exists
package manager detected
lockfile matches packageManager field
standard scripts exist
@your-scope/repo-tools installed
.oxlintrc.json exists
Oxlint base config path resolves
GitHub CI workflow exists
TypeScript repo has typescript installed
test runner detection result
build script recursion guard status
```

Example output:

```txt
repo-tools doctor

Package manager: pnpm
Lockfile: pnpm-lock.yaml
Scripts: OK
Oxlint config: OK
TypeScript: detected, typescript installed
Test runner: vitest
Build script: repo-local build detected
CI workflow: .github/workflows/ci.yml

All checks passed.
```

`doctor` is useful because it reduces guessing during rollout.

---

## 14. What not to include in v1

Do not include these in base v1:

```txt
husky
lint-staged
commitlint
changesets
semantic-release
release-it
knip
syncpack
depcheck
prettier
oxfmt
storybook
playwright
cypress
docker
database migrations
monorepo task orchestration
package publishing
npm provenance setup
deployment workflows
```

Reason:

Each one introduces a new policy surface.

The package should first solve the repeated low-risk utility layer. Add extensions only after the base is stable.

---

## 15. Future extension model

When v1 is stable, add opt-in modules instead of bloating the base.

Possible future commands:

```txt
repo-tools init react
repo-tools init next
repo-tools init library
repo-tools init hooks
repo-tools init release
repo-tools init format
```

Possible future configs:

```txt
@your-scope/repo-tools/oxlint/react
@your-scope/repo-tools/oxlint/next
@your-scope/repo-tools/oxlint/node
@your-scope/repo-tools/oxlint/library
@your-scope/repo-tools/oxlint/strict
```

Possible future scripts:

```json
{
  "format": "repo-tools format",
  "format:check": "repo-tools format --check"
}
```

Only add formatting once the team chooses the formatter.

---

## 16. Rollout plan

### Phase 1: Package skeleton

Build:

```txt
repo-tools CLI
lint command
shared Oxlint base config
root .oxlintrc template
package.json script injection
```

Validate on one small repo.

### Phase 2: CI scaffold

Add:

```txt
GitHub Actions pnpm template
GitHub Actions npm template
package manager detection
```

Validate on one pnpm repo and one npm repo.

### Phase 3: Typecheck/test/clean

Add:

```txt
typecheck detection
test runner detection
clean command
doctor command
```

Validate on:

```txt
plain JS repo
TS library repo
Vite app
Next app
Node service
repo with no tests
repo with Vitest
repo with Jest
```

### Phase 4: Controlled adoption

For each repo:

```sh
pnpm add -D @your-scope/repo-tools
pnpm exec repo-tools init
pnpm run check
```

Then open a small PR containing only the tooling changes.

### Phase 5: Lock behavior

After 5-10 repos are migrated, stop changing command semantics casually.

Any breaking change to script behavior should be a major package version.

---

## 17. Acceptance checklist

A migrated repo is done when:

```txt
package.json has @your-scope/repo-tools as a devDependency
package.json has standard scripts
repo-specific dev/build/start scripts are preserved
.oxlintrc.json exists
.oxlintrc.json extends the package base config
.oxlintrc.json has repo-root ignorePatterns
.github/workflows/ci.yml exists
local check passes
CI passes
repo-specific build still works
repo-specific dev still works
```

Standard scripts checklist:

```json
{
  "ci": "repo-tools ci",
  "check": "repo-tools check",
  "lint": "repo-tools lint",
  "lint:fix": "repo-tools lint --fix",
  "typecheck": "repo-tools typecheck",
  "test": "repo-tools test",
  "test:watch": "repo-tools test --watch",
  "test:coverage": "repo-tools test --coverage",
  "clean": "repo-tools clean"
}
```

---

## 18. Example final repo state

### 18.1 `package.json`

```json
{
  "name": "example-repo",
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "ci": "repo-tools ci",
    "check": "repo-tools check",
    "lint": "repo-tools lint",
    "lint:fix": "repo-tools lint --fix",
    "typecheck": "repo-tools typecheck",
    "test": "repo-tools test",
    "test:watch": "repo-tools test --watch",
    "test:coverage": "repo-tools test --coverage",
    "clean": "repo-tools clean",
    "dev": "vite dev",
    "build": "vite build",
    "start": "vite preview"
  },
  "devDependencies": {
    "@your-scope/repo-tools": "^1.0.0",
    "typescript": "^5.0.0",
    "vitest": "^3.0.0"
  }
}
```

### 18.2 `.oxlintrc.json`

```json
{
  "$schema": "./node_modules/@your-scope/repo-tools/oxlint/configuration_schema.json",
  "extends": [
    "./node_modules/@your-scope/repo-tools/oxlint/base.json"
  ],
  "ignorePatterns": [
    "node_modules/**",
    "dist/**",
    "build/**",
    "coverage/**",
    ".turbo/**",
    ".next/**",
    ".nuxt/**",
    ".svelte-kit/**",
    ".output/**",
    ".vite/**",
    ".cache/**",
    "storybook-static/**",
    "*.min.*",
    "**/*.generated.*",
    "**/generated/**"
  ],
  "options": {
    "reportUnusedDisableDirectives": "warn",
    "respectEslintDisableDirectives": true
  },
  "overrides": [
    {
      "files": [
        "**/*.test.js",
        "**/*.test.jsx",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.js",
        "**/*.spec.jsx",
        "**/*.spec.ts",
        "**/*.spec.tsx",
        "**/__tests__/**/*.js",
        "**/__tests__/**/*.jsx",
        "**/__tests__/**/*.ts",
        "**/__tests__/**/*.tsx"
      ],
      "env": {
        "jest": true,
        "vitest": true,
        "node": true
      }
    },
    {
      "files": [
        "*.config.js",
        "*.config.ts",
        "*.config.mjs",
        "*.config.cjs",
        "*.config.mts",
        "*.config.cts",
        "**/*.config.js",
        "**/*.config.ts",
        "**/*.config.mjs",
        "**/*.config.cjs",
        "**/*.config.mts",
        "**/*.config.cts",
        "scripts/**/*.js",
        "scripts/**/*.ts",
        "scripts/**/*.mjs",
        "scripts/**/*.cjs",
        "scripts/**/*.mts",
        "scripts/**/*.cts"
      ],
      "env": {
        "node": true
      },
      "rules": {
        "no-console": "off"
      }
    },
    {
      "files": [
        "**/*.cjs",
        "**/*.cts"
      ],
      "env": {
        "commonjs": true,
        "node": true
      }
    }
  ]
}
```

### 18.3 `.github/workflows/ci.yml`

```yml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  ci:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup pnpm
        uses: pnpm/action-setup@v6
        with:
          run_install: false

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run CI
        run: pnpm run ci
```

---

## 19. Maintainer rules for the shared package

### 19.1 Changes that are safe in minor versions

```txt
add a new ignored generated directory
fix CI template comments
improve error messages
improve package manager detection
add doctor checks
support a new test runner without changing existing behavior
```

### 19.2 Changes that should be major versions

```txt
make warnings fail CI
remove a standard script
change ci execution order
start running build in check
start deleting new risky paths in clean
add formatter enforcement
add commit hooks by default
add release/deploy behavior
```

### 19.3 Do not surprise repos

This package will touch many repositories. Treat behavioral changes as infrastructure changes, not tiny library tweaks.

---

## 20. Source references

These references were used to validate the Oxlint and GitHub Actions details in this spec.

- Oxlint configuration docs: https://oxc.rs/docs/guide/usage/linter/config
- Oxlint config file reference: https://oxc.rs/docs/guide/usage/linter/config-file-reference
- Oxlint CLI docs: https://oxc.rs/docs/guide/usage/linter/cli
- Oxlint ignore files docs: https://oxc.rs/docs/guide/usage/linter/ignore-files
- GitHub Marketplace `actions/checkout`: https://github.com/marketplace/actions/checkout
- GitHub Marketplace `actions/setup-node`: https://github.com/marketplace/actions/setup-node-js-environment
- `actions/setup-node` advanced usage: https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md
- `pnpm/action-setup` README: https://github.com/pnpm/action-setup
- `pnpm/action-setup` releases: https://github.com/pnpm/action-setup/releases

---

## 21. Final v1 recommendation

Ship v1 with exactly this:

```txt
repo-tools CLI
repo-tools init
repo-tools doctor
repo-tools ci
repo-tools check
repo-tools lint
repo-tools typecheck
repo-tools test
repo-tools clean
shared Oxlint base rules
root .oxlintrc scaffold
GitHub Actions CI scaffold
package manager detection
TypeScript detection
Vitest/Jest/Node test detection
safe generated-artifact cleanup
```

Do not ship v1 with this:

```txt
formatter enforcement
commit hooks
release automation
deploy automation
Docker automation
DB automation
E2E automation
framework-specific configs enabled by default
monorepo orchestration
```

This gives us the repeated utility and CI setup we keep adding everywhere, without turning the package into a framework or a second build system.
