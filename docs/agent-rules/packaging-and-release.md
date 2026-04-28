# Packaging and Release Rules

## Changesets

- Every change must include a changeset.
- The only exception is a generated `chore: release` commit from knope.
- Create a changeset with:

```bash
knope document-change
```

This repo uses lockstep versioning and a single knope `[package]`, so every changeset frontmatter must use only `default` as the key.

```md
---
default: patch
---
```

Do not use package names like `@ifi/oh-pi` or `@ifi/oh-pi-extensions` in changeset frontmatter.

## Change types

- `major` — breaking API or behavior changes
- `minor` — new features, extensions, or config options
- `patch` — bug fixes, docs updates, and internal refactors

## Packaging model

`@ifi/oh-pi` is a bin installer, not a bundling meta-package.

- Each sub-package is a standalone pi package with its own `pi` field in `package.json`.
- Pi loads each package with its own module root.
- Extensions that depend on pi peer dependencies must be installed separately so peer dependency resolution works correctly.

## Installation commands

```bash
npx @ifi/oh-pi
npx @ifi/oh-pi --version 0.2.13
npx @ifi/oh-pi --local
npx @ifi/oh-pi --remove
```

Individual packages can also be installed directly:

```bash
pi install npm:@ifi/oh-pi-extensions
pi install npm:@ifi/pi-extension-adaptive-routing
pi install npm:@ifi/oh-pi-ant-colony
pi install npm:@ifi/oh-pi-themes
pi install npm:@ifi/oh-pi-prompts
pi install npm:@ifi/oh-pi-skills
pi install npm:@ifi/pi-extension-subagents
pi install npm:@ifi/pi-plan
pi install npm:@ifi/pi-spec
pi install npm:@ifi/pi-provider-cursor
pi install npm:@ifi/pi-provider-ollama
pi install npm:@ifi/pi-analytics-extension
pi install npm:@ifi/pi-remote-tailscale
pi install npm:@ifi/pi-bash-live-view
pi install npm:@ifi/pi-pretty
```

Do not use `bundledDependencies` in `@ifi/oh-pi`.

Experimental packages can stay intentionally separate from the `@ifi/oh-pi` installer when they need an opt-in rollout or rely on unofficial upstream APIs.

## Release flow

```bash
./scripts/release.sh
./scripts/release.sh --dry-run
knope publish
```

`./scripts/release.sh` runs lint, security checks, typecheck, test, build, version bump, changelog update, tag creation, and push. `knope publish` then publishes all workspace packages.
