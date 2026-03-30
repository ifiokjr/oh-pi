# Engineering Rules

## Code standards

- Language: TypeScript in strict mode
- Formatter/linter: Biome 2 (`biome.json`) using tabs, 120 character width, and double quotes
- Type checking:
  - `tsgo` (`@typescript/native-preview`) for fast repo type-checking
  - `tsc` for emitted builds
- Tests: Vitest
- Node: `>=20`

## Common commands

- `pnpm lint` — run Biome checks
- `pnpm lint:fix` — apply Biome fixes
- `pnpm format` — format the repo
- `pnpm test` — run the full test suite
- `pnpm typecheck` — run repo type-checking with `tsgo`
- `pnpm build` — build compiled packages
- `pnpm security:check` — run dependency allowlist and audit checks

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
  ant-colony/             → @ifi/oh-pi-ant-colony (raw .ts multi-agent swarm)
  themes/                 → @ifi/oh-pi-themes (JSON theme files)
  prompts/                → @ifi/oh-pi-prompts (markdown prompt templates)
  skills/                 → @ifi/oh-pi-skills (skill directories)
  agents/                 → @ifi/oh-pi-agents (AGENTS.md templates)
  subagents/              → @ifi/pi-extension-subagents (raw .ts subagent orchestration package)
  shared-qna/             → @ifi/pi-shared-qna (shared TUI helper library)
  plan/                   → @ifi/pi-plan (raw .ts planning mode extension)
  spec/                   → @ifi/pi-spec (raw .ts spec-driven workflow package)
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
