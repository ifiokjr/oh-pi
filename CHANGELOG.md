# Changelog

## 0.3.6 (2026-03-29)

### Features

- add option to disable emoji icons with plain ASCII fallbacks (#28)

### Fixes

- harden nest lock recovery (#21)
- move and clean up shared scheduler state (#22)
- move repo-local runtime state to shared pi storage (#23)
- handle older pi model registry in btw (#26)
- improve follow-up scheduling guidance (#29)
- add and refine npm keywords across the remaining published packages to improve discovery on pi.dev/packages.
- fix ant-colony nest lock recovery and ensure colony IDs stay unique under concurrent launches.
- fix BTW API key resolution on older pi runtimes that do not expose `ctx.modelRegistry.getApiKey()`.
- improve scheduler tool descriptions so pi is more likely to use scheduled follow-ups for PRs, CI, builds, deployments, and other future check-ins.
- Move ant-colony runtime state and isolated worktree directories out of repository-local `.ant-colony/` folders into a shared pi agent storage root under `~/.pi/agent/ant-colony/...` by default. Legacy local colony state is migrated automatically, `.gitignore` is no longer modified in the default shared mode, and an explicit `storageMode: "project"` opt-in remains available for users who prefer the old repo-local behavior.
- Move scheduler state out of repository-local `.pi/scheduler.json` files into a shared pi agent directory under `~/.pi/agent/scheduler/...`, using a path that mirrors each workspace path for uniqueness. Legacy repo-local scheduler files are migrated automatically when discovered, and defunct scheduler stores are cleaned up once all tasks expire or are removed.
- Move subagent project-scope agent and chain definitions out of repo-local `.pi/agents/` folders into a shared pi agent directory under `~/.pi/agent/subagents/project-agents/...` by default. Legacy project-local definitions are migrated automatically when discovered, mirrored parent workspaces are still searched for project overrides, and a `projectAgentStorageMode: "project"` opt-in keeps the old repo-local behavior available.
- Pin `picomatch` to `4.0.4` via pnpm overrides so CI security audits pass with the patched version of the transitive dependency used by the Vitest toolchain.

## 0.3.5 (2026-03-25)

### Features

- add architecture and refactor planning skills (#19)

#### Add four new skills to `@ifi/oh-pi-skills`:

- `grill-me`
- `improve-codebase-architecture` (with `REFERENCE.md`)
- `request-refactor-plan`
- `write-a-skill`

### Fixes

- restore anthropic and google rate-limit display (#20)

#### Fix usage-tracker provider display regressions:

- Treat Anthropic OAuth `utilization` as percentage values (so `1.0` means 1% used, not 100% used).
- Preserve last known provider windows when transient probe responses report rate-limited/unavailable with no windows.
- For Google Cloud Code Assist tiers that explicitly state "unlimited", show a `Subscription quota` window at 100% instead of only showing "windows unavailable".

## 0.3.4 (2026-03-24)

### Fixes

- truncate usage widget lines by terminal width (#18)
- Fix usage-tracker widget line truncation by respecting the terminal `width` in widget `render(width)` and applying `truncateAnsi` to each rendered line. This prevents crashes from overlong widget lines when multiple provider bars are displayed in narrow terminals.

## 0.3.3 (2026-03-23)

### Fixes

- restore openai and google usage probes (#16)

#### Fix usage-tracker provider probing for OpenAI and Google OAuth auth:

- Use ChatGPT Codex `backend-api/wham/usage` for OpenAI and parse primary/secondary/additional window usage.
- Use Google Cloud Code Assist `v1internal:loadCodeAssist` for Google OAuth metadata instead of the unsupported Generative Language models endpoint.
- Improve OpenAI/Google reporting with clearer plan/account/project details and fallback notes when window data is unavailable.

## 0.3.2 (2026-03-23)

### Fixes

- add global dispatch rate limiter fuse (#14)
- use Anthropic OAuth usage endpoint in usage tracker (#15)

#### Fix Anthropic usage probing in the usage tracker for pi-managed OAuth tokens.

- Use Anthropic's OAuth usage endpoint (`/api/oauth/usage`) for `sk-ant-oat...` tokens (matching Claude Code behavior).
- Avoid false "auth token expired" errors when OAuth is valid but the old probe endpoint is unsupported.
- Surface OAuth endpoint rate limiting as an informational note instead of an auth failure.
- Keep API-key probe fallback via `count_tokens` for non-OAuth Anthropic credentials.
- Silence a pre-existing scheduler lint warning by documenting intentional cognitive complexity in task deserialization.
- Pin `fast-xml-parser` to a patched version via pnpm overrides to resolve the high-severity audit finding in CI.

#### fix(scheduler): harden `/loop` against runaway recurring schedules

- Reject cron schedules that run more frequently than once per minute
- Prevent unsafe cron parsing fallback from misreading invalid 6-field cron as 5-field
- Sanitize loaded scheduler tasks (cap to `MAX_TASKS`, drop unsafe cron entries, clamp unsafe intervals)
- Harden recurring dispatch to self-heal invalid interval values and avoid pathological next-run loops
- Add a global scheduler dispatch fuse (max 6 task dispatches per minute) to prevent burst floods
- Improve cron-related error/help text to call out the 1-minute minimum cadence

## 0.3.1 (2026-03-15)

### Features

- add creative and multimodal builtin agents
- replace CLI probing with direct API auth in usage-tracker
- add web server, client, and /remote extension

### Fixes

- auto-refresh expired OAuth tokens and handle OpenAI 403
- Auto-refresh expired OAuth tokens in the usage-tracker extension using pi's built-in OAuth module. Handles OpenAI 403 gracefully for subscription tokens. Parses Google Antigravity JSON-encoded API keys for direct API calls.

## 0.3.0 (2026-03-14)

### Breaking Changes

#### Add remote web management for pi instances.

Introduces three new packages for controlling a pi session from any browser or mobile device:

- `@ifi/pi-web-server` — Embeddable HTTP + WebSocket server that bridges a pi `AgentSession` to remote clients with token-based auth, auto-tunnel detection (cloudflared/tailscale), and QR code generation.
- `@ifi/pi-web-remote` — Pi extension that registers the `/remote` command. One command, zero config: starts the server, auto-detects connectivity, and displays a QR code to scan.
- `@ifi/pi-web-client` — Platform-agnostic TypeScript client library (zero dependencies) that works in browsers, React Native, and Node.js.

Also includes a headless daemon mode (`pi-web serve`) for long-running always-on instances.

### Features

- add creative and multimodal builtin agents
- replace CLI probing with direct API auth in usage-tracker
- add web server, client, and /remote extension
- Replace CLI-based rate limit probing with direct API calls using pi-managed auth tokens. The usage-tracker extension no longer shells out to external `claude` or `codex` CLI tools. Instead, it reads OAuth credentials from `~/.pi/agent/auth.json` and queries provider APIs directly (Anthropic, OpenAI, Google). Adds Google provider support. Updates `/usage` overlay, widget, and `Ctrl+U` dashboard to probe all configured providers.

#### Add new builtin subagents for creative and multimodal tasks.

- add an `artist` agent tuned for SVG creation and concrete visual asset briefs using `gemini-3.1-pro-high`
- add a `frontend-designer` agent tuned for distinctive, production-grade UI implementation using `claude-opus-4-6`
- add a `multimodal-summariser` agent tuned for summarizing image, audio, and video inputs using `gemini-3-flash`
- document the new builtin agents and cover their bundled discovery in tests

### Fixes

- Fix remaining unscoped `npx oh-pi` references in `docs/DESIGN.md` to use `npx @ifi/oh-pi`.

## 0.2.16 (2026-03-14)

### Fixes

- avoid shortcut conflict with subagents
- Change the ant-colony details shortcut from `Ctrl+Shift+A` to `Ctrl+Shift+C` so it no longer conflicts with the subagents extension shortcut.

## 0.2.15 (2026-03-14)

### Features

#### Make the `pi-plan` and `pi-spec` extensions installable through the oh-pi configurator's extension workflow.

- add `plan` to the selectable extension registry alongside `spec`
- teach the CLI extension writer how to copy the `pi-plan` runtime into `.pi/agent/extensions/plan`
- vendor the plan runtime's `@ifi/pi-shared-qna` and `@ifi/pi-extension-subagents` dependencies so local installs resolve correctly
- add CLI package dependencies and regression tests covering plan/spec extension resource resolution and local extension copying

### Fixes

- install plan and spec extensions locally

## 0.2.14 (2026-03-13)

### Features

- add pi-plan planning mode package (#8)
- add native /spec workflow package

#### Improve colony isolation and cost visibility:

- run ant-colony executions in isolated git worktrees by default (with shared-cwd fallback when unavailable)
- persist/report workspace metadata so users can see where colony edits were made
- resume colonies with saved workspace hints, including worktree re-attachment when possible
- emit ant inference usage events (`usage:record`) from colony workers/soldiers/scouts
- aggregate external/background inference in usage-tracker reports, widget, and session totals
- add tests for worktree isolation and external usage ingestion

#### Add `/btw` and `/qq` side-conversation extension and skill:

- `/btw` opens a parallel side conversation without interrupting the main agent run
- `/qq` is an alias for `/btw` ("quick question")
- streams answers into a widget above the editor
- maintains a continuous thread across exchanges, persisted in session state
- keeps BTW entries out of the main agent's LLM context
- supports `--save` to persist an exchange as a visible session note
- sub-commands: `:new`, `:clear`, `:inject`, `:summarize` for thread management
- includes a `btw` skill for discoverability and guidance

Based on https://github.com/dbachelder/pi-btw by Dan Bachelder (MIT).

#### Add concrete multimodal/telemetry routing capabilities and completion verification coverage:

- add worker-class routing (`design`, `multimodal`, `backend`, `review`) with per-class model override support
- add cheap-first multimodal ingestion preprocessing and route metadata handling for worker tasks
- add promote/finalize gate types + decision logic with confidence/coverage/risk/policy/SLO reasons
- record routing telemetry (claimed/completed/failed/escalated, latency, reasons) and roll it into budget summary snapshots
- expose new ant-colony tool model override parameters for worker classes
- add focused tests for gate decisions, budget telemetry rollups, and index-level event-bus propagation
- add deterministic completion verification harness (`pnpm verify:completion`) with slash-command completion tests

#### Add a new `flutter-serverpod-mvp` skill for bootstrapping OpenBudget-style full-stack projects:

- monorepo-first Flutter + Serverpod architecture guidance
- devenv-based local runtime workflow (scripts, services, CI setup)
- hooks-first Riverpod conventions for app state and UI composition
- strict i18n rules with ARB + generated localizations and hardcoded-text checks
- GoRouter route-name constants and shell-based routing patterns with auth redirects
- end-to-end MVP scaffolding checklist from workspace setup to first feature slice

#### Add `bin` installer so `npx @ifi/oh-pi` registers all sub-packages with pi.

Supports `--version <ver>` to pin a specific version, `--local` for project-scoped
installs, and `--remove` to uninstall all oh-pi packages from pi.

#### Add `@ifi/pi-extension-subagents`, a full-featured subagent orchestration package built on top of

`nicobailon/pi-subagents`.

- vendor the upstream subagent extension runtime, TUI manager, async runner, and bundled builtin agents
- publish it as `@ifi/pi-extension-subagents` with raw TypeScript sources via the package `pi` field
- add a small `npx @ifi/pi-extension-subagents` installer/remover wrapper around `pi install/remove`
- cover the packaged helpers and discovery logic with an extensive Vitest suite
- include the new package in the `@ifi/oh-pi` installer bundle and docs

#### Add a new planning mode package, `@ifi/pi-plan`, plus a shared first-party `@ifi/pi-shared-qna`

library in the monorepo.

- vendor the `plan-md` workflow from `sids/pi-extensions` into `packages/plan` and adapt it to the `/plan` command
- back plan research tasks with the in-repo subagent runtime from `@ifi/pi-extension-subagents`
- vendor the shared Q&A TUI component into `packages/shared-qna` to avoid third-party pi package dependencies
- include `@ifi/pi-plan` in the `@ifi/oh-pi` bundle and monorepo docs
- add Vitest coverage for plan flow, prompts, state, request-user-input, task agents, utilities, and shared Q&A helpers

#### Add `@ifi/pi-spec`, a native spec-driven workflow package for pi built as raw TypeScript instead of

shell-script wrappers.

- publish a new `@ifi/pi-spec` package that registers a single `/spec` command with status, init,
  constitution, specify, clarify, checklist, plan, tasks, analyze, implement, list, and next flows
- vendor spec-kit-inspired workflow templates into the package and scaffold them into `.specify/`
  for per-repository customization
- implement native repo detection, feature numbering, branch naming, git branch creation, checklist
  summaries, and prompt handoff entirely in TypeScript
- add comprehensive Vitest coverage for workspace helpers, scaffold creation, prompt generation, and
  command behavior
- integrate the new package into the oh-pi installer, CLI resource copying, extension registry, and
  repo documentation

#### Add a new `rust-workspace-bootstrap` skill that scaffolds a Rust workspace template inspired by `mdt` and `pina`, including:

- knope changeset + release workflows
- devenv/direnv setup with common Rust scripts
- GitHub Actions for CI, coverage, semver checks, release preview, and release assets
- core + CLI crate starter structure
- enforced crate naming convention using underscores (`_`) instead of hyphens (`-`)

#### Add scheduler extension with `/loop`, `/remind`, `/schedule`, and `/unschedule` commands:

- `/loop` creates recurring scheduled prompts with interval or cron expressions
- `/remind` creates one-time reminders with delay durations
- `/schedule` manages tasks via TUI manager or subcommands (list, enable, disable, delete, clear)
- `/unschedule` is an alias for `/schedule delete <id>`
- Exposes `schedule_prompt` LLM-callable tool for agent-driven scheduling
- Tasks run only when pi is idle; recurring tasks auto-expire after 3 days
- State is persisted to `.pi/scheduler.json` across sessions
- Supports both interval (5m, 2h) and cron expressions (5-field and 6-field)
- Max 50 active tasks with jitter to prevent thundering herd

Based on pi-scheduler by @manojlds (MIT).

#### Enhance the usage tracker dashboard to provide CodexBar-style depth:

- richer provider window rows with both **% left** and **% used**
- inferred **pace analysis** for time-based windows (expected usage vs actual, runout hint)
- provider metadata in reports (plan/account when discoverable)
- constrained-window summary and updated-age lines
- expanded session analytics (avg per turn, cache read/write, cost burn rate)
- richer per-model breakdown (cost share, avg tokens/turn, cache lines)
- force-refresh probing for `/usage`, `Ctrl+U`, and `usage_report`
- fallback to `claude auth status` metadata when modern Claude CLI builds do not expose usage windows
- clearer notes when provider windows are unavailable (e.g. non-interactive TTY/permission constraints)
- regression tests for the new detailed report/overlay content

### Fixes

- skip dependency review when dependency graph is unavailable (#9)
- add missing exports to pi-shared-qna and pi-spec packages
- Make the CI dependency review job skip cleanly when GitHub dependency graph manifests are not yet available for the repository, instead of failing the whole pull request with a repository settings error.
- Add missing `exports` to `pi-shared-qna` and `pi-spec` packages so `require.resolve` can find their `package.json`.

#### Harden and align ant-colony runtime behavior:

- fix final report signal emission to be status-aware (`COMPLETE` for success, failure status otherwise)
- replace raw drone shell execution with an allowlisted `execFileSync` command policy
- update `/colony-resume` to resume all resumable colonies by default when no ID is provided
- add stable colony ID tracking alongside runtime IDs and support both in status/stop command resolution
- share usage-limits tracker instances across runs to avoid listener buildup in runtimes without `off()`
- add integration tests for multi-colony command workflows and signal consistency
- refresh ant-colony README command and installation docs

#### Fix ant-colony JSON task-plan parsing so malformed scout output no longer produces invalid execution plans:

- only accept fenced JSON plans when they are task arrays, nested `tasks` arrays, or single task-like objects
- ignore JSON entries that omit both `title` and `description`
- normalize JSON task titles/descriptions consistently with markdown task parsing
- add parser regression tests for nested JSON plans and missing task fields

#### Improve project automation ergonomics:

- fix pull-request conventional-commit validation to lint real PR commits instead of synthetic merge commit messages
- update `knope document-change` workflow to run `pnpm format` after creating a changeset file

#### Update GitHub Actions workflow dependencies to current releases:

- upgrade `actions/checkout` to `v6.0.2`
- upgrade `actions/setup-node` to `v6.3.0`
- upgrade `pnpm/action-setup` to `v4.4.0`
- upgrade `actions/dependency-review-action` to `v4.9.0`

#### Document and enforce the lockstep knope changeset format:

- document the `default`-only frontmatter rule in AGENTS, README, and CONTRIBUTING
- require `.changeset/*.md` files to use `default` as the only frontmatter key
- validate the rule in CI so package-name frontmatter entries fail fast
- normalize pending changesets to the lockstep `default` format

#### Drop `bundledDependencies` and the `pi` resource manifest from the meta-package.

Pi loads each package with its own module root, so extensions nested inside a
meta-package's `node_modules/` cannot resolve peer-dep imports
(`@mariozechner/pi-coding-agent`, etc.). This caused commands like `/colony` and
`/loop` to silently fail to register.

Each sub-package (`@ifi/oh-pi-extensions`, `@ifi/oh-pi-ant-colony`, etc.) is
already a fully self-contained pi package with its own `pi` field. Users should
install them directly via `pi install npm:@ifi/oh-pi-<name>` so pi can load
extensions with correct module resolution.

The `@ifi/oh-pi` npm package remains as a convenience dependency that pulls all
sub-packages, but no longer declares pi resources itself.

#### Harden release safety with security gates:

- add `pnpm security:check` (dependency allowlist + vulnerability audits)
- run security checks in CI (`security` job) and PR dependency review (`dependency-review` job)
- require security checks in local release flow (`scripts/release.sh`) and `knope release` workflow
- use strict production audit threshold (`pnpm audit --prod --audit-level=high`)
- pin vulnerable transitive `file-type` to `21.3.1` via pnpm override

#### Remove Mandarin Chinese from the project:

- delete `README.zh.md` and `docs/DEMO-SCRIPT.zh.md`
- remove `zh` locale from core types, i18n, and locales
- remove Chinese keywords from ant-colony parser regex patterns
- remove Chinese detection from colony status and scout quorum
- translate Chinese JSDoc comments to English
- update language selectors across all READMEs

#### Disable `safe-guard` as a default-enabled extension going forward:

- mark `safe-guard` as opt-in in the core extension registry used by setup flows
- remove `safe-guard` from quick-mode default extension selection in the CLI
- update the `@ifi/oh-pi` meta-package manifest to exclude `safe-guard` from default loaded extensions
- refresh docs to clarify `safe-guard` is available but not enabled by default

#### Keep `safe-guard` opt-in across the configurator defaults by removing it from the "Full Power"

preset, updating preset copy/docs, and adding a regression test for preset extension selections.

## 0.2.13 (2026-03-13)

### Features

- add pi-extension-subagents package (#6)

### Fixes

- harden JSON task plan parsing
- keep safe-guard opt-in by default

## 0.2.12 (2026-03-12)

### Features

- add bin installer for one-command setup

### Fixes

- install sub-packages directly instead of bundling

## 0.2.11 (2026-03-12)

### Fixes

- bundle croner so scheduler extension loads after install

## 0.2.10 (2026-03-12)

### Features

- implement cheap-first routing and telemetry instrumentation
- add /btw and /qq side-conversation extension and skill (#4)
- add scheduler extension with /loop, /remind, /schedule, and /unschedule commands (#5)

### Fixes

- ensure ctrl+u shortcut overrides deleteToLineStart
- clean up isolated worktrees and add worktree checks
- bundle dependencies so npm install resolves all pi resources

## 0.2.9 (2026-03-09)

### Features

- isolate ant colonies in worktrees and track background inference (#1)
- add rust workspace bootstrap scaffolder (#3)
- add flutter serverpod mvp bootstrap skill

### Fixes

- classify CLI 401 auth failures in usage tracker
- make safe-guard opt-in by default

## 0.2.8 (2026-03-08)

### Fixes

- enforce zero-warning lint and harden colony event bus

#### Zero-warning lint baseline + fail on warnings

- Fixed all Biome warnings across the repo (0 warnings, 0 errors).
- Updated lint commands to fail on warnings:
  - `pnpm lint` now runs `biome check --error-on-warnings .`
  - `pnpm check` now runs `biome ci --error-on-warnings .`
- Updated CI lint job to enforce `--error-on-warnings`.

#### Ant colony runtime fix: event bus compatibility

Fixed colony failures in environments where `pi.events.off` is not implemented.

- `ColonyEventBus.off` is now optional.
- Added `createUsageLimitsTracker()` to safely query usage-tracker limits with
  support for both `on/emit/off` and `on/emit` event buses.
- Prevents `TypeError: opts.eventBus.off is not a function` during colony runs.
- Added regression tests for event buses with and without `off()`.

## 0.2.7 (2026-03-08)

### Features

- support multiple concurrent ant colonies

#### Support multiple concurrent colonies

The ant colony extension now supports running multiple colonies simultaneously.
Each colony gets a short ID (`c1`, `c2`, ...) shown in all status output, signals,
and the details panel.

**New commands:**
- `/colony-count` — shows how many colonies are active with their IDs and goals

**Updated commands:**
- `/colony <goal>` — launches a new colony (no longer blocked by existing ones)
- `/colony-status [id]` — shows one colony by ID, or all if no ID given (with autocomplete)
- `/colony-stop [id|all]` — stops a specific colony by ID, or all if no ID / `all` given (with autocomplete)
- `/colony-resume [colonyId]` — resumes a specific persisted colony, or the most recent one
- `ant_colony` tool — no longer rejects when a colony is already running

**Details panel (Ctrl+Shift+A):**
- Colony selector header when multiple are running
- Press `n` to cycle between colonies

**Backwards compatible:**
- Existing `.ant-colony/` directories on disk are unmodified — `findResumable` still works
- Single-colony usage is unchanged (commands auto-resolve when only one colony exists)
- New `Nest.findAllResumable()` method finds all resumable colonies sorted by creation date

## 0.2.6 (2026-03-08)

### Features

- add /colony slash command for direct colony launch

### Fixes

#### Add `/colony` slash command

The ant colony can now be launched directly with `/colony <goal>` instead of
relying solely on the LLM-callable `ant_colony` tool. The command appears in
autocomplete alongside `/colony-status`, `/colony-stop`, and `/colony-resume`.

Usage: `/colony refactor the auth module to use JWT tokens`

## 0.2.5 (2026-03-08)

### Fixes

- ANSI-aware truncation for usage dashboard overlay

#### Fix usage dashboard truncation cutting through ANSI escape codes

The `/usage` overlay and `Ctrl+U` dashboard now use ANSI-aware line truncation.
Previously, lines were sliced by raw string length which could cut through ANSI
escape sequences mid-code, causing garbled colors and broken terminal rendering.

The new `truncateAnsi()` helper walks the string character by character, skipping
ANSI sequences when counting visible width, and appends a reset (`\x1b[0m`) if
the line is trimmed inside a styled region.

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
