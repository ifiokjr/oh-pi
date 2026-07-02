# Packaging and Release Rules

## Changesets

- Every change must include a changeset.
- The only exception is a generated `chore: release` commit from the release workflow.
- Create a changeset with:

```bash
pnpm change
```

This repo uses MonoChange with a lockstep `monopi` group, so every changeset frontmatter must use only `monopi` as the key.

```md
---
monopi: patch
---
```

Do not use package names like `@monopi/monopi` or `@monopi/extension-worktree` in changeset frontmatter.

## Change types

- `major` — breaking API or behavior changes
- `minor` — new features, extensions, or config options
- `patch` — bug fixes, docs updates, and internal refactors

## Packaging model

`@monopi/monopi` is a bin installer, not a bundling meta-package.

- Each sub-package is a standalone pi package with its own `pi` field in `package.json`.
- Pi loads each package with its own module root.
- Extensions that depend on pi peer dependencies must be installed separately so peer dependency resolution works correctly.

## Installation commands

```bash
npx @monopi/monopi
npx @monopi/monopi --version 0.2.13
npx @monopi/monopi --local
npx @monopi/monopi --remove
```

Individual packages can also be installed directly:

```bash
pi install npm:@monopi/extension-worktree
pi install npm:@monopi/adaptive-routing
pi install npm:@monopi/skills
pi install npm:@monopi/subagents
pi install npm:@monopi/provider-cursor
pi install npm:@monopi/provider-ollama
pi install npm:@monopi/analytics-extension
pi install npm:@monopi/remote-tailscale
pi install npm:@monopi/bash-live-view
pi install npm:@monopi/pretty
```

Do not use `bundledDependencies` in `@monopi/monopi`.

Experimental packages can stay intentionally separate from the `@monopi/monopi` installer when they need an opt-in rollout or rely on unofficial upstream APIs.

## Release flow

```bash
./scripts/release.sh
./scripts/release.sh --dry-run
pnpm publish
```

`./scripts/release.sh` runs lint, security checks, typecheck, test, build, version bump, changelog update, tag creation, and push. `pnpm publish` then publishes all workspace packages.
