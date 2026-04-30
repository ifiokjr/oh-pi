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
  core/                   → @ifi/oh-pi-core (compiled library: types, registry, i18n)
  cli/                    → @ifi/oh-pi-cli (compiled binary: TUI configurator)
  extensions/             → @ifi/oh-pi-extensions (raw .ts extensions)
  adaptive-routing/       → @ifi/pi-extension-adaptive-routing (optional raw .ts routing package)
  themes/                 → @ifi/oh-pi-themes (JSON theme files)
  prompts/                → @ifi/oh-pi-prompts (markdown prompt templates)
  skills/                 → @ifi/oh-pi-skills (skill directories)
  agents/                 → @ifi/oh-pi-agents (AGENTS.md templates)
  subagents/              → @ifi/pi-extension-subagents (raw .ts subagent orchestration package)
  shared-qna/             → @ifi/pi-shared-qna (shared TUI helper library)
  plan/                   → @ifi/pi-plan (raw .ts planning mode extension)
  spec/                   → @ifi/pi-spec (raw .ts spec-driven workflow package)
  cursor/                 → @ifi/pi-provider-cursor (raw .ts experimental Cursor provider package)
  ollama/                 → @ifi/pi-provider-ollama (raw .ts experimental Ollama local + cloud provider package)
  analytics-db/           → @ifi/pi-analytics-db (SQLite schema and Drizzle ORM client for analytics data)
  analytics-dashboard/    → @ifi/pi-analytics-dashboard (private React dashboard for visualizing AI usage)
  analytics-extension/    → @ifi/pi-analytics-extension (raw .ts analytics tracking extension for pi)
  docs/                   → @ifi/oh-pi-docs (private documentation site for oh-pi)
  oh-pi/                  → @ifi/oh-pi (installer CLI: `npx @ifi/oh-pi`)
```

## Package conventions

- Pi extensions ship raw `.ts` files; pi loads them via `jiti`.
- `core` and `cli` are compiled and emit `dist/` via `tsc`.
- CLI code imports from `@ifi/oh-pi-core`, not via relative paths.
- Extensions import from pi SDK packages.
- `@ifi/pi-spec` keeps state in `.specify/` and feature artifacts in `specs/###-feature-name/`.
- `noDefaultExport: off` is intentional because extensions use default exports as their API pattern.
- Ant colony runs use isolated git worktrees by default, with shared-cwd fallback when worktrees are unavailable.
