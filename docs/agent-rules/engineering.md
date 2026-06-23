# Engineering Rules

## Code standards

- Language: TypeScript in strict mode
- Repo-authored source files should use TypeScript extensions (`.ts`, `.mts`, `.cts`) instead of JavaScript (`.js`, `.mjs`, `.cjs`) whenever possible
- Formatter/linter: oxlint (`.oxlintrc.json`) + oxfmt (`.oxfmtrc.json`) using tabs, 120 character width, and double quotes
- Type checking:
  - `tsgo` (`@typescript/native-preview`) for fast repo type-checking
  - `tsc` for emitted builds
- Tests: Vitest
- Node: `>=20`

## Common commands

- `pnpm lint` — run oxlint checks
- `pnpm lint:fix` — apply oxfmt + oxlint fixes
- `pnpm format` — format the repo
- `pnpm test` — run the full test suite
- `pnpm typecheck` — run repo type-checking with `tsgo`
- `pnpm build` — run every workspace package build script
- `pnpm security:check` — run dependency allowlist and audit checks
- `pnpm mdt ...` — run MDT documentation reuse commands with the repo-pinned version

## Documentation reuse

<!-- {=repoMdtUsageRuleDocs} -->

Use MDT through `pnpm mdt ...`, not a globally installed `mdt` binary. This keeps documentation reuse commands pinned to the repo's declared `@ifi/mdt` version and makes local runs, CI, and agent instructions consistent.

<!-- {/repoMdtUsageRuleDocs} -->

<!-- {=repoMdtCommandsDocs} -->

```bash
pnpm mdt list
pnpm mdt update
pnpm mdt check
```

Convenience wrappers remain available too:

```bash
pnpm docs:list
pnpm docs:update
pnpm docs:check
```

<!-- {/repoMdtCommandsDocs} -->

## Testing conventions

- All tests must pass before committing.
- Test files use relaxed lint rules when needed.

## Project structure

All packages live under `packages/` and share the same version.

```text
packages/
  core/                   → @monopi/core (compiled library: types, registry, i18n)
  cli/                    → @monopi/cli (compiled binary: TUI configurator)
  extensions/             → @monopi/extension-worktree (raw .ts extensions)
  adaptive-routing/       → @monopi/adaptive-routing (optional raw .ts routing package)
  skills/                 → @monopi/skills (skill directories)
  agents/                 → @monopi/agents (AGENTS.md templates)
  subagents/              → @monopi/subagents (raw .ts subagent orchestration package)
  shared-qna/             → @monopi/shared-qna (shared TUI helper library)
  cursor/                 → @monopi/provider-cursor (raw .ts experimental Cursor provider package)
  ollama/                 → @monopi/provider-ollama (raw .ts experimental Ollama local + cloud provider package)
  analytics-db/           → @monopi/analytics-db (SQLite schema and Drizzle ORM client for analytics data)
  analytics-dashboard/    → @monopi/analytics-dashboard (private React dashboard for visualizing AI usage)
  analytics-extension/    → @monopi/analytics-extension (raw .ts analytics tracking extension for pi)
  docs/                   → @monopi/docs (private documentation site for monopi)
  monopi/                  → @monopi/monopi (installer CLI: `npx @monopi/monopi`)
```

## Package conventions

- Pi extensions ship raw `.ts` files; pi loads them via `jiti`.
- `core` and `cli` are compiled and emit `dist/` via `tsc`.
- CLI code imports from `@monopi/core`, not via relative paths.
- Extensions import from pi SDK packages.
- `noDefaultExport: off` is intentional because extensions use default exports as their API pattern.
- Ant colony runs use isolated git worktrees by default, with shared-cwd fallback when worktrees are unavailable.
