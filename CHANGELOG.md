# Changelog

## 0.2.4 (2026-03-08)

### Features

- rewrite configuration wizard UX
- monorepo restructure under @ifi/* scope
- detailed changesets, markdown formatting, knope publish workflow
- usage-aware budget planner for ant colony
- auto-unbind deleteToLineStart from ctrl+u on extension load

#### Usage-aware budget planner for ant colony

The ant colony now queries the usage-tracker extension for real-time provider rate limits
(Claude session/weekly %, Codex 5h/weekly %) and session cost data to intelligently allocate
resources across scout, worker, and soldier castes.

**New module: `budget-planner.ts`**
- Classifies budget severity (comfortable → moderate → tight → critical) from rate limits and cost
- Allocates per-caste budgets: scouts 10%, workers 70%, soldiers 20%, drones free
- Caps concurrency based on severity (critical=1, tight=2, moderate=3, comfortable=6)
- Reduces per-ant turn counts when budget is constrained
- Generates budget-awareness prompt sections injected into ant system prompts

**Usage-tracker event broadcasting**
- `usage:limits` event broadcast after each turn with rate limit windows, session cost, per-model data
- `usage:query` event listener responds with current data for on-demand queries
- Other extensions can listen to `usage:limits` for dashboard/alerting

**Integration points**
- Queen refreshes budget plan before each phase (scouting, working, reviewing)
- Adaptive concurrency controller respects budget-plan caps
- Ant prompts include budget awareness when severity is moderate or worse
- 66 tests for budget planner, 6 tests for event broadcasting (325 total)

#### Fixed: usage-tracker shortcut conflict

`Ctrl+U` is kept as the usage dashboard shortcut. The extension now auto-configures
`~/.pi/agent/keybindings.json` on first load to unbind `deleteToLineStart` from `ctrl+u`,
eliminating the conflict warning without requiring manual user configuration.

### Fixes

- CI builds core before typecheck and tests
- remove composite/references, use plain tsgo resolution
- rename npm scope from @ifi to @ifiokjr
- revert npm scope back to @ifi
- revert usage-tracker shortcut to ctrl+u

## 0.2.3 (2026-03-08)

### Features

- rewrite configuration wizard UX
- monorepo restructure under @ifi/* scope
- detailed changesets, markdown formatting, knope publish workflow

### Fixes

- CI builds core before typecheck and tests
- remove composite/references, use plain tsgo resolution
- rename npm scope from @ifi to @ifiokjr
- revert npm scope back to @ifi

#### Reverted npm scope back to `@ifi`

The scope was incorrectly changed to `@ifiokjr` due to a misdiagnosed npm auth issue.
The real problem was token permissions, not the scope name. All packages are back to `@ifi/*`.

## 0.2.2 (2026-03-08)

### Features

- rewrite configuration wizard UX
- monorepo restructure under @ifi/* scope
- detailed changesets, markdown formatting, knope publish workflow

### Fixes

- CI builds core before typecheck and tests
- remove composite/references, use plain tsgo resolution
- rename npm scope from @ifi to @ifiokjr

#### Renamed npm scope from `@ifi` to `@ifiokjr`

The `@ifi` scope didn't exist as an npm organization. All packages are now published under
`@ifi/*` which matches the npm username and works without org setup.

- `@ifi/oh-pi` → `@ifi/oh-pi`
- `@ifi/oh-pi-core` → `@ifi/oh-pi-core`
- `@ifi/oh-pi-cli` → `@ifi/oh-pi-cli`
- `@ifi/oh-pi-extensions` → `@ifi/oh-pi-extensions`
- `@ifi/oh-pi-ant-colony` → `@ifi/oh-pi-ant-colony`
- `@ifi/oh-pi-themes` → `@ifi/oh-pi-themes`
- `@ifi/oh-pi-prompts` → `@ifi/oh-pi-prompts`
- `@ifi/oh-pi-skills` → `@ifi/oh-pi-skills`
- `@ifi/oh-pi-agents` → `@ifi/oh-pi-agents`

## 0.2.1 (2026-03-08)

### Features

- rewrite configuration wizard UX
- monorepo restructure under @ifi/* scope
- detailed changesets, markdown formatting, knope publish workflow

#### `@ifi/oh-pi-agents` — Initial release

5 AGENTS.md templates providing role-specific AI guidelines.

- **General Developer** — Universal coding guidelines covering code style, testing, documentation,
  and PR etiquette
- **Full-Stack Developer** — Frontend, backend, and database conventions with framework-specific
  guidance
- **Security Researcher** — Penetration testing, vulnerability assessment, and OWASP audit
  methodology
- **Data & AI Engineer** — MLOps pipelines, data processing, model training, and experiment tracking
- **Colony Operator** — Multi-agent orchestration guidelines for the ant-colony swarm system

Each template is a markdown file placed at `~/.pi/agent/AGENTS.md` to guide the AI's behavior.

#### `@ifi/oh-pi-ant-colony` — Initial release

Multi-agent swarm extension modeled after real ant ecology.

- **Colony lifecycle**: SCOUTING → PLANNING_RECOVERY → WORKING → REVIEWING → DONE with automatic
  phase transitions
- **Three ant castes**: Scouts (fast/cheap models for exploration), Workers (capable models for code
  changes), Soldiers (thorough models for review)
- **In-process agents**: Each ant is an `AgentSession` via pi SDK — zero startup overhead, shared
  auth and model registry
- **Pheromone communication**: `.ant-colony/pheromone.jsonl` shared discovery log with 10-minute
  half-life decay
- **Adaptive concurrency**: Auto-tunes parallelism based on throughput, CPU load (>85% reduction),
  and 429 rate limit backoff (2s→5s→10s cap)
- **File locking**: One ant per file — conflicting tasks are blocked and resume when locks release
- **Planning recovery**: When scouts return unstructured intel, colony enters `planning_recovery`
  instead of failing
- **Plan validation gate**: Tasks are validated (title/description/caste/priority) before workers
  start
- **Scout quorum**: Multi-step goals default to ≥2 scouts for better planning reliability
- **Real-time UI**: Status bar with task progress, active ants, tool calls, cost; `Ctrl+Shift+A`
  overlay panel; `/colony-stop` abort command
- **Signal protocol**: Structured `COLONY_SIGNAL:*` messages pushed to main conversation (LAUNCHED,
  SCOUTING, WORKING, REVIEWING, COMPLETE, FAILED, BUDGET_EXCEEDED)
- **Turn budgets**: Scout: 8, Worker: 15, Soldier: 8 — prevents runaway execution
- **Auto-trigger**: LLM deploys colony when ≥3 files need changes or parallel workstreams are
  possible

#### `@ifi/oh-pi-cli` — Initial release

Interactive TUI configurator that sets up `~/.pi/agent/` in under a minute.

- **Three setup modes**: Quick (3 steps), Preset (2 steps), Custom (6 steps) — each tailored to
  different experience levels
- **Provider auto-detection**: Scans environment variables for API keys from 7 providers (Anthropic,
  OpenAI, Google Gemini, Groq, OpenRouter, xAI, Mistral) and pre-fills configuration
- **TUI components**: Built on `@clack/prompts` with styled selection menus for providers,
  extensions, themes, keybindings, skills, and AGENTS.md templates
- **File writers**: Generates `auth.json` (0600 permissions), `settings.json`, `keybindings.json`,
  `AGENTS.md`, and copies extension/theme/prompt/skill files into `~/.pi/agent/`
- **Backup detection**: Warns when existing configuration exists and offers timestamped backup
  before overwriting
- **Binary entry point**: Ships as `oh-pi` CLI via `npx @ifi/oh-pi-cli`

#### `@ifi/oh-pi-core` — Initial release

Shared foundation library for all oh-pi packages.

- **Type system**: Full TypeScript type definitions for `OhPConfig`, `ProviderConfig`,
  `WizardBaseConfig`, `Preset`, and all extension/theme/skill/prompt registries
- **Extension registry**: Declarative `EXTENSIONS` array with metadata (name, description, file
  path, default-on/off, category) for all 9 extensions including the new `usage-tracker`
- **Theme registry**: 6 theme definitions (oh-pi Dark, Cyberpunk, Nord, Catppuccin Mocha, Tokyo
  Night, Gruvbox Dark) with file paths and emoji indicators
- **Prompt registry**: 10 prompt template registrations (`/review`, `/fix`, `/explain`, `/refactor`,
  `/test`, `/commit`, `/pr`, `/security`, `/optimize`, `/document`)
- **Skill registry**: 10 skill definitions across tool, UI-design, and workflow categories
- **i18n module**: Bilingual (English/Chinese) translation system with locale detection and `t()`
  helper function
- **Preset system**: Pre-configured profiles (Full Power, Clean, Colony Only) mapping to curated
  extension/theme/thinking-level combinations

#### `@ifi/oh-pi-extensions` — Initial release

9 pi extensions that hook into the pi SDK event system.

- **safe-guard** (default: on) — Intercepts destructive commands (`rm -rf`, `git push --force`,
  `DROP TABLE`, `chmod 777`) and protected path writes. Prompts for confirmation or blocks outright
  via `tool_call` event hooks
- **git-guard** (default: on) — Auto-creates `git stash` checkpoints on session start when repo is
  dirty. Tracks changed files from write/edit tool results
- **auto-session-name** (default: on) — Extracts a short title from the first user message on
  `turn_end` and calls `pi.setSessionName()`
- **custom-footer** (default: on) — Rich status bar showing model, input/output tokens, cost,
  context %, elapsed time, working directory, and git branch. Auto-refreshes every 30 seconds
- **compact-header** (default: on) — Dense one-liner startup header replacing the verbose default
- **auto-update** (default: on) — Async npm version check on `session_start` via `pi.exec()` with
  semver comparison and upgrade notification
- **bg-process** (default: off) — Overrides the built-in `bash` tool to auto-background commands
  exceeding 10 seconds. Provides `bg_status` tool for listing, viewing logs, and stopping background
  processes
- **usage-tracker** (default: off) — CodexBar-inspired rate limit and cost monitor. Probes `claude`
  and `codex` CLIs for provider-level quota percentages and reset countdowns. Live widget, `/usage`
  overlay with `Ctrl+U`, `/usage-toggle`, `/usage-refresh` commands, and LLM-callable `usage_report`
  tool. Tracks per-model token usage with cost threshold alerts at $0.50/$1/$2/$5/$10/$25/$50

#### Infrastructure and tooling

- **Monorepo**: pnpm workspace with 9 packages under `@ifi/*` npm scope
- **Biome**: Strict linting and formatting (tabs, 120 char width, double quotes, organized imports)
- **tsgo**: `@typescript/native-preview` (official TypeScript 7.0 Go port) for fast type checking
- **GitHub Actions CI**: lint → typecheck → test (Node 20 + 22) → build pipeline with changeset
  enforcement on PRs
- **Knope**: Automated changelog generation, version bumping (lockstep across all packages), git
  tagging, and GitHub releases
- **Vitest**: 254 tests across 21 test files with fake timers for fast execution
- **All documentation translated to English**: 8 main docs, supplementary docs, benchmarks,
  ant-colony README, and 16+ source file comments

#### `@ifi/oh-pi` — Initial release

Meta-package that bundles all oh-pi packages for one-command installation.

- **Single install**: `pi install npm:@ifi/oh-pi` adds all extensions, themes, prompts, skills, and
  agents templates
- **Bundled dependencies**: All sub-packages are listed as `bundledDependencies` so pi gets
  everything in one `npm install`
- **Pi package manifest**: Declares extension, theme, prompt, and skill paths via the `pi` field so
  pi auto-discovers all resources
- **Transitive packages**: Pulls in `@ifi/oh-pi-extensions`, `@ifi/oh-pi-ant-colony`,
  `@ifi/oh-pi-themes`, `@ifi/oh-pi-prompts`, `@ifi/oh-pi-skills`, and `@ifi/oh-pi-agents`

#### `@ifi/oh-pi-prompts` — Initial release

10 markdown prompt templates for common development tasks.

- `/review` — Code review targeting bugs, security vulnerabilities, and performance issues
- `/fix` — Fix errors with minimal, focused changes
- `/explain` — Explain code at varying levels of detail
- `/refactor` — Refactor code while preserving behavior
- `/test` — Generate comprehensive test suites
- `/commit` — Create Conventional Commit messages from staged changes
- `/pr` — Write pull request descriptions with context and rationale
- `/security` — OWASP-based security audit
- `/optimize` — Performance optimization with profiling guidance
- `/document` — Generate inline documentation and README sections

Each template is a markdown file that pi loads as a slash command. Install via
`pi install npm:@ifi/oh-pi-prompts`.

#### `@ifi/oh-pi-skills` — Initial release

10 skill packs across three categories.

**Tool skills** (zero-dependency Node.js scripts):

- `context7` — Query latest library documentation via the Context7 API
- `web-search` — DuckDuckGo search (free, no API key required)
- `web-fetch` — Extract webpage content as clean plain text

**UI design system skills** (CSS tokens + component specs):

- `liquid-glass` — Apple WWDC 2025 translucent glass style with `--lg-` CSS custom properties
- `glassmorphism` — Frosted glass blur and transparency with `--glass-` tokens
- `claymorphism` — Soft 3D clay-like surfaces with `--clay-` tokens
- `neubrutalism` — Bold borders, offset shadows, high contrast with `--nb-` tokens

**Workflow skills** (strategy guides):

- `quick-setup` — Detect project type and generate `.pi/` configuration
- `debug-helper` — Error analysis, log interpretation, and profiling
- `git-workflow` — Branching, commits, PRs, and conflict resolution

Each skill directory contains a `SKILL.md` manifest and supporting files. Install via
`pi install npm:@ifi/oh-pi-skills`.

#### `@ifi/oh-pi-themes` — Initial release

6 color themes for pi's terminal UI.

- **oh-pi Dark** — Cyan and purple with high contrast, the signature oh-pi look
- **Cyberpunk** — Neon magenta and electric cyan for a futuristic aesthetic
- **Nord** — Arctic blue palette based on the Nord color system
- **Catppuccin Mocha** — Pastel tones on a dark background from the Catppuccin palette
- **Tokyo Night** — Blue and purple twilight hues inspired by Tokyo at night
- **Gruvbox Dark** — Warm retro tones from the classic Gruvbox color scheme

All themes are JSON files compatible with pi's `settings.json` theme configuration. Install via
`pi install npm:@ifi/oh-pi-themes`.

### Fixes

- CI builds core before typecheck and tests
- remove composite/references, use plain tsgo resolution

## 0.2.0

### Features

- Monorepo split into 9 packages under `@ifi/*` scope
- Added `usage-tracker` extension with CodexBar-inspired rate limit monitoring
- Integrated tsgo (`@typescript/native-preview`) for fast type checking
- Added Biome for strict linting and formatting
- Translated all documentation and comments from Chinese to English
- Added GitHub Actions CI pipeline
- Migrated from npm to pnpm workspace

### Fixes

- Fixed ESM `__dirname` usage in `auto-update.ts`
- Extracted helper functions to reduce cognitive complexity across extensions
