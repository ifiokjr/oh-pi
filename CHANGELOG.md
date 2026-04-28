# Changelog

## 0.5.1 (2026-04-28)

### Fixes

- sync knope dependency versioning
- route oh-pi to interactive cli
- Keep internal package dependency versions in lockstep
- fix(installer): route @ifi/oh-pi through the interactive CLI

## 0.5.0 (2026-04-28)

### Breaking Changes

#### Add several new packages

Document the packages that have been created since the last tagged release (`v0.4.4`) so the next release notes explain what each new workspace package provides.

- `@ifi/pi-extension-adaptive-routing` (`packages/adaptive-routing`) adds optional adaptive and delegated model routing for pi, including routing policy support and evaluation tooling for selecting better models per task.
- `@ifi/pi-background-tasks` (`packages/background-tasks`) adds reactive background shell tasks with `/bg`, log viewing, keyboard access, and agent wakeups when long-running commands emit output.
- `@ifi/pi-diagnostics` (`packages/diagnostics`) adds prompt-completion diagnostics with timestamps, per-turn durations, live timing widgets, and observability for pi sessions.
- `@ifi/pi-provider-catalog` (`packages/providers`) adds an experimental multi-provider catalog backed by `models.dev`, including provider/model discovery and lazy API-key login flows.
- `@ifi/pi-provider-cursor` (`packages/cursor`) adds an experimental Cursor provider with OAuth login, model discovery, and direct AgentService streaming support.
- `@ifi/pi-provider-ollama` (`packages/ollama`) adds experimental Ollama local and cloud provider support, including local model discovery, Ollama Cloud login, model management, and streaming integration.
- `@ifi/pi-remote-tailscale` (`packages/pi-remote-tailscale`) adds secure remote session sharing over Tailscale HTTPS with WebSocket transport, PTY support, QR codes, token auth, and TUI status widgets.
- `@ifi/pi-bash-live-view` (`packages/pi-bash-live-view`) adds PTY-backed live bash execution with a real-time terminal widget, `/bash-pty`, and a `bash_live_view` tool for interactive command output.
- `@ifi/pi-pretty` (`packages/pi-pretty`) adds prettier terminal output for pi, including Shiki-highlighted file reads, colored bash summaries, tree-view directory listings, icons, and enhanced search/read tools.
- `@ifi/pi-analytics-extension` (`packages/analytics-extension`) adds analytics tracking for pi sessions with `/analytics` terminal stats, `/analytics-dashboard`, model/token/cost capture, and SQLite persistence.
- `@ifi/pi-analytics-db` (`packages/analytics-db`) adds the shared SQLite database layer for analytics, including Drizzle ORM schema, migrations, and typed query helpers for sessions, turns, models, providers, codebases, and aggregates.
- `@ifi/pi-analytics-dashboard` (`packages/analytics-dashboard`) adds a private React and Vite dashboard for visualizing AI usage across overview, model, codebase, and insight pages.
- `@ifi/oh-pi-docs` (`packages/docs`) adds the private documentation site package for developing and building the oh-pi documentation site.

### Features

