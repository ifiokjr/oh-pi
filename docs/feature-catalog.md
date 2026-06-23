# monopi Feature Catalog

A package-by-package inventory of the features currently shipped in this repo.

This document is the long-form companion to the root [README](../README.md). Use it when you want one place that answers:

- what `npx @monopi/monopi` installs by default
- which features are opt-in add-ons
- which commands, tools, shortcuts, and workflows each package adds
- which content packs ship in the repo
- which packages are mainly contributor-facing libraries

<!-- {=repoStartHerePathDocs} -->

Use this reading path depending on what you are trying to do:

- **I just want to use monopi** → start in the root `README.md`, then jump into `docs/feature-catalog.md` for package-by-package detail
- **I want to try the latest local changes** → run `pnpm install`, `pnpm pi:local`, restart `pi`, then exercise the feature in a real session
- **I want to contribute** → read `CONTRIBUTING.md`, then the package README for the area you are changing
- **I want to understand ownership** → use `docs/feature-catalog.md` to see which package owns which runtime feature, content pack, or library surface

<!-- {/repoStartHerePathDocs} -->

### Architecture at a glance

<!-- {=repoArchitectureAtAGlanceDocs} -->

```text
monopi repo
├── installer
│   └── @monopi/monopi
├── default runtime packages
│   ├── extensions
│   ├── background-tasks
│   ├── diagnostics
│   ├── subagents
│   └── web-remote
├── content packs
│   ├── themes
│   ├── skills
│   └── agents
├── opt-in extras
│   ├── adaptive-routing
│   ├── provider-catalog
│   ├── provider-cursor
│   ├── provider-ollama
│   ├── analytics-extension
│   ├── pi-remote-tailscale
│   ├── pi-bash-live-view
│   └── pi-pretty
└── contributor libraries
    ├── core
    ├── cli
    ├── shared-qna
    ├── web-client
    ├── web-server
    ├── db
    ├── analytics-db
    ├── analytics-dashboard
    └── docs
```

<!-- {/repoArchitectureAtAGlanceDocs} -->

<!-- {=repoContributorReadingPathDocs} -->

Suggested path for a new contributor:

1. skim the root `README.md` for the package map and the local dev loop
2. read `docs/feature-catalog.md` to understand which package owns which feature
3. run `pnpm install` and `pnpm pi:local`
4. restart `pi` and exercise the feature in a real session
5. open the package README for the area you are changing, then run the relevant build/test commands

<!-- {/repoContributorReadingPathDocs} -->

## Install tiers at a glance

### Installed by `npx @monopi/monopi`

<!-- {=repoDefaultInstallerPackagesDocs} -->

Default runtime/content packages installed by `npx @monopi/monopi`:

- `@monopi/extension-worktree`
- `@monopi/background-tasks`
- `@monopi/diagnostics`
- `@monopi/subagents`
- `@monopi/web-remote`
- `@monopi/skills`

<!-- {/repoDefaultInstallerPackagesDocs} -->

### Opt-in packages

<!-- {=repoExperimentalPackagesDocs} -->

Opt-in packages that stay separate from the default installer bundle:

- `@monopi/extension-bg-process`
- `@monopi/adaptive-routing`
- `@monopi/provider-catalog`
- `@monopi/provider-cursor`
- `@monopi/provider-ollama`
- `@monopi/analytics-extension`
- `@monopi/remote-tailscale`
- `@monopi/bash-live-view`
- `@monopi/pretty`

<!-- {/repoExperimentalPackagesDocs} -->

### Contributor-facing/internal packages

These are important parts of the codebase, but they are primarily consumed by other packages or by people extending monopi:

<!-- {=repoContributorCompiledPackagesDocs} -->

Most runtime packages in this repo ship raw TypeScript and can be loaded directly by pi. A smaller set of contributor-facing packages (`core`, `cli`, `db`, `web-client`, `web-server`) emit `dist/` output, so build those when you are working on them directly.

<!-- {/repoContributorCompiledPackagesDocs} -->

- [`@monopi/cli`](../packages/monopi__cli)
- [`@monopi/core`](../packages/monopi__core)
- [`@monopi/shared-qna`](../packages/monopi__shared-qna)
- [`@monopi/web-client`](../packages/monopi__web-client)
- [`@monopi/web-server`](../packages/monopi__web-server)
- [`@monopi/agents`](../packages/monopi__agents)

## Runtime feature map

