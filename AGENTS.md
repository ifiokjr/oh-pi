# Agent Rules — oh-pi

## Project

oh-pi is a monorepo of pi-coding-agent extensions, themes, prompts, skills, and a TUI configurator.
All packages live under `packages/` and share the same version.

## Code Standards

- **Language**: TypeScript (strict mode)
- **Formatter/Linter**: Biome (`biome.json`) — tabs, 120 char width, double quotes
- **Type checker**: tsgo (`@typescript/native-preview`) for speed, tsc for emit
- **Tests**: Vitest — all tests must pass before committing
- **Node**: ≥20

## Changeset Requirement

**Every change must include a changeset.** This is enforced in CI.

```bash
knope document-change
```

Choose the change type:

- **`major`** — Breaking API/behavior changes
- **`minor`** — New features, new extensions, new config options
- **`patch`** — Bug fixes, documentation updates, internal refactors

The changeset file is committed alongside your code changes. PRs without a changeset will fail CI.

## Release Process

Releases are done locally in two steps:

```bash
# Step 1: Release — bump versions, update CHANGELOG, tag, push
./scripts/release.sh        # Full release (lint → typecheck → test → build → release)
./scripts/release.sh --dry-run  # Preview what would happen

# Step 2: Publish — build and push all packages to npm
knope publish
```

This bumps all package versions in lockstep, updates `CHANGELOG.md`, creates a git tag, pushes to
GitHub, and publishes all 9 packages to npm under the `@ifi` scope.

## Project Structure

```
packages/
  core/          → @ifi/oh-pi-core (compiled library: types, registry, i18n)
  cli/           → @ifi/oh-pi-cli (compiled binary: TUI configurator)
  extensions/    → @ifi/oh-pi-extensions (raw .ts: 9 pi extensions)
  ant-colony/    → @ifi/oh-pi-ant-colony (raw .ts: multi-agent swarm)
  themes/        → @ifi/oh-pi-themes (JSON theme files)
  prompts/       → @ifi/oh-pi-prompts (markdown prompt templates)
  skills/        → @ifi/oh-pi-skills (skill directories)
  agents/        → @ifi/oh-pi-agents (AGENTS.md templates)
  oh-pi/         → @ifi/oh-pi (meta-package, bundles everything)
```

## Key Conventions

- **Pi extensions ship raw `.ts`** — pi loads them via jiti, no compilation needed
- **Core and CLI are compiled** — they produce `dist/` via tsc
- **Imports**: CLI imports from `@ifi/oh-pi-core`, not relative paths. Extensions import from pi SDK
  packages.
- **Chinese text in regex patterns and locales.ts is intentional** — bilingual parsing support
- **`noDefaultExport: off`** — extensions use default exports as their API pattern
- **Test files**: Relaxed lint rules (no explicit any, no unused vars, etc.)

## CI Pipeline

```
lint (biome ci) → typecheck (tsgo) → test (Node 20+22) → build (tsc)
                                                        ↑
                                          changeset check (PRs only)
```

## Useful Commands

```bash
pnpm build           # Build core + cli
pnpm typecheck       # Type check with tsgo
pnpm test            # Run all tests
pnpm lint            # Biome check
pnpm lint:fix        # Auto-fix
pnpm format          # Format all files
knope document-change  # Create a changeset
knope get-version      # Show current version
```