- add experimental Cursor provider package (#81)
- add experimental Ollama Cloud provider (#93)
- unify Ollama local and cloud provider (#94)
- add pi source switcher for local package testing (#101)
- add adaptive routing mode (#95)
- include experimental providers in pi source switcher (#106)
- add external editor draft sync (#114)
- improve session continuity and resume hints (#116)
- add continue-until-complete retry mode (#117)
- emit resume commands on switch and exit (#118)
- add tool execution metadata (#120)
- track task creator origins (#115)
- attribute watchdog slowdowns (#119)
- add provider catalog package (#121)
- add pi-managed worktree flows (#123)
- extract adaptive routing into optional package (#166)
- add scrollable provider and scheduler pickers (#165)
- add provider routing dashboard
- install optional routing packages
- add standalone prompt diagnostics package (#167)
- add routing install scope toggle
- add colon-style subcommand aliases
- improve delegated routing model selection (#189)
- add reactive background task watching (#193)
- `pi` analytics dashboard (#194)
- add devenv skill for devenv.nix task runner (#212)
- add documentation site with Vite + React + MDX (#216)
- add /answer and /answer:auto commands (#211)
- upgrade Vite from 7.3.2 to 8.0.9 (#227)
- add kimi-k2.6 to cloud fallback model catalog (#228)
- add client-side search with minisearch and Cmd+K shortcut (#229)
- add docs:sync for MDT-integrated content pipeline (#230)
- performance audit — fix hot-path issues and add benchmarks (#231)
- reduce context noise, add bg task expiry, label scheduled runs (#233)
- optimize scheduler hot paths — single-pass iterations and zero-alloc dispatch (#235)
- remove explicit model overrides from ant_colony tool, use adaptive routing (#236)
- highlight recommended options in QnA overlay (#238)
- add Ctrl+O context expansion popup for question details (#244)
- add @ifi/pi-remote-tailscale, @ifi/pi-bash-live-view, @ifi/pi-pretty (#255)
- change usage-tracker overlay shortcut from Ctrl+U to Ctrl+Shift+U (#266)
- add a routing corpus and evaluation harness (#275)
- add interactive installer with extension picker, progress bars, and changelog display (#277)
- migrate to tsdown and re-enable no-explicit-any
- feat: add adaptive routing mode with shadow mode, local telemetry, and usage-aware model selection
- feat: add an experimental Cursor OAuth provider package for pi
- Add client-side search (minisearch) and Cmd+K shortcut to the docs site
- Add documentation website package (Vite + React + MDX) with GitHub Pages deployment
- Add colon-style subcommand aliases across provider, routing, Ollama, scheduler, spec, and watchdog workflows, update related docs/help text, and keep provider picker search inside overlay UI so escape and typing no longer fall through to the editor.
- Remove explicit model override parameters from ant_colony tool. Model selection now uses adaptive routing exclusively — scouts, workers, and soldiers each use the best available model for their task category (quick-discovery, implementation-default, review-critical). Configure via /route settings.
- Add an `external-editor` oh-pi extension with a `/external-editor` command and `Ctrl+Shift+E` shortcut for opening the current draft in `$VISUAL` or `$EDITOR`, then syncing the saved text back into pi.
- Extract adaptive routing into its own optional package, add delegated startup provider categories for subagents and ant-colony, and remove hard-coded Anthropic defaults from builtin subagents.
- Implement `@ifi/pi-bash-live-view` package for PTY-backed live terminal viewing of bash commands. Adds `usePTY` parameter to bash tool, live TUI widget with real-time output, and `/bash-pty` slash command.
- Implement `@ifi/pi-pretty` package for enhanced terminal output. Adds syntax highlighting via Shiki, file icons via Nerd Fonts, tree-view directory listings, colored bash exit summaries, and enhanced find/grep rendering.
- Implement `@ifi/pi-remote-tailscale` package for secure remote session sharing via Tailscale HTTPS. Provides PTY-based remote access, WebSocket terminal sharing, QR code display, token auth, discovery service, and optional TUI widget.
- Track which scheduler tasks were created by the current pi instance, surface that origin in the scheduler UI, and add clear-other controls for deleting tasks not created in this instance.
- Make the repo root a git-installable pi package for personal forks by aggregating the shipped runtime extensions, prompts, skills, and themes, and replace npm-incompatible `workspace:*` dependency specifiers with installable lockstep versions.
- Add a native worktree extension with centralized pi-owned git worktree metadata, footer/status surfacing, safe cleanup that only targets pi-managed worktrees by default, and allow edits inside pi-managed worktree paths without repeated protected-path prompts.
- Add a repo-local pi source switcher for toggling oh-pi packages between the current checkout and the published npm packages.
- Extend the local pi source switcher to manage the experimental provider packages too, and warn users to fully restart pi instead of relying on `/reload` after switching sources.
- feat: add a diagnostics extension that logs prompt completion timestamps, durations, and per-turn timing details
- Add an experimental `@ifi/pi-provider-catalog` package that registers a broad set of OpenCode-cataloged API-key providers, refreshes model catalogs from `models.dev` and live provider discovery, and adds `/providers` commands for inspecting and refreshing provider state.
- Add a user/project install scope toggle when installing optional routing packages from the oh-pi routing dashboard.
- Let the oh-pi routing dashboard install missing optional routing and provider packages directly from the setup flow.
- Add a dedicated provider and routing dashboard to the oh-pi setup flow so users can review optional routing packages, available providers/models, delegated assignments, and effective routing for the main session, subagents, and ant-colony.
- Add a default-on `tool-metadata` extension that appends completion timestamps, elapsed runtimes, approximate tool-context size, and session context snapshots to finished tool results.
- Teach the watchdog to profile extension runtime activity, surface likely slowdown culprits in `/watchdog`, and emit scheduler task pressure diagnostics for faster blame and safe-mode triage.

#### Add `/answer` extension for interactive Q&A from LLM responses.

- `/answer` extracts questions from the last assistant message and presents them in a QnA overlay powered by `@ifi/pi-shared-qna`
- `/answer:auto` toggles auto-detection: when enabled, questions in the final LLM response automatically trigger the QnA overlay
- Uses LLM-powered question extraction with structured output (questions, context, and multiple-choice options)
- Answers are injected back into the session as a follow-up user message

#### - Add the experimental `@ifi/pi-provider-ollama` package so pi can discover local Ollama models, log in to Ollama Cloud via `/login ollama-cloud`, and expose both local and cloud models in `/model`.

- Add unified `/ollama` commands for refreshing local + cloud model catalogs and inspecting discovered model metadata.
- Extend usage tracking with best-effort Ollama local/cloud status so `/usage` and `usage_report` include Ollama session visibility and any rate-limit headers Ollama exposes.

#### Add Pi Analytics Dashboard with SQLite persistence, real-time activity stream, and fun insights tracking.

New packages:

- `@ifi/pi-analytics-db`: Drizzle ORM schema + SQLite client for analytics data
- `@ifi/pi-analytics-dashboard`: React 19 + Vite 8 dashboard with Overview, Models, Codebases, and Insights pages
- `@ifi/pi-analytics-extension`: Pi extension that captures session/turn data and opens the dashboard

Features:

- 4 dashboard pages: Overview, Models, Codebases, Insights (emotions, words, misspellings)
- Express API server for real data mode (VITE_API_MODE=api)
- Mock data mode for development (VITE_API_MODE=mock, default)
- /analytics command for quick terminal stats
- /analytics-dashboard command to open in browser
- Emotional tone analysis, word frequency tracking, misspelling detection
- 47 Vitest unit tests + 73 Playwright E2E browser tests
- Zero lint warnings, clean build

#### Add a reactive background task extension for shell watchers.

- add the new `@ifi/pi-background-tasks` package with `/bg`, `Ctrl+Shift+B`, a richer multi-pane dashboard, `bg_task`, and compatibility `bash`/`bg_status` tooling
- move the existing `bg-process` entrypoint in `@ifi/oh-pi-extensions` onto the new shared runtime
- include the new package in the default `@ifi/oh-pi` installer package list and document it in the repo package listings

#### BREAKING CHANGE: `npx oh-pi` now launches an interactive installer by default.

The CLI entry point replaces the legacy config-wizard flow with a brand-new interactive installer that includes:

- **Custom multi-select extension picker** with `Space` to toggle individual items and `A` to select/deselect all. Default extensions are pre-selected.
- **Progress bars and loading indicators** during configuration backup, pi-coding-agent installation, and file writing.
- **Version comparison** showing the currently installed pi version versus the new oh-pi CLI version.
- **Markdown changelog display** rendered inline for all releases between the current and new version.
- `-y` / `--yes` flag for non-interactive/auto-install mode that bypasses the TUI and applies defaults immediately.

To keep the old behaviour pass `--yes`:

```bash
npx oh-pi --yes
```

#### Consolidate worktree registry into `@ifi/oh-pi-core` and add `worktree` tool

- **Consolidate duplicated worktree implementations**: The worktree registry logic that was duplicated across `packages/extensions/extensions/worktree-shared.ts` and `packages/ant-colony/extensions/ant-colony/worktree-registry.ts` is now consolidated into `@ifi/oh-pi-core`. Both files are now thin re-exports from `@ifi/oh-pi-core`, eliminating code duplication and ensuring a single source of truth for worktree management.

- **Add `RepoWorktreeContext` and caching to core**: The lightweight context probe (which uses only `git rev-parse` without `git worktree list --porcelain`) and the async cache-based refresh functions (`getRepoWorktreeContext`, `getCachedRepoWorktreeContext`, `refreshRepoWorktreeContext`, etc.) are now available in `@ifi/oh-pi-core`, matching the full feature set previously only in the extensions package.

- **Add `worktree` tool**: Register a `worktree` tool alongside the existing `/worktree` command. The AI agent can now programmatically create, list, check status, and clean up pi-owned worktrees without needing to use the slash command. This addresses the problem where the `ant_colony` tool bypassed `/worktree` because commands are TUI-only. The tool supports `create`, `status`, `list`, and `cleanup` actions.

- **Fix `touchManagedWorktreeSeen` throttling**: The `saveWorktreeRegistry` function now clears the worktree snapshot cache after writes, and `touchManagedWorktreeSeen` now throttles updates to avoid excessive I/O (5-minute interval).

#### Add option to disable emoji icons and use plain ASCII fallbacks.

Three ways to enable plain icon mode (in priority order):

1. **Environment variable**: `OH_PI_PLAIN_ICONS=1`
2. **CLI flag**: `pi --plain-icons`
3. **settings.json**: `{ "plainIcons": true }` (global `~/.pi/agent/settings.json` or project-local `.pi/settings.json`)

This replaces all emoji icons (🐜, ✅, ❌, 🚀, etc.) with ASCII-safe equivalents (`[ant]`, `[ok]`, `[ERR]`, `[>>]`, etc.) across all oh-pi extensions — helpful for terminals or fonts that don't render Unicode emoji correctly.

Closes #24.

#### Reduce context noise from watchdog/safe-mode messages, add bg task default expiry, and label scheduled task runs

- **Background tasks**: Add a default 10-minute expiry to all background tasks. Expired tasks are automatically stopped and logged. Set `expiresAt: null` to disable. The expiry is displayed in the dashboard and spawn output.
- **Background task output events**: No longer trigger agent turns (only exit events do), reducing unnecessary LLM context consumption from routine output notifications.
- **Scheduler dispatches**: Use `sendMessage` with a custom type (`pi-scheduler:dispatched`) instead of `sendUserMessage`. Scheduled task runs now render with a distinct "⏰ Scheduled run" label in the TUI, showing the task ID, mode, and run count, instead of appearing as regular user messages.

#### Upgrade Vite from 7.3.2 to 8.0.9 across the monorepo. Also upgrade

@vitejs/plugin-react from v4 to v6 for Vite 8 compatibility. Convert analytics-dashboard's manualChunks from object to function form (required by Rolldown/Vite 8).

### Fixes

- use pi shell resolution in bg-process (#100)
- validate extension paths in management API (#103)
- secure async config temp file creation (#104)
- harden system prompt creation via management API (#105)
- add shared config loader and harden git guard
- ignore empty scheduler ownership (#112)
- expand cloud catalog and local downloads
- improve follow-up reliability
- improve usage provider picker (#124)
- harden tool-output rendering against crash inputs (#125)
- detect pi command more reliably (#126)
- sanitize tool details for safe fallback rendering (#127)
- install missing switcher packages (#128)
- stabilize cloud model startup and streaming (#129)
- avoid blocking auto-update checks (#130)
- defer heavy usage startup work (#132)
- guard auth storage access on startup (#131)
- defer custom footer startup work (#133)
- defer worktree startup refresh (#134)
- defer git-guard startup checks (#135)
- defer local cli startup refresh (#136)
- default adaptive routing to off (#137)
- defer scheduler startup ownership (#138)
- defer startup state refresh (#139)
- defer startup artifact cleanup (#140)
- defer btw startup restore (#141)
- page login picker (#142)
- defer adaptive routing startup refresh (#143)
- defer compact-header settings sync (#144)
- restore build compatibility (#145)
- defer global startup cleanup (#147)
- defer watchdog config loading (#148)
- lazy-load storage config (#149)
- align cloud glm reasoning compat (#146)
- lazy-load config (#150)
- route cloud requests by provider (#152)
- avoid blocking startup cleanup (#153)
- avoid startup watchdog stalls (#157)
- restore smoke test formatting (#158)
- use canonical session ids in resume hints (#154)
- defer usage tracker persisted loads (#160)
- approve vitest coverage dependency (#162)
- use session file in resume hint (#177)
- preserve manual session names (#187)
- warn about stale workspace installs (#190)
- improve overlay popup contrast (#198)
- use native mistral conversations api (#197)
- resolve tool name conflict with background-tasks extension (#208)
- add 404.html for GitHub Pages SPA routing (#225)
- return Widget from worktree renderCall/renderResult (#226)
- use runtime discovery state for cloud models, surface errors (#232)
- prefer runtime discovery state in modifyModels for /scoped-models (#234)
- improve answer extraction to find full question formulations (#237)
- validate resolved models against available model registry (#246)
- add deliverAs followUp to scheduler dispatch
- remove auto-backgrounding from bash tool override (#258)
- stop scheduler idle heartbeat and cache compact-header catalog
- add missing extensions to pi:local source switcher
- use ctx.modelRegistry for registerProvider in handlers
- remove conflicting bash tool passthrough
- avoid bash tool conflicts between pretty and live view
- guard ctx.model getter in compact-header and custom-footer render paths (#265)
- keep release package metadata in sync
- filter extension-registered tools from --tools whitelist
- resolve skills against task cwd
- prefer current session model
- cascade parent project agents
- wrap async widget debug output
- add deepseek v4 flash fallback model
- rebuild core from workspace root
- prevent qna tui width overflow
- keep footer running for active tools
- chmod node-pty prebuild spawn helper
- reduce widget render churn (#287)
- discover cloud models at startup
- fix: defer adaptive routing startup refresh
- Add kimi-k2.6 to Ollama cloud fallback model catalog
- Reduce ant-colony runtime churn by deduplicating repeated colony status-bar updates, replacing lock spin-waiting with sleeping lock retries, and skipping pre-review TypeScript checks unless worker output actually touched a detectable TS project.
- fix: lazily resolve ant-colony storage options
- Approve `@vitest/coverage-v8` in the dependency allowlist so the new coverage workflow passes repository security checks.
- fix: stop auto session renames after a manual /name override
- fix: make the auto-update extension check versions without blocking the event loop
- Improve benchmark robustness by batching fast samples to reduce timer noise, narrowing focused startup hotspots from changed files, and adding tests for benchmark sampling and target selection.
- fix: defer btw thread restoration on startup
- Update the CI test matrix to run on Node 22 and Node 24, removing Node 20 from the test job.
- chore: move stray pending change files into the tracked `.changeset/` directory
- fix: defer compact header settings sync on startup
- Add focused coverage for the web server, remote access extension, core worktree helpers, CLI orchestration, provider command routing, shared Q&A TUI flows, and subagent execution paths, and enforce a 100% patch-coverage gate in CI while keeping the overall Codecov project target at 60% for now.
- Reduce custom-footer idle redraw churn by letting the PR poll timer probe for changed PR state without forcing a footer rerender every minute when the visible footer content is unchanged.
- fix: defer expensive custom-footer startup refresh work
- Reduce diagnostics widget idle redraw churn by only running its elapsed-time refresh timer while a prompt is actively in progress. This removes the always-on one-second idle redraw loop that could multiply across several pi instances and contribute to watchdog event-loop warnings.
- Add initial delegated-model routing research artifacts and runtime selection improvements for subagents and ant-colony, including a reproducible model-intelligence snapshot sourced from public benchmarks and provider catalogs.
- ci: run push and pull_request workflows for stacked prep branches
- refactor: apply a repo-wide readability cleanup and stabilize a slow worktree test timeout
- Fix the `@ifi/pi-bash-live-view` package build by running the normal package test suite during `pnpm build` and keeping coverage behind a dedicated `test:coverage` script.
- Fix the `bg-process` bash tool override to use pi's shell resolution on Windows instead of hardcoding `spawn("bash")`, and write background logs to the platform temp directory.
- Keep the diagnostics footer in its running state while tools are still executing, even if the previous prompt completion errored.
- Reduce diagnostics widget render churn while prompts or tools are active and make session-state restoration scan from the newest entries first.
- - Clarify the git-workflow skill to disable both `GIT_EDITOR` and `GIT_SEQUENCE_EDITOR` (plus `core.editor`/`sequence.editor` overrides) so agent-run Git commands avoid interactive editors in rebase and merge flows.
- fix the provider catalog to route native Mistral providers through the Mistral conversations API.
- Fix the Ollama Cloud provider to discover the public model catalog during bootstrap and refreshes even before login, keep that broader public catalog visible even when authenticated discovery is narrower, extend the bundled fallback catalog with `glm-5.1`, and add CLI-aware local download prompts plus local context-window metadata sourced from the cloud catalog.
- Fix `pnpm pi:local` so it rebuilds `@ifi/oh-pi-core` from the workspace root before syncing local runtime artifacts, avoiding misleading package-local pnpm failures during local source switching.
- fix: detect the pi executable more reliably when switching oh-pi packages back to published sources
- Fix provider-catalog build and typecheck regressions in the paged login flow by tightening extension context types, handling optional refresh timestamps safely, and aligning provider tests with the actual extension harness types.
- Reduce provider-catalog login clutter by switching to a paged `/providers login` flow that shows at most 10 providers at a time, lazily registers selected providers, and keeps persisted or env-configured providers available across sessions.
- Keep the lockstep release config and publish metadata in sync with every workspace package so `knope release` and publish verification do not leave newly added packages out of version bumps or packaging checks. Also make dedicated extension copies resilient to symlinked runtime bins during setup.
- - Fix formatting in `packages/extensions/extensions/smoke.test.ts` after removing the `safe-guard` extension so CI lint passes cleanly.
- Fix scheduled task dispatching to use `deliverAs: "followUp"` alongside `triggerTurn: true`. This ensures scheduled prompts are properly injected into the agent's message stream and trigger a real LLM turn, matching the behavior of the previous `sendUserMessage` approach.
- Fix the scheduler so empty instances do not hold or prompt about scheduler ownership when there are no scheduled tasks to review.
- Improve scheduler reliability by keeping it active across session churn, making manual `Run now` actions immediately runnable, and shortening recurring task expiry defaults to 24 hours with a configurable expiry for recurring monitors.
- fix: use the canonical session id in resume hints and drop the broken `pi resume` alias
- Fix the auto-session-name resume hint so it points at the saved session file path that `pi --session` expects.
- Wrap async subagent widget debug tail lines instead of truncating them with ellipses so long model, cwd, and tool details stay readable in narrow terminals.
- fix: defer git-guard dirty-repo startup checks
- fix: defer ollama cli detection during session startup
- Performance audit: fix hot-path regex compilation, debounce disk writes, optimize array pruning, and add benchmarks.
- Optimize scheduler hot paths — single-pass iterations, zero-alloc dispatch, and O(n) pruning.
- Add a clearer local-source-mode reminder to run `pnpm install --frozen-lockfile` after pulling, rebasing, or switching branches so pi does not fail to resolve internal workspace packages from a stale install.
- fix: make pi source switching install newly added packages and refresh local package manifests
- fix: defer plan state refresh on startup
- Remove the translated root README and switch the GitHub issue templates to English-only copy.
- - Remove the `safe-guard` extension from oh-pi manifests, registry entries, tests, and documentation.
- Stop tracking TypeScript build info artifacts and ignore future `.tsbuildinfo` files.
- Add a PR-gated runtime churn benchmark suite that mounts widgets and footers, advances an idle window, and ranks extensions by redraw and status-write churn. This makes steady-state performance issues easier to catch, including cases that can later surface as watchdog event-loop warnings even when startup time looks healthy.
- improve the contrast of scrollable overlay popups like `/schedule` in dark terminal themes.
- fix: defer scheduler startup ownership prompts
- Reduce background UI churn by deduplicating repeated scheduler and watchdog status-bar updates, and by slowing footer PR polling to match the existing GitHub probe cooldown.
- Improve the scheduler and provider pickers with scrollable overlays that stay within the current window height, and let provider model selection show the full model list instead of truncating it.
- Treat pnpm audit failures caused by npm's retired audit endpoints as a non-fatal upstream issue in repo security checks, while still preserving allowlist enforcement and real audit failures.
- Add TypeScript startup benchmarks, convert the existing microbenchmarks to TypeScript, and run the benchmark suite on every pull request with uploaded reports and PR summaries.
- Reduce idle startup status churn by skipping initial no-op status clear writes for unseen status-bar keys while preserving real clears after visible status text has been shown.
- Add an RFC for clean-room subagent and ant-colony adaptive routing inspired by selected ideas from oh-my-openagent while preserving pi's minimal, user-owned extension model.
- Validate subagent models against available models before passing to spawned pi process. Previously, subagents inherited the parent session model (e.g. `github-models/openai/gpt-4o-mini`) without checking whether it was actually available, causing "No models match pattern" warnings. Now, runtime overrides, frontmatter models, and session-default fallbacks are all validated against the available model registry. Invalid models are silently skipped, allowing fallback to delegated category routing or no model override.
- fix: lazy-load subagent config
- fix: defer subagents global startup cleanup
- fix: defer subagent startup artifact cleanup
- Document the current coverage policy more clearly for contributors and add a `pnpm test:patch-coverage` shortcut for running the local 100% patch-coverage gate.
- Rewrite the patch coverage enforcement script in TypeScript and run it through `pnpm tsx` in CI.
- fix: scope usage tracker surfaces to the active or selected provider and improve the /usage picker UX
- chore(extensions): change usage-tracker overlay shortcut from `Ctrl+U` to `Ctrl+Shift+U` while preserving existing `/usage`, `/usage-toggle`, `/usage-refresh`, and `usage_report` behavior.
- fix: defer expensive usage-tracker startup refresh work for large sessions
- Reduce usage-tracker idle startup churn by skipping widget redraw requests when deferred startup probe or persisted-state work does not change the widget's visible content.
- Reduce usage-tracker widget redraw churn by removing the fixed refresh timer, re-rendering on real usage/probe/session changes instead, and keeping the widget aligned with the latest active session after switches.
- Use `tsgo` for `tsdown` declaration generation in compiled packages and remove the native TypeScript compiler dependency.
- fix: defer watchdog config loading on startup
- Reduce worktree startup overhead by splitting lightweight context refreshes from full worktree inventory snapshots, throttling managed-worktree touch writes, and extending startup benchmarks to track both paths.
- Reduce idle worktree status churn by removing the startup-time worktree status refresh and only updating the status badge during explicit worktree interactions.
- fix: defer worktree status refresh on session startup

#### Make adaptive routing opt-in by default.

- change the default adaptive-routing mode from `shadow` to `off`
- add regression coverage to ensure no route suggestions are emitted without explicit config
- document that adaptive routing is off by default in the extensions README

#### Add missing `deepseek-v4-flash` to the Ollama Cloud fallback model catalog.

- Register `ollama-cloud/deepseek-v4-flash` in `FALLBACK_OLLAMA_CLOUD_MODELS` with 1M context window, text input, and reasoning support

#### Add a devenv skill for using devenv.nix as the task runner and development environment.

- add `packages/skills/skills/devenv/SKILL.md` with activation rules, core commands, and script conventions
- add `packages/skills/skills/devenv/REFERENCE.md` with the recommended devenv.nix layout, script options, git hooks, processes, and troubleshooting

#### Add docs:sync script to derive MDX content from docs/\*.md source files.

Content now uses MDT markers and stays in sync with the repo's MDT documentation reuse system.

#### Add missing extension packages to the `pi:local` source switcher.

`@ifi/pi-bash-live-view`, `@ifi/pi-pretty`, `@ifi/pi-remote-tailscale`, and `@ifi/pi-analytics-extension` are now included in `SWITCHER_PACKAGES` so that `pnpm pi:local` points them at the local workspace sources along with every other oh-pi extension.

#### Add repo-wide coverage reporting with Vitest + Codecov, publish a coverage badge in the README,

and post patch coverage details on pull requests.

#### Add a routing corpus and evaluation harness.

- add `evaluate-corpus.ts` reusable offline evaluation runner
- expand `fixtures.route-corpus.json` with richer fixture schema including intent, complexity, risk, tier, thinking, and acceptable fallbacks
- add `evaluate-corpus.test.ts` with regression coverage for classification correctness and model-selection mismatch checks
- update `engine.test.ts` to use the new `CorpusEntry` fields
- add `evaluate:corpus` package script

#### Add Ctrl+O context expansion popup for QnA questions.

When a question has a longer original formulation, pressing Ctrl+O opens a popup inside the QnA overlay showing the full question text, context, and all option descriptions. Escape, Enter, or Ctrl+O again closes the popup.

- Added `fullContext` field to `QnAQuestion` for preserving the verbatim original text alongside the concise `question` summary.
- LLM extraction prompt now instructs preserving `fullContext` when the question is summarized from a longer original.
- `QnATuiComponent` toggles a context popup with Ctrl+O.
- `normalizeExtractedQuestions` passes through `fullContext`.

#### Improve answer extension question extraction to find the most complete formulation with options.

The LLM extraction prompt was updated to:

- Look for the most complete formulation of each question instead of just extracting from a summary at the end
- Keep `question` concise while extracting all explicit choices as `options`
- Support a new `header` field for markdown headings (e.g. "### 2. ...")
- Add a concrete example showing how to extract choices from a detailed section

`normalizeExtractedQuestions` now extracts and passes through the `header` field, and `toQnAQuestions` maps it to the QnA question object so the TUI can display it.

#### Highlight recommended options in answer extension QnA overlay.

The QnA TUI now renders recommended options with bold text and a `(recommended)` postfix so the user's preferred choice stands out visually.

LLM extraction prompt changes:

- Instructs the model to mark clearly recommended options with `recommended: true`
- When there is a recommendation without multiple explicit choices, the model creates a single synthetic recommended option; the TUI already presents an `Other` choice so the user can describe what they actually want.
- Added example showing single-recommendation extraction

Shared QnA component (`qna-tui.ts`):

- Added `recommended?: boolean` to `QnAOption` interface
- Render loop appends `(recommended)` postfix and applies bold styling when `recommended` is true

Answer extension (`answer.ts`):

- Updated `ExtractedQuestion` option type to carry `recommended`
- `normalizeExtractedQuestions` passes through the flag and synthesizes a recommended option from a `recommendation` string when no explicit options exist

Tests:

- Added coverage for recommended flag extraction, defaulting to false, synthesis from recommendation string, and preference for explicit options
- Updated prompt assertion tests for new recommendation guidelines

#### Add a future-planning document for benchmark-informed adaptive routing.

- add `docs/plans/benchmark-informed-adaptive-routing.md` covering the benchmark platform, objective-aware routing, strategy routing, and phased rollout
- cross-link the new plan from the existing adaptive-routing spec
- surface the new planning doc in `docs/00-index.md`

#### Update documentation to include all analytics packages and docs site.

- Added `@ifi/pi-analytics-extension` to architecture diagrams, package lists, and managed local switching
- Added `@ifi/pi-analytics-db`, `@ifi/pi-analytics-dashboard`, and `@ifi/oh-pi-docs` to contributor-facing documentation
- Added dedicated "Analytics stack" section in `docs/feature-catalog.md` with details on extension, DB, and dashboard
- Updated `README.md` packages table, project structure, and opt-in packages note
- Updated `docs/agent-rules/engineering.md` and `docs/agent-rules/packaging-and-release.md` package references
- MDT blocks auto-propagated to `docs/00-index.md`, `docs/feature-catalog.md`, `README.md`, and `packages/oh-pi/README.md`

#### Improve the repo documentation to better cover the full oh-pi feature surface.

- add a package-by-package feature catalog covering runtime packages, content packs, and contributor libraries
- expand the root README with missing extension coverage such as scheduler, BTW/QQ, watchdog, and tool metadata
- add a clearer running-locally guide that explains how `pnpm pi:local` works for local feature testing and development
- refresh package lists and package counts to include newer additions like `pi-web-remote` and the expanded skills pack
- update transitive dependency overrides so security audit checks pass again on the branch

#### Improve extension config resilience and harden git command safety.

- add a shared JSON config loader utility for extension configs that falls back cleanly on missing or invalid files and can forward normalization warnings
- migrate adaptive-routing config loading to the shared helper and surface warnings for malformed config files and invalid top-level sections
- teach `git-guard` to block git bash commands that are likely to open interactive editors in agent environments (for example `git rebase --continue` without non-interactive editor overrides)

#### Avoid `bash` tool conflicts between `@ifi/pi-bash-live-view` and `@ifi/pi-pretty`.

Both extensions were registering a tool named `bash`, which made them conflict when loaded together via `pnpm pi:local`. They now expose explicit alternative tools instead:

- `bash_live_view` for PTY-backed terminal rendering
- `bash_pretty` for formatted command output summaries

The built-in `bash` tool is left untouched, and regression tests now verify these extensions can be loaded together without duplicate tool registrations.

#### Fix tool name conflict between bg-process and background-tasks extensions.

The bg-process extension in the extensions package re-exports the same extension from @ifi/pi-background-tasks, causing "Tool bash conflicts with bg-process" errors. Replaced the redundant bg-process.ts entry in the root pi.extensions config with a direct reference to the background-tasks package, eliminating the double-loading conflict.

#### Remove auto-backgrounding from the `bash` tool override in `@ifi/pi-background-tasks`.

The extension no longer intercepts ordinary `bash` calls to promote them into background tasks after a timeout. Instead, the `bash` tool passes through to pi's built-in execution flow so output stays visible in the foreground.

Background task management remains available through `bg_task`, `bg_status`, `/bg`, and `Ctrl+Shift+B` for commands that should explicitly run in the background (e.g. dev servers, file watchers, log tails).

#### Remove conflicting `bash` passthrough tool from `@ifi/pi-background-tasks`.

The background-tasks extension was incorrectly registering a `bash` tool as a thin passthrough, which conflicted with the actual `bash` tool registered by other extensions like `@ifi/pi-bash-live-view` and `@ifi/pi-pretty`. The background tasks package should only register `bg_task` and `bg_status` tools.

Also updates the runtime benchmark test to gracefully handle filtered extension sets (`OH_PI_BENCH_EXTENSION_FILTER`) so it no longer fails when only a subset of extensions is benchmarked.

#### fix(extensions): guard `ctx.model` getter in compact-header and custom-footer render paths

The `ctx.model` getter throws when the underlying ExtensionRunner is no longer active (e.g. during session shutdown). Both `compact-header.ts` and `custom-footer.ts` access `ctx.model` inside TUI `render` callbacks that may fire asynchronously after the session ends. Wrapping those accesses in try/catch prevents the crash.

#### Fix PTY-backed `!` commands when `node-pty` installs its prebuilt `spawn-helper` without executable permissions.

The bash live-view extension now checks the active `node-pty/prebuilds/<platform>-<arch>/spawn-helper` path as well as the legacy `build/Release` path and chmods the helper before launching PTY sessions.

#### Fix Ollama cloud models showing stale data after refresh and surface discovery errors

The `/ollama:refresh-models` command and `/ollama:status` display always read cloud models from the stored OAuth credential when one exists, even after a successful discovery that updated the runtime state. This meant newly available models (like kimi-k2.6) would not appear until the credential was re-stored, and the "last refreshed" timestamp shown in status was the credential's `lastModelRefresh` — often hours or days stale.

Changes:

- Cloud model display now prefers the runtime discovery state (`cloudEnvDiscoveryState.models`) over the stored credential. The credential models are only used as fallback when the runtime state is empty (e.g. before first discovery).
- The "last refreshed" age shown in status now uses `cloudEnvDiscoveryState.lastRefresh` (always set to `Date.now()` during refresh) instead of the credential's `lastModelRefresh`.
- Discovery errors are now surfaced in `/ollama:refresh-models`, `/ollama:status`, and `/ollama-cloud status` output, making it obvious when the cloud catalog couldn't be reached instead of silently falling back to stale data.

#### Fix Ollama cloud models not appearing in /scoped-models after refresh

The `modifyModels` OAuth callback in `createOllamaCloudOAuthProvider` always used `getCredentialModels(credentials)` — the stale models stored with the login credential — over the freshly discovered runtime state. This meant that even after `/ollama:refresh-models` successfully re-discovered all models, the model registry (used by `/scoped-models`) would overwrite them with the old credential models on the next registry refresh.

Now `modifyModels` prefers `cloudEnvDiscoveryState.models` (the runtime discovery state that is always updated during refresh) and only falls back to credential models when the runtime state is empty (e.g. before first discovery).

#### Fix stale ExtensionAPI crash in provider catalog after session replacement.

The `@mariozechner/pi-coding-agent` extension loader invalidates the `ExtensionAPI` instance (`pi`) after a session reload or replacement. The provider catalog extension was calling `pi.registerProvider()` from `session_start` handlers and command handlers that captured the original `pi`, which threw:

"This extension instance is stale after session replacement or reload."

All `registerProvider` calls in event and command handlers now use the fresh `ctx.modelRegistry` passed to each handler instead. `bootstrapProviders` still uses the initial `pi` (which is valid at extension load time).

#### Prevent the shared QnA TUI used by `/answers` from rendering lines wider than the terminal when selected answer text is long in narrow terminals.

Keep the pi-bash-live-view package build from enforcing standalone coverage thresholds during the normal build test step.

#### Fix two sources of typing lag in long-running pi sessions:

1. **Scheduler idle heartbeat**: The scheduler previously started a 1-second heartbeat interval on every `session_start`, even when no tasks were scheduled. Over time this added unnecessary event-loop wake-ups and disk I/O. It now lazily starts the heartbeat only when the first task is added, and stops it when the last task is removed.

2. **Compact-header per-render catalog scan**: The compact header rebuilt the full prompt/skill command list on every render (which fires on every keystroke). The catalog is now computed once at header mount and reused across renders.

This also tightens the runtime-churn benchmark so the isolated scheduler scenario must show exactly zero widget, footer, status, and notification churn when no tasks exist.

#### Fix worktree tool renderCall/renderResult returning strings instead of Widget instances

The worktree tool's `renderCall` and `renderResult` returned plain strings instead of TUI `Widget` instances. `Box.render` calls `child.render()` on every child, so a bare string caused `TypeError: child.render is not a function`.

#### Fix subagent project agent discovery to cascade through parent workspaces.

Subagent agent and chain discovery now loads project-scoped definitions from every ancestor project agents directory, with the nearest project definition winning on name collisions while still keeping parent-only entries available.

#### Fix subagent routing to prefer the current session model before delegated adaptive routing.

Subagents without an explicit runtime or frontmatter model now inherit the active session model when it is available, instead of silently switching providers through delegated category routing.

#### Fix subagent skill resolution against the task cwd for sync and async runs.

Explicit skills now resolve relative to the subagent task directory instead of the runtime/session cwd, so delegated runs can find project-local skills and inject the expected skill content. CLI resource lookups now also fall back to the shared-qna workspace source when the package is not linked into the hoisted root node_modules tree.

#### Prevent Ollama extension startup crashes when auth storage is not ready yet.

- guard `authStorage.get` and `authStorage.set` calls with safe wrappers
- make cloud-model refresh on `session_start` best-effort to avoid aborting extension initialization
- add smoke coverage for `session_start` with throwing auth storage access

#### Improve Ollama Cloud startup behavior and response reliability.

- register `streamSimple` for the `ollama-cloud` provider explicitly
- refresh cloud models on `session_start` using stored OAuth credentials when present
- update runtime cloud discovery state from credential-backed model catalogs so scoped model matching is stable
- add smoke coverage that validates `ollama-cloud` registers a stream handler

#### Align Ollama cloud GLM models with the z.ai request semantics used upstream.

- normalize cloud `glm-*` models to use z.ai-compatible thinking flags and `tool_stream`
- raise cloud GLM max token defaults so the provider can keep a 32k default output budget
- add regression coverage for GLM request shaping and visible streamed text

#### Fix Ollama startup and request routing so cloud models can be selected and answered reliably.

- seed fallback Ollama cloud models immediately so startup model scoping can resolve known cloud IDs before async refresh finishes
- route Ollama `openai-completions` requests by `model.provider` instead of assuming one handler per provider registration
- keep non-Ollama `openai-completions` models on pi's built-in OpenAI-compatible stream path
- add regression coverage for both startup fallback models and cloud dispatch when the local provider registers last

#### Refresh Ollama Cloud models during startup so newly released cloud models can be registered before model scope resolution.

- Prime the cloud provider from the live `/v1/models` catalog before registration, with a bounded timeout and fallback behavior.
- Persist discovered cloud models to a local startup cache so later offline starts can still resolve recently discovered models.
- Keep the static fallback catalog as a resilient baseline instead of requiring every new cloud model to be added manually.

#### Improve session resume guidance for long-running instances.

- extend `auto-session-name` to emit resume command hints on both `session_switch` and `session_shutdown`
- include both the direct form (`pi --session <id>`) and an alias-path hint (`pi resume <id>`) in the emitted message
- keep the existing compaction auto-continue and dynamic session title behavior intact

#### Improve error reporting and robustness for ant colony and subagent swarms.

**Ant Colony:**

- Fix nest lock file crash (`ENOENT`) when colony storage directory is cleaned up mid-run — the lock now recreates the directory instead of crashing
- Expand error messages from 80–120 chars to 200–500+ chars across queen, spawner, index, and ui
- Include full stack traces in colony crash reports and task failure records
- Surface task failures via `emitSignal` so they appear in the TUI instead of being silently swallowed
- Include validation issues and scout intelligence in plan recovery failure messages
- Budget-exceeded messages now report how many tasks completed before the limit
- Failed tasks in `onAntDone` now include error context in the log entry
- Model resolution errors now include provider and model details
- Session dispose errors are logged instead of silently swallowed

**Subagent Swarms:**

- Add fallback error messages for subagent processes that exit non-zero with no stderr
- Capture `stderr` from `runPiStreaming` and include it in failure output
- Track `aborted` flag on results when tasks are killed via signal
- Count JSON parse errors instead of silently swallowing them
- Extend `detectSubagentError` to run on all results, not just exit-code-0
- Write failure result files when the runner process crashes, so the parent knows what happened
- Process spawn errors now capture the error message

#### Add scheduler support for completion-aware retries.

- extend `schedule_prompt add` with `continueUntilComplete`, `completionSignal`, `retryInterval`, and `maxAttempts`
- keep compatible tasks in an `awaiting_completion` state and evaluate completion on `agent_end` before deleting or rescheduling
- persist per-task completion settings and outcome snippets for better `/schedule` and tool observability

#### Improve long-running session continuity and resume ergonomics.

- update `auto-session-name` to refresh titles when conversation focus shifts instead of freezing on the first prompt
- auto-send a `continue` follow-up after compaction so manual and automatic compaction flows continue working without extra input
- emit a shutdown message with a resumable session id hint (`pi --session <id>`) to make resume flows faster

#### Harden tool result rendering against oversized or malformed text output.

- sanitize tool-result text blocks before metadata rendering
- split extremely long single lines into bounded chunks to avoid recursive line-wrap overflows
- cap total rendered text size/line count and strip NUL bytes before UI fallback rendering
- attach `outputGuard` details when truncation is applied

#### Further harden interactive tool-result rendering against pathological payloads.

- sanitize large string fields in tool-result `details` before renderer fallback paths consume them
- strip NUL bytes and bound nested details depth/field counts to avoid shell/text sanitizer crashes
- keep `outputGuard` metadata with a `detailsSanitized` flag when truncation is applied
- add tests covering oversized nested `details.stdout/stderr` payloads

## 0.4.4 (2026-04-02)

### Features

- show clickable PR link in custom footer (#79)
- add /status overlay command (#80)
- add `/status` command that opens an overlay showing model, session, context window, workspace, git branch, PR link, extension statuses, and safe-mode state.
- show the current PR as a clickable hyperlink in the custom footer when a PR is open for the current branch.

### Fixes

- gate specs/ dir fallback on non-git repos only (#74)
- support Windows by using shell mode for execFileSync (#76)
- add safe mode awareness, reduce tick frequency, and fix memory leaks (#78)
- fix `findPi()` on Windows by trying `pi.cmd` first and passing `shell: true` to `execFileSync` so the npm CMD shim is resolved correctly.
- Add safe mode awareness to the scheduler extension, reducing tick frequency and suppressing UI status updates when safe mode is active. Fix memory leak in dispatch timestamp tracking by replacing unbounded `shift()` pruning with a capped `splice()` approach and clearing timestamps on scheduler stop.
- standardize MDT documentation reuse on `pnpm mdt` across repo docs, scripts, and CI.

## 0.4.3 (2026-04-01)

### Fixes

- suppress watchdog and scheduler notification spam (#75)
- suppress repeated watchdog and scheduler notifications by capping toast alerts at 2 per session and persisting ongoing warnings in the status bar instead.

## 0.4.2 (2026-03-31)

### Features

- show workspace and prompt in review UI (#69)
- add clear-all review shortcut (#70)

### Fixes

- persist provider usage windows (#72)
- add a clear-all shortcut to the scheduler review UI so scheduled tasks can be removed directly from the task list.
- persist provider rate limit data so usage widgets and dashboards can keep showing the last known subscription windows when live provider probes are temporarily rate-limited.
- improve the scheduler review UI by showing the workspace in task listings and the full automated prompt when a scheduled task is selected.

## 0.4.1 (2026-03-30)

### Fixes

- avoid loading helper modules as extensions (#67)
- run all workspace package builds (#68)
- fix workspace builds to run every package build script, repair the spec worktree build config, and verify published extension entrypoints are explicit files.
- fix pi package extension manifests to list explicit entrypoint files so helper modules are not loaded as standalone extensions.

## 0.4.0 (2026-03-30)

### Breaking Changes

- clarify the supported minimum pi runtime baseline in package peer dependencies and repository docs.

### Features

- add MDT-powered documentation reuse (#66)

### Fixes

- reduce long-session runtime UI churn
- improve error reporting and robustness for ant colony and subagent swarms (#56)
- prevent scheduler startup prompt replay (#59)
- isolate scheduled tasks by instance
- add shared pi agent-dir and mirrored storage path utilities to `@ifi/oh-pi-core` for consistent config and storage path resolution.
- add a shared extension runtime smoke-test harness and initial smoke coverage for scheduler/btw, ant-colony, and subagents.
- add MDT-based documentation reuse, CI verification, and synchronized API docs for shared package helpers.
- add missing package-level READMEs for published packages so npm and pi.dev package pages have package-specific documentation.
- add repository, homepage, and bugs metadata to published package manifests so npm package pages link back to the correct monorepo locations.
- add a small CI compatibility matrix that smoke-tests oh-pi extensions against the minimum supported pi baseline and a current upstream runtime.
- align root build and CI publish validation with the actual compiled and published package set, including web packages and pack dry-run checks.
- centralize pi-tui fallback resolution behind a shared loader used by shared-qna and plan runtime modules.
- document non-interactive git and GitHub CLI guidance for agent-run workflows
- document the scheduler instance-vs-workspace ownership model and the new adopt/release controls in the extensions README.
- exclude compiled test artifacts from published tarballs for compiled packages and add a CI guard to catch regressions.
- expand runtime smoke coverage for usage-tracker, auto-update, safe-guard, and spec extension registration flows.
- reduce long-session input lag by avoiding footer rescans, adding a performance watchdog, and introducing a safe mode command that suppresses nonessential UI chrome when the session gets sluggish.
- prevent scheduled prompts from being auto-run in newly opened pi instances for the same workspace by adding instance ownership, workspace-scoped opt-in tasks, scheduler leasing, takeover prompts, and explicit adopt/release/clear-foreign controls.
- fix scheduler startup replay by restoring overdue persisted tasks for manual review instead of auto-running them in a new session
- migrate hardcoded pi agent-dir paths in CLI and extensions to shared resolver utilities so custom `PI_CODING_AGENT_DIR` setups behave consistently.
- reduce remaining moderate production audit findings by overriding patched transitive dependency versions.
- refactor the root AGENTS.md into a progressive-disclosure layout with focused agent rule documents for engineering, packaging and release, and git/PR workflow guidance.
- refactor the scheduler extension into shared constants/types, parsing helpers, and registration modules without changing user-facing behavior.
- refactor the subagents extension by splitting bootstrap/config helpers, async runtime monitoring, and slash-command registration into focused modules.
- refactor the usage tracker by splitting shared types, formatting helpers, and provider probe logic into focused modules.

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

Supports `--version <ver>` to pin a specific version, `--local` for project-scoped installs, and `--remove` to uninstall all oh-pi packages from pi.

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

- publish a new `@ifi/pi-spec` package that registers a single `/spec` command with status, init, constitution, specify, clarify, checklist, plan, tasks, analyze, implement, list, and next flows
- vendor spec-kit-inspired workflow templates into the package and scaffold them into `.specify/` for per-repository customization
- implement native repo detection, feature numbering, branch naming, git branch creation, checklist summaries, and prompt handoff entirely in TypeScript
- add comprehensive Vitest coverage for workspace helpers, scaffold creation, prompt generation, and command behavior
- integrate the new package into the oh-pi installer, CLI resource copying, extension registry, and repo documentation

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

Pi loads each package with its own module root, so extensions nested inside a meta-package's `node_modules/` cannot resolve peer-dep imports (`@mariozechner/pi-coding-agent`, etc.). This caused commands like `/colony` and `/loop` to silently fail to register.

Each sub-package (`@ifi/oh-pi-extensions`, `@ifi/oh-pi-ant-colony`, etc.) is already a fully self-contained pi package with its own `pi` field. Users should install them directly via `pi install npm:@ifi/oh-pi-<name>` so pi can load extensions with correct module resolution.

The `@ifi/oh-pi` npm package remains as a convenience dependency that pulls all sub-packages, but no longer declares pi resources itself.

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
- Added `createUsageLimitsTracker()` to safely query usage-tracker limits with support for both `on/emit/off` and `on/emit` event buses.
- Prevents `TypeError: opts.eventBus.off is not a function` during colony runs.
- Added regression tests for event buses with and without `off()`.

## 0.2.7 (2026-03-08)

### Features

- support multiple concurrent ant colonies

#### Support multiple concurrent colonies

The ant colony extension now supports running multiple colonies simultaneously. Each colony gets a short ID (`c1`, `c2`, ...) shown in all status output, signals, and the details panel.

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

The ant colony can now be launched directly with `/colony <goal>` instead of relying solely on the LLM-callable `ant_colony` tool. The command appears in autocomplete alongside `/colony-status`, `/colony-stop`, and `/colony-resume`.

Usage: `/colony refactor the auth module to use JWT tokens`

## 0.2.5 (2026-03-08)

### Fixes

- ANSI-aware truncation for usage dashboard overlay

#### Fix usage dashboard truncation cutting through ANSI escape codes

The `/usage` overlay and `Ctrl+U` dashboard now use ANSI-aware line truncation. Previously, lines were sliced by raw string length which could cut through ANSI escape sequences mid-code, causing garbled colors and broken terminal rendering.

The new `truncateAnsi()` helper walks the string character by character, skipping ANSI sequences when counting visible width, and appends a reset (`\x1b[0m`) if the line is trimmed inside a styled region.

## 0.2.4 (2026-03-08)

### Features

- rewrite configuration wizard UX
- monorepo restructure under @ifi/\* scope
- detailed changesets, markdown formatting, knope publish workflow
- usage-aware budget planner for ant colony
- auto-unbind deleteToLineStart from ctrl+u on extension load

#### Usage-aware budget planner for ant colony

The ant colony now queries the usage-tracker extension for real-time provider rate limits (Claude session/weekly %, Codex 5h/weekly %) and session cost data to intelligently allocate resources across scout, worker, and soldier castes.

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

`Ctrl+U` is kept as the usage dashboard shortcut. The extension now auto-configures `~/.pi/agent/keybindings.json` on first load to unbind `deleteToLineStart` from `ctrl+u`, eliminating the conflict warning without requiring manual user configuration.

### Fixes

- CI builds core before typecheck and tests
- remove composite/references, use plain tsgo resolution
- rename npm scope from @ifi to @ifiokjr
- revert npm scope back to @ifi
- revert usage-tracker shortcut to ctrl+u

## 0.2.3 (2026-03-08)

### Features

- rewrite configuration wizard UX
- monorepo restructure under @ifi/\* scope
- detailed changesets, markdown formatting, knope publish workflow

### Fixes

- CI builds core before typecheck and tests
- remove composite/references, use plain tsgo resolution
- rename npm scope from @ifi to @ifiokjr
- revert npm scope back to @ifi

#### Reverted npm scope back to `@ifi`

The scope was incorrectly changed to `@ifiokjr` due to a misdiagnosed npm auth issue. The real problem was token permissions, not the scope name. All packages are back to `@ifi/*`.

## 0.2.2 (2026-03-08)

### Features

- rewrite configuration wizard UX
- monorepo restructure under @ifi/\* scope
- detailed changesets, markdown formatting, knope publish workflow

### Fixes

- CI builds core before typecheck and tests
- remove composite/references, use plain tsgo resolution
- rename npm scope from @ifi to @ifiokjr

#### Renamed npm scope from `@ifi` to `@ifiokjr`

The `@ifi` scope didn't exist as an npm organization. All packages are now published under `@ifi/*` which matches the npm username and works without org setup.

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
- monorepo restructure under @ifi/\* scope
- detailed changesets, markdown formatting, knope publish workflow

#### `@ifi/oh-pi-agents` — Initial release

5 AGENTS.md templates providing role-specific AI guidelines.

- **General Developer** — Universal coding guidelines covering code style, testing, documentation, and PR etiquette
- **Full-Stack Developer** — Frontend, backend, and database conventions with framework-specific guidance
- **Security Researcher** — Penetration testing, vulnerability assessment, and OWASP audit methodology
- **Data & AI Engineer** — MLOps pipelines, data processing, model training, and experiment tracking
- **Colony Operator** — Multi-agent orchestration guidelines for the ant-colony swarm system

Each template is a markdown file placed at `~/.pi/agent/AGENTS.md` to guide the AI's behavior.

#### `@ifi/oh-pi-ant-colony` — Initial release

Multi-agent swarm extension modeled after real ant ecology.

- **Colony lifecycle**: SCOUTING → PLANNING_RECOVERY → WORKING → REVIEWING → DONE with automatic phase transitions
- **Three ant castes**: Scouts (fast/cheap models for exploration), Workers (capable models for code changes), Soldiers (thorough models for review)
- **In-process agents**: Each ant is an `AgentSession` via pi SDK — zero startup overhead, shared auth and model registry
- **Pheromone communication**: `.ant-colony/pheromone.jsonl` shared discovery log with 10-minute half-life decay
- **Adaptive concurrency**: Auto-tunes parallelism based on throughput, CPU load (>85% reduction), and 429 rate limit backoff (2s→5s→10s cap)
- **File locking**: One ant per file — conflicting tasks are blocked and resume when locks release
- **Planning recovery**: When scouts return unstructured intel, colony enters `planning_recovery` instead of failing
- **Plan validation gate**: Tasks are validated (title/description/caste/priority) before workers start
- **Scout quorum**: Multi-step goals default to ≥2 scouts for better planning reliability
- **Real-time UI**: Status bar with task progress, active ants, tool calls, cost; `Ctrl+Shift+A` overlay panel; `/colony-stop` abort command
- **Signal protocol**: Structured `COLONY_SIGNAL:*` messages pushed to main conversation (LAUNCHED, SCOUTING, WORKING, REVIEWING, COMPLETE, FAILED, BUDGET_EXCEEDED)
- **Turn budgets**: Scout: 8, Worker: 15, Soldier: 8 — prevents runaway execution
- **Auto-trigger**: LLM deploys colony when ≥3 files need changes or parallel workstreams are possible

#### `@ifi/oh-pi-cli` — Initial release

Interactive TUI configurator that sets up `~/.pi/agent/` in under a minute.

- **Three setup modes**: Quick (3 steps), Preset (2 steps), Custom (6 steps) — each tailored to different experience levels
- **Provider auto-detection**: Scans environment variables for API keys from 7 providers (Anthropic, OpenAI, Google Gemini, Groq, OpenRouter, xAI, Mistral) and pre-fills configuration
- **TUI components**: Built on `@clack/prompts` with styled selection menus for providers, extensions, themes, keybindings, skills, and AGENTS.md templates
- **File writers**: Generates `auth.json` (0600 permissions), `settings.json`, `keybindings.json`, `AGENTS.md`, and copies extension/theme/prompt/skill files into `~/.pi/agent/`
- **Backup detection**: Warns when existing configuration exists and offers timestamped backup before overwriting
- **Binary entry point**: Ships as `oh-pi` CLI via `npx @ifi/oh-pi-cli`

#### `@ifi/oh-pi-core` — Initial release

Shared foundation library for all oh-pi packages.

- **Type system**: Full TypeScript type definitions for `OhPConfig`, `ProviderConfig`, `WizardBaseConfig`, `Preset`, and all extension/theme/skill/prompt registries
- **Extension registry**: Declarative `EXTENSIONS` array with metadata (name, description, file path, default-on/off, category) for all 9 extensions including the new `usage-tracker`
- **Theme registry**: 6 theme definitions (oh-pi Dark, Cyberpunk, Nord, Catppuccin Mocha, Tokyo Night, Gruvbox Dark) with file paths and emoji indicators
- **Prompt registry**: 10 prompt template registrations (`/review`, `/fix`, `/explain`, `/refactor`, `/test`, `/commit`, `/pr`, `/security`, `/optimize`, `/document`)
- **Skill registry**: 10 skill definitions across tool, UI-design, and workflow categories
- **i18n module**: Bilingual (English/Chinese) translation system with locale detection and `t()` helper function
- **Preset system**: Pre-configured profiles (Full Power, Clean, Colony Only) mapping to curated extension/theme/thinking-level combinations

#### `@ifi/oh-pi-extensions` — Initial release

9 pi extensions that hook into the pi SDK event system.

- **safe-guard** (default: on) — Intercepts destructive commands (`rm -rf`, `git push --force`, `DROP TABLE`, `chmod 777`) and protected path writes. Prompts for confirmation or blocks outright via `tool_call` event hooks
- **git-guard** (default: on) — Auto-creates `git stash` checkpoints on session start when repo is dirty. Tracks changed files from write/edit tool results
- **auto-session-name** (default: on) — Extracts a short title from the first user message on `turn_end` and calls `pi.setSessionName()`
- **custom-footer** (default: on) — Rich status bar showing model, input/output tokens, cost, context %, elapsed time, working directory, and git branch. Auto-refreshes every 30 seconds
- **compact-header** (default: on) — Dense one-liner startup header replacing the verbose default
- **auto-update** (default: on) — Async npm version check on `session_start` via `pi.exec()` with semver comparison and upgrade notification
- **bg-process** (default: off) — Overrides the built-in `bash` tool to auto-background commands exceeding 10 seconds. Provides `bg_status` tool for listing, viewing logs, and stopping background processes
- **usage-tracker** (default: off) — CodexBar-inspired rate limit and cost monitor. Probes `claude` and `codex` CLIs for provider-level quota percentages and reset countdowns. Live widget, `/usage` overlay with `Ctrl+U`, `/usage-toggle`, `/usage-refresh` commands, and LLM-callable `usage_report` tool. Tracks per-model token usage with cost threshold alerts at $0.50/$1/$2/$5/$10/$25/$50

#### Infrastructure and tooling

- **Monorepo**: pnpm workspace with 9 packages under `@ifi/*` npm scope
- **Biome**: Strict linting and formatting (tabs, 120 char width, double quotes, organized imports)
- **tsgo**: `@typescript/native-preview` (official TypeScript 7.0 Go port) for fast type checking
- **GitHub Actions CI**: lint → typecheck → test (Node 20 + 22) → build pipeline with changeset enforcement on PRs
- **Knope**: Automated changelog generation, version bumping (lockstep across all packages), git tagging, and GitHub releases
- **Vitest**: 254 tests across 21 test files with fake timers for fast execution
- **All documentation translated to English**: 8 main docs, supplementary docs, benchmarks, ant-colony README, and 16+ source file comments

#### `@ifi/oh-pi` — Initial release

Meta-package that bundles all oh-pi packages for one-command installation.

- **Single install**: `pi install npm:@ifi/oh-pi` adds all extensions, themes, prompts, skills, and agents templates
- **Bundled dependencies**: All sub-packages are listed as `bundledDependencies` so pi gets everything in one `npm install`
- **Pi package manifest**: Declares extension, theme, prompt, and skill paths via the `pi` field so pi auto-discovers all resources
- **Transitive packages**: Pulls in `@ifi/oh-pi-extensions`, `@ifi/oh-pi-ant-colony`, `@ifi/oh-pi-themes`, `@ifi/oh-pi-prompts`, `@ifi/oh-pi-skills`, and `@ifi/oh-pi-agents`

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

Each template is a markdown file that pi loads as a slash command. Install via `pi install npm:@ifi/oh-pi-prompts`.

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

Each skill directory contains a `SKILL.md` manifest and supporting files. Install via `pi install npm:@ifi/oh-pi-skills`.

#### `@ifi/oh-pi-themes` — Initial release

6 color themes for pi's terminal UI.

- **oh-pi Dark** — Cyan and purple with high contrast, the signature oh-pi look
- **Cyberpunk** — Neon magenta and electric cyan for a futuristic aesthetic
- **Nord** — Arctic blue palette based on the Nord color system
- **Catppuccin Mocha** — Pastel tones on a dark background from the Catppuccin palette
- **Tokyo Night** — Blue and purple twilight hues inspired by Tokyo at night
- **Gruvbox Dark** — Warm retro tones from the classic Gruvbox color scheme

All themes are JSON files compatible with pi's `settings.json` theme configuration. Install via `pi install npm:@ifi/oh-pi-themes`.

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