| Package                                                                  | Installs by default | Primary surfaces                                                                        | What it gives you                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [`@monopi/extension-worktree`](../packages/monopi__extension-worktree)   | Yes                 | commands, tools, widgets, footer, tool interception                                     | The core QoL extension pack: git safety, session naming, status UI, scheduling, usage, watchdog, worktrees, side-conversations, and more |
| [`@monopi/background-tasks`](../packages/monopi__background-tasks)       | Yes                 | `bg_task`, `bg_status`, `/bg`, `Ctrl+Shift+B`                                           | Reactive background shell task management with log tails, watches, wakeups, and a richer tracked-task model                              |
| [`@monopi/diagnostics`](../packages/monopi__diagnostics)                 | Yes                 | widget, session messages, `/diagnostics`, `Ctrl+Shift+D`                                | Prompt start/end timestamps, total duration, and per-turn timing                                                                         |
| [`@monopi/subagents`](../packages/monopi__subagents)                     | Yes                 | `subagent`, `subagent_status`, `/run`, `/chain`, `/parallel`, `/agents`, `Ctrl+Shift+A` | Rich delegated execution with built-in agents, reusable chains, background runs, and a TUI manager                                       |
| [`@monopi/web-remote`](../packages/monopi__web-remote)                   | Yes                 | `/remote`                                                                               | Share the current pi session through a remote web UI                                                                                     |
| [`@monopi/adaptive-routing`](../packages/monopi__adaptive-routing)       | No                  | `/route*`                                                                               | Adaptive/shadow routing and delegated startup categories for colonies and subagents                                                      |
| [`@monopi/provider-catalog`](../packages/monopi__provider-catalog)       | No                  | `/providers*`                                                                           | Multi-provider catalog and lazy API-key login backed by `models.dev`                                                                     |
| [`@monopi/provider-cursor`](../packages/monopi__provider-cursor)         | No                  | `/login cursor`, `/cursor*`                                                             | Experimental Cursor OAuth provider with model discovery and direct AgentService streaming                                                |
| [`@monopi/provider-ollama`](../packages/monopi__provider-ollama)         | No                  | `/login ollama-cloud`, `/ollama*`, `/model`                                             | Experimental Ollama local + cloud provider integration                                                                                   |
| [`@monopi/analytics-extension`](../packages/monopi__analytics-extension) | No                  | `/analytics`, `/analytics-dashboard`                                                    | Analytics tracking extension with SQLite persistence and browser dashboard                                                               |
| [`@monopi/remote-tailscale`](../packages/monopi__remote-tailscale)       | No                  | `/remote`, `/remote widget`, `/remote stop`                                             | Secure remote session sharing via Tailscale HTTPS with PTY, WebSocket, QR codes, and token auth                                          |
| [`@monopi/bash-live-view`](../packages/monopi__bash-live-view)           | No                  | `/bash-pty`, `bash_live_view` tool with `usePTY`                                        | PTY-backed live terminal viewing with real-time widget and `/xterm/headless` ANSI rendering                                              |
| [`@monopi/pretty`](../packages/monopi__pretty)                           | No                  | wrapped `read`, `bash_pretty`, `ls`, `find`, `grep` tools                               | Syntax highlighting via Shiki, Nerd Font icons, tree-view listings, colored bash summaries, FFF search                                   |

## `@monopi/extension-worktree`: split extension packages

This package is where most of the day-to-day ergonomics live.

### Included extensions

| Feature                  | Primary surfaces                                                                    | What it does                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `git-guard`              | automatic stash checkpoints, guarded git invocations                                | Reduces accidental code loss and blocks interactive git commands that would hang an agent session                                             |
| `custom-footer`          | live footer, `/status` overlay                                                      | Shows model, thinking level, token usage, cost, context %, cwd, branch, worktree state, and extension statuses                                |
| `compact-header`         | startup UI                                                                          | Replaces the default startup banner with a denser one-line header                                                                             |
| `tool-metadata`          | tool result details                                                                 | Adds start/end timestamps, duration, approximate I/O sizing, and context snapshots to tool results; also sanitizes huge outputs for UI safety |
| `external-editor`        | `/external-editor`, `Ctrl+Shift+E`                                                  | Opens the current draft in `$VISUAL` or `$EDITOR`, then syncs the saved text back into pi                                                     |
| `worktree`               | `/worktree`, `/worktree list`, `/worktree create`, `/worktree cleanup`              | Gives monopi first-class git worktree awareness and managed pi-owned worktrees under shared storage                                           |
| `bg-process`             | `bg_task`, `bg_status`, `/bg`, `Ctrl+Shift+B`                                       | Explicitly manages long-lived background tasks like watchers, servers, and log tails without auto-detaching ordinary bash commands            |
| `scheduler`              | `/remind`, `/loop`, `/schedule*`, `schedule_prompt` tool                            | Schedules one-time reminders and recurring follow-ups for builds, CI, deploys, PRs, and long-running checks                                   |
| `usage-tracker`          | widget, `/usage`, `/usage-toggle`, `/usage-refresh`, `Ctrl+Shift+U`, `usage_report` | Tracks provider quotas, rolling cost history, and per-model/session usage                                                                     |
| `btw` / `qq`             | `/btw*`, `/qq*`                                                                     | Runs side conversations in a widget above the editor, then injects the full thread or a summary back into the main agent                      |
| `watchdog` / `safe-mode` | `/watchdog*`, `/safe-mode`                                                          | Samples runtime health, records alerts, shows startup/blame dashboards, and can reduce UI churn when the session gets too heavy               |

### Scheduler details

The scheduler is one of the most important workflow additions because it turns pi into something that can check back later instead of requiring you to babysit every long-running task.

Key behaviors:

- one-time reminders with `/remind in 45m ...`
- recurring checks with `/loop 5m ...` or cron expressions
- shared `schedule_prompt` tool so the agent can set reminders or monitors for you
- instance-scoped tasks by default, with explicit workspace-scoped tasks for shared CI/build/deploy monitors
- adopt/release/clear-foreign flows so multiple pi instances do not silently fight over the same scheduler state
- persisted scheduler state under shared pi storage using a workspace-mirrored path
- `continueUntilComplete` support for retries until a completion signal is detected

### Usage tracker details

The usage tracker is designed to answer both quick and deep questions about cost and quota.

It provides:

- an always-visible widget above the editor
- a full dashboard overlay via `/usage`
- provider quota probes for Anthropic, OpenAI, and Google when pi-managed auth is available
- rolling 30-day persisted history so the view survives restarts
- session totals and per-model breakdowns
- agent-callable `usage_report` output for quota/cost questions

### Watchdog details

The watchdog focuses on keeping interactive pi sessions usable as more extensions and UI surfaces are loaded.

It includes:

- periodic CPU, memory, and event-loop sampling
- a config file under `~/.pi/agent/extensions/watchdog/config.json`
- capped alerting so the UI does not spam you when the system is already under stress
- startup breakdown reporting
- blame reporting to understand recent pressure
- safe-mode toggles to reduce nonessential UI churn when repeated alerts occur

## `@monopi/background-tasks`: reactive background shell tasks

This package turns explicit long-lived shell tasks into a first-class pi workflow while leaving ordinary `bash` commands in the foreground.

### Primary surfaces

- `bg_task`
- `bg_status`
- `/bg`
- `Ctrl+Shift+B`
- `/bg watch --follow <id>`

### What it adds beyond the older `bg-process` shim

- tracked tasks with stable ids in addition to PID-based compatibility status
- persistent log files for every spawned task
- reactive follow-ups so pi can wake itself up when watched tasks emit new output or exit
- richer manual management through `/bg` and the dashboard overlay
- compatibility with the old `bg_status` flow while offering a more capable `bg_task` tool for the agent

## `@monopi/diagnostics`: prompt timing

`@monopi/diagnostics` adds prompt-level completion timing on top of the lower-level tool timing that `tool-metadata` already records.

Primary surfaces:

- widget below the editor
- diagnostic session log entry after each prompt completes
- per-turn timing breakdown when a prompt took multiple assistant turns
- `/diagnostics [status|toggle|on|off]`
- `Ctrl+Shift+D`

Use it when you want to answer questions like:

- “When did this prompt actually start?”
- “Did the slowdown happen in one long turn or several short turns?”
- “How long did this full interaction take end-to-end?”

Subagents is the primary execution system for coordinating multiple AI agents.

### Major capabilities

- single-agent runs via `subagent` or `/run`
- sequential chains via `subagent.chain` or `/chain`
- parallel fan-out via `subagent.tasks` or `/parallel`
- reusable agent definitions stored as markdown with YAML frontmatter
- reusable `.chain.md` pipelines
- background execution with async status inspection
- built-in agents such as `scout`, `planner`, `worker`, `reviewer`, `context-builder`, `researcher`, `artist`, `frontend-designer`, and `multimodal-summariser`
- TUI-based create/edit/browse/run flows in the Agents Manager
- management actions for creating, updating, and deleting agents/chains
- project-scope agent storage in shared pi storage by default, with legacy repo-local mode available as an opt-in
- optional delegated routing categories via adaptive routing
- optional direct MCP tools when frontmatter explicitly asks for them

### Primary surfaces

- `subagent`
- `subagent_status`
- `/run <agent> <task>`
- `/chain ...`
- `/parallel ...`
- `/agents`
- `Ctrl+Shift+A`

### When to use subagents

Prefer subagents when you want:

- explicit named specialists
- reusable pipelines
- a controlled chain of reasoning between steps
- agent definitions you can version and tweak directly
- background execution that you can inspect as a single run

Plan mode turns planning into a first-class session state instead of an informal prompt style.

### What it adds

- `/plan` to enter/exit plan mode
- `Alt+P` shortcut
- persistent plan file handling per session
- branch-aware start location choices (`Empty branch` or `Current branch` when available)
- resume/start-fresh flows when a plan already exists
- an active plan banner while plan mode is enabled
- end-of-plan summary with the plan file path and preview

### Plan-only tools

While active, plan mode exposes tools that are not available the rest of the time:

- `task_agents` — read-only delegated research tasks
- `steer_task_agent` — rerun a specific research task with extra guidance
- `request_user_input` — gather structured clarification from the user
- `set_plan` — overwrite the canonical plan file with the latest full plan

Plan mode is best when you want structured planning without jumping directly into implementation.

### Canonical `/spec` subcommands

- `status`
- `help`
- `init`
- `constitution`
- `specify`
- `clarify`
- `checklist`
- `plan`
- `tasks`
- `analyze`
- `implement`
- `list`
- `next`

### Filesystem contract

The public API is not just the command surface. It is also the file layout created in the repo:

- `.specify/` for reusable workflow state and editable templates
- `specs/###-feature-name/` for per-feature artifacts such as `spec.md`, `plan.md`, `tasks.md`, research notes, data models, quickstart notes, contracts, and checklists

### Why it matters

- requirements before implementation
- visible workflow state in git
- deterministic scaffolding
- project-owned templates you can customize after initialization
- a spec/plan/tasks flow that feels native inside pi instead of shell-script-driven

## `@monopi/web-remote`: remote session sharing

This package adds `/remote` so a pi session can be shared through a browser-oriented remote UI.

Primary actions:

- start remote access for the current session
- expose a connection URL or tunnel-backed URL
- inspect connection status
- stop remote sharing via `/remote stop`

This package sits on top of the lower-level `@monopi/web-server` and `@monopi/web-client` libraries.

## Optional routing and provider packages

### `@monopi/adaptive-routing`

Purpose:

- shadow-routing or auto-routing decisions for prompts
- delegated startup categories for subagents when no explicit model override is set
- telemetry and explainability around why a model/provider was picked

Primary commands:

- `/route status`
- `/route auto`
- `/route shadow`
- `/route off`
- `/route explain`
- `/route assignments`
- `/route why <category|role-override> [task text]`
- `/route stats`
- `/route lock`
- `/route unlock`
- `/route refresh`
- `/route feedback`

### `@monopi/provider-catalog`

Purpose:

- register a large catalog of API-key providers from OpenCode `models.dev`
- avoid dumping every possible provider into pi's global login picker up front
- let users lazily enable the ones they actually want

Primary commands:

- `/providers status`
- `/providers list [query]`
- `/providers login [provider]`
- `/providers info <provider>`
- `/providers models <provider>`
- `/providers refresh-models [provider|all]`

### `@monopi/provider-cursor`

Purpose:

- Cursor OAuth login from pi
- model discovery and refresh
- direct streaming from Cursor's AgentService transport
- continued tool-call bridging across pi tool rounds

Primary commands:

- `/login cursor`
- `/cursor status`
- `/cursor refresh-models`
- `/cursor clear-state`

### `@monopi/provider-ollama`

Purpose:

- local Ollama daemon discovery
- cloud Ollama login and catalog discovery
- model metadata, browsing, and pulling from inside pi

Primary commands:

- `/ollama status`
- `/ollama refresh-models`
- `/ollama models`
- `/ollama info <model>`
- `/ollama pull <model>`
- `/login ollama-cloud`

## Analytics stack

### `@monopi/analytics-extension`

Purpose:

- Tracks session-level and turn-level analytics (models, tokens, costs, codebases)
- Persists data to SQLite via `@monopi/analytics-db`
- Provides `/analytics` for quick terminal stats
- Provides `/analytics-dashboard` to open the browser dashboard

### `@monopi/analytics-db`

Purpose:

- SQLite database layer with Drizzle ORM schema
- Stores sessions, turns, models, providers, codebases, and time-bucketed aggregations
- Includes migrations and typed query helpers

### `@monopi/analytics-dashboard`

Purpose:

- React 19 + Vite 8 SPA for visualizing AI usage
- Pages: Overview, Models, Codebases, Insights (emotions, words, misspellings)
- Mock data mode for development, real API mode via Express server
- Private package — run `pnpm dev` inside `packages/monopi__analytics-dashboard/`

## Content packs

## `@monopi/skills`

The skills pack currently ships 3 maintained skills.

| Skill          | What it is for                                                 |
| -------------- | -------------------------------------------------------------- |
| `btw` (`/qq`)  | Use the `/btw` or `/qq` side-conversation workflow effectively |
| `debug-helper` | Analyze errors, logs, crashes, and performance issues          |
| `nushell`      | Nushell syntax reference for shell commands                    |

## `@monopi/agents`

The AGENTS template pack currently ships 5 templates.

| Template              | Focus                                                             |
| --------------------- | ----------------------------------------------------------------- |
| `general-developer`   | Safe default project guidelines for everyday development          |
| `fullstack-developer` | Full-stack application architecture, quality, and git conventions |
| `security-researcher` | Security testing/reporting workflow and ethics                    |
| `data-ai-engineer`    | Data pipelines, AI/ML reproducibility, and infra discipline       |

## Contributor-facing packages and libraries

| Package                                                                  | Role                                                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| [`@monopi/monopi`](../packages/monopi__monopi)                           | Meta-installer that registers the default bundle with pi                                               |
| [`@monopi/cli`](../packages/monopi__cli)                                 | Interactive setup/configuration TUI with provider/model/routing/package selection flows                |
| [`@monopi/core`](../packages/monopi__core)                               | Shared registries, icons, i18n helpers, and path helpers for the pi agent directory and shared storage |
| [`@monopi/shared-qna`](../packages/monopi__shared-qna)                   | Reusable TUI Q&A helpers and shared `pi-tui` loading logic                                             |
| [`@monopi/web-client`](../packages/monopi__web-client)                   | Platform-agnostic TypeScript client for custom remote session UIs                                      |
| [`@monopi/web-server`](../packages/monopi__web-server)                   | Embeddable HTTP + WebSocket remote session server                                                      |
| [`@monopi/analytics-db`](../packages/monopi__analytics-db)               | SQLite schema and Drizzle ORM client for analytics data                                                |
| [`@monopi/analytics-dashboard`](../packages/monopi__analytics-dashboard) | React dashboard for visualizing AI usage (private package)                                             |
| [`@monopi/docs`](../packages/monopi__docs)                               | Documentation site for monopi (private package)                                                        |

## Which feature should I reach for?

- **Safer day-to-day pi sessions** → `@monopi/extension-worktree`
- **Long-lived watchers, servers, and log tails** → `@monopi/background-tasks`
- **Timing and completion visibility** → `@monopi/diagnostics`
- **Large parallel work** → `@monopi/subagents` (chains, parallel fan-out)
- **Named specialists and reusable pipelines** → `@monopi/subagents`
- **Secure remote session sharing via Tailscale HTTPS with PTY/WebSocket** → `@monopi/remote-tailscale`
- **PTY-backed live terminal viewing with real-time ANSI widget** → `@monopi/bash-live-view`
- **Syntax highlighting, Nerd Font icons, tree-view listings, and colored output** → `@monopi/pretty`
- **Remote access from a browser UI** → `@monopi/web-remote`
- **Automatic or explainable model routing** → `@monopi/adaptive-routing`
- **Extra API-key providers** → `@monopi/provider-catalog`
- **Cursor integration** → `@monopi/provider-cursor`
- **Usage analytics and browser dashboard for your AI sessions** → `@monopi/analytics-extension`
- **Ollama local/cloud integration** → `@monopi/provider-ollama`

For the local development loop that points a real pi install at this checkout, see the root [README running locally section](../README.md#running-locally--local-development).
