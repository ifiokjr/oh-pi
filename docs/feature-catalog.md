# oh-pi Feature Catalog

A package-by-package inventory of the features currently shipped in this repo.

This document is the long-form companion to the root [README](../README.md). Use it when you want
one place that answers:

- what `npx @ifi/oh-pi` installs by default
- which features are opt-in add-ons
- which commands, tools, shortcuts, and workflows each package adds
- which content packs ship in the repo
- which packages are mainly contributor-facing libraries

<!-- {=repoStartHerePathDocs} -->

Use this reading path depending on what you are trying to do:

- **I just want to use oh-pi** → start in the root `README.md`, then jump into `docs/feature-catalog.md` for package-by-package detail
- **I want to try the latest local changes** → run `pnpm install`, `pnpm pi:local`, restart `pi`, then exercise the feature in a real session
- **I want to contribute** → read `CONTRIBUTING.md`, then the package README for the area you are changing
- **I want to understand ownership** → use `docs/feature-catalog.md` to see which package owns which runtime feature, content pack, or library surface

<!-- {/repoStartHerePathDocs} -->

### Architecture at a glance

<!-- {=repoArchitectureAtAGlanceDocs} -->

```text
oh-pi repo
├── installer
│   └── @ifi/oh-pi
├── default runtime packages
│   ├── extensions
│   ├── background-tasks
│   ├── diagnostics
│   ├── ant-colony
│   ├── subagents
│   ├── plan
│   ├── spec
│   └── web-remote
├── content packs
│   ├── themes
│   ├── prompts
│   ├── skills
│   └── agents
├── opt-in extras
│   ├── adaptive-routing
│   ├── provider-catalog
│   ├── provider-cursor
│   ├── provider-ollama
│   ├── pi-remote-tailscale
│   ├── pi-bash-live-view
│   └── pi-pretty
└── contributor libraries
    ├── core
    ├── cli
    ├── shared-qna
    ├── web-client
    └── web-server
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

### Installed by `npx @ifi/oh-pi`

<!-- {=repoDefaultInstallerPackagesDocs} -->

Default runtime/content packages installed by `npx @ifi/oh-pi`:

- `@ifi/oh-pi-extensions`
- `@ifi/pi-background-tasks`
- `@ifi/oh-pi-ant-colony`
- `@ifi/pi-diagnostics`
- `@ifi/pi-extension-subagents`
- `@ifi/pi-plan`
- `@ifi/pi-spec`
- `@ifi/pi-web-remote`
- `@ifi/oh-pi-themes`
- `@ifi/oh-pi-prompts`
- `@ifi/oh-pi-skills`

<!-- {/repoDefaultInstallerPackagesDocs} -->

### Opt-in packages

<!-- {=repoExperimentalPackagesDocs} -->

Opt-in packages that stay separate from the default installer bundle:

- `@ifi/pi-extension-adaptive-routing`
- `@ifi/pi-provider-catalog`
- `@ifi/pi-provider-cursor`
- `@ifi/pi-provider-ollama`
- `@ifi/pi-remote-tailscale`
- `@ifi/pi-bash-live-view`
- `@ifi/pi-pretty`

<!-- {/repoExperimentalPackagesDocs} -->

### Contributor-facing/internal packages

These are important parts of the codebase, but they are primarily consumed by other packages or by
people extending oh-pi:

<!-- {=repoContributorCompiledPackagesDocs} -->

Most runtime packages in this repo ship raw TypeScript and can be loaded directly by pi. A smaller
set of contributor-facing packages (`core`, `cli`, `web-client`, `web-server`) emit `dist/` output,
so build those when you are working on them directly.

<!-- {/repoContributorCompiledPackagesDocs} -->

- [`@ifi/oh-pi-cli`](../packages/cli)
- [`@ifi/oh-pi-core`](../packages/core)
- [`@ifi/pi-shared-qna`](../packages/shared-qna)
- [`@ifi/pi-web-client`](../packages/web-client)
- [`@ifi/pi-web-server`](../packages/web-server)
- [`@ifi/oh-pi-agents`](../packages/agents)

## Runtime feature map

| Package | Installs by default | Primary surfaces | What it gives you |
| --- | --- | --- | --- |
| [`@ifi/oh-pi-extensions`](../packages/extensions) | Yes | commands, tools, widgets, footer, tool interception | The core QoL extension pack: git safety, session naming, status UI, scheduling, usage, watchdog, worktrees, side-conversations, and more |
| [`@ifi/pi-background-tasks`](../packages/background-tasks) | Yes | `bg_task`, `bg_status`, `/bg`, `Ctrl+Shift+B` | Reactive background shell task management with log tails, watches, wakeups, and a richer tracked-task model |
| [`@ifi/pi-diagnostics`](../packages/diagnostics) | Yes | widget, session messages, `/diagnostics`, `Ctrl+Shift+D` | Prompt start/end timestamps, total duration, and per-turn timing |
| [`@ifi/oh-pi-ant-colony`](../packages/ant-colony) | Yes | `ant_colony` tool, `/colony*`, `Ctrl+Shift+A` | Multi-agent swarm with scouts/workers/soldiers, isolated worktrees, pheromones, adaptive concurrency, and review passes |
| [`@ifi/pi-extension-subagents`](../packages/subagents) | Yes | `subagent`, `subagent_status`, `/run`, `/chain`, `/parallel`, `/agents`, `Ctrl+Shift+A` | Rich delegated execution with built-in agents, reusable chains, background runs, and a TUI manager |
| [`@ifi/pi-plan`](../packages/plan) | Yes | `/plan`, `Alt+P`, plan-mode tools | Branch-aware planning workflow with persistent plan files and delegated research tasks |
| [`@ifi/pi-spec`](../packages/spec) | Yes | `/spec` and `spec:*` subcommands | Native spec-first workflow with deterministic `.specify/` and `specs/###-feature-name/` artifacts |
| [`@ifi/pi-web-remote`](../packages/web-remote) | Yes | `/remote` | Share the current pi session through a remote web UI |
| [`@ifi/pi-extension-adaptive-routing`](../packages/adaptive-routing) | No | `/route*` | Adaptive/shadow routing and delegated startup categories for colonies and subagents |
| [`@ifi/pi-provider-catalog`](../packages/providers) | No | `/providers*` | Multi-provider catalog and lazy API-key login backed by `models.dev` |
| [`@ifi/pi-provider-cursor`](../packages/cursor) | No | `/login cursor`, `/cursor*` | Experimental Cursor OAuth provider with model discovery and direct AgentService streaming |
| [`@ifi/pi-provider-ollama`](../packages/ollama) | No | `/login ollama-cloud`, `/ollama*`, `/model` | Experimental Ollama local + cloud provider integration |
| [`@ifi/pi-remote-tailscale`](../packages/pi-remote-tailscale) | No | `/remote`, `/remote:widget`, `/remote:stop` | Secure remote session sharing via Tailscale HTTPS with PTY, WebSocket, QR codes, and token auth |
| [`@ifi/pi-bash-live-view`](../packages/pi-bash-live-view) | No | `/bash-pty`, `bash` tool override with `usePTY` | PTY-backed live terminal viewing with real-time widget and `/xterm/headless` ANSI rendering |
| [`@ifi/pi-pretty`](../packages/pi-pretty) | No | wrapped `read`, `bash`, `ls`, `find`, `grep` tools | Syntax highlighting via Shiki, Nerd Font icons, tree-view listings, colored bash summaries, FFF search |

## `@ifi/oh-pi-extensions`: core extension pack

This package is where most of the day-to-day ergonomics live.

### Included extensions

| Feature | Primary surfaces | What it does |
| --- | --- | --- |
| `git-guard` | automatic stash checkpoints, guarded git invocations | Reduces accidental code loss and blocks interactive git commands that would hang an agent session |
| `auto-session-name` | automatic session titles, better compaction continuity | Names sessions from user intent, keeps titles fresh as focus changes, and emits clearer resume hints |
| `custom-footer` | live footer, `/status` overlay | Shows model, thinking level, token usage, cost, context %, cwd, branch, worktree state, and extension statuses |
| `compact-header` | startup UI | Replaces the default startup banner with a denser one-line header |
| `tool-metadata` | tool result details | Adds start/end timestamps, duration, approximate I/O sizing, and context snapshots to tool results; also sanitizes huge outputs for UI safety |
| `auto-update` | startup notification | Checks npm asynchronously and tells you when a newer oh-pi release is available |
| `external-editor` | `/external-editor`, `Ctrl+Shift+E` | Opens the current draft in `$VISUAL` or `$EDITOR`, then syncs the saved text back into pi |
| `worktree` | `/worktree`, `/worktree list`, `/worktree create`, `/worktree cleanup` | Gives oh-pi first-class git worktree awareness and managed pi-owned worktrees under shared storage |
| `bg-process` | `bash` override, `bg_status` tool | Automatically detaches long-running commands after a timeout and lets the agent inspect/stop them later |
| `scheduler` | `/remind`, `/loop`, `/schedule*`, `schedule_prompt` tool | Schedules one-time reminders and recurring follow-ups for builds, CI, deploys, PRs, and long-running checks |
| `usage-tracker` | widget, `/usage`, `/usage-toggle`, `/usage-refresh`, `Ctrl+U`, `usage_report` | Tracks provider quotas, rolling cost history, and per-model/session usage |
| `btw` / `qq` | `/btw*`, `/qq*` | Runs side conversations in a widget above the editor, then injects the full thread or a summary back into the main agent |
| `watchdog` / `safe-mode` | `/watchdog*`, `/safe-mode` | Samples runtime health, records alerts, shows startup/blame dashboards, and can reduce UI churn when the session gets too heavy |

### Scheduler details

The scheduler is one of the most important workflow additions because it turns pi into something that
can check back later instead of requiring you to babysit every long-running task.

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
- integration with ant-colony usage streams so colony cost is visible too

### Watchdog details

The watchdog focuses on keeping interactive pi sessions usable as more extensions and UI surfaces are
loaded.

It includes:

- periodic CPU, memory, and event-loop sampling
- a config file under `~/.pi/agent/extensions/watchdog/config.json`
- capped alerting so the UI does not spam you when the system is already under stress
- startup breakdown reporting
- blame reporting to understand recent pressure
- safe-mode toggles to reduce nonessential UI churn when repeated alerts occur

## `@ifi/pi-background-tasks`: reactive background shell tasks

This package promotes long-running shell commands from an implementation detail into a first-class pi workflow.

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

## `@ifi/pi-diagnostics`: prompt timing

`@ifi/pi-diagnostics` adds prompt-level completion timing on top of the lower-level tool timing that
`tool-metadata` already records.

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

## `@ifi/oh-pi-ant-colony`: autonomous swarm execution

Ant-colony is the flagship large-task execution feature.

### Core behaviors

- scout/worker/soldier castes with different responsibilities
- adaptive concurrency instead of a fixed worker count
- shared pheromone communication instead of direct ant-to-ant chat
- per-task file locking so conflicting edits do not happen simultaneously
- optional isolated git worktrees by default, with shared-cwd fallback
- resumable colony state under shared storage
- auto-triggering for large multi-file or parallelizable tasks
- streaming usage into the usage tracker
- delegated routing categories when adaptive routing is installed

### Primary surfaces

- `ant_colony` tool
- `/colony <goal>`
- `/colony-count`
- `/colony-status [id]`
- `/colony-stop [id|all]`
- `/colony-resume [colonyId]`
- `Ctrl+Shift+A` colony panel

### Best-fit use cases

Use ant-colony for:

- multi-file refactors
- migrations
- parallelizable test-writing sweeps
- coordinated review/rework loops
- large feature additions that benefit from scouting + implementation + review phases

## `@ifi/pi-extension-subagents`: delegated execution runtime

Subagents is the other major execution system, but it is more explicit and user-directed than
ant-colony.

### Major capabilities

- single-agent runs via `subagent` or `/run`
- sequential chains via `subagent.chain` or `/chain`
- parallel fan-out via `subagent.tasks` or `/parallel`
- reusable agent definitions stored as markdown with YAML frontmatter
- reusable `.chain.md` pipelines
- background execution with async status inspection
- built-in agents such as `scout`, `planner`, `worker`, `reviewer`, `researcher`, `artist`, and `frontend-designer`
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

### When to prefer subagents over ant-colony

Prefer subagents when you want:

- explicit named specialists
- reusable pipelines
- a controlled chain of reasoning between steps
- agent definitions you can version and tweak directly
- background execution that you can inspect as a single run

## `@ifi/pi-plan`: plan mode

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

## `@ifi/pi-spec`: native spec-first workflow

`@ifi/pi-spec` adapts spec-kit ideas to pi as a native TypeScript extension package.

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

Use `@ifi/pi-spec` when you want:

- requirements before implementation
- visible workflow state in git
- deterministic scaffolding
- project-owned templates you can customize after initialization
- a spec/plan/tasks flow that feels native inside pi instead of shell-script-driven

## `@ifi/pi-web-remote`: remote session sharing

This package adds `/remote` so a pi session can be shared through a browser-oriented remote UI.

Primary actions:

- start remote access for the current session
- expose a connection URL or tunnel-backed URL
- inspect connection status
- stop remote sharing via `/remote stop`

This package sits on top of the lower-level `@ifi/pi-web-server` and `@ifi/pi-web-client`
libraries.

## Optional routing and provider packages

### `@ifi/pi-extension-adaptive-routing`

Purpose:

- shadow-routing or auto-routing decisions for prompts
- delegated startup categories for subagents and ant-colony when no explicit model override is set
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

### `@ifi/pi-provider-catalog`

Purpose:

- register a large catalog of API-key providers from OpenCode `models.dev`
- avoid dumping every possible provider into pi's global login picker up front
- let users lazily enable the ones they actually want

Primary commands:

- `/providers:status`
- `/providers:list [query]`
- `/providers:login [provider]`
- `/providers:info <provider>`
- `/providers:models <provider>`
- `/providers:refresh-models [provider|all]`

### `@ifi/pi-provider-cursor`

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

### `@ifi/pi-provider-ollama`

Purpose:

- local Ollama daemon discovery
- cloud Ollama login and catalog discovery
- model metadata, browsing, and pulling from inside pi

Primary commands:

- `/ollama:status`
- `/ollama:refresh-models`
- `/ollama:models`
- `/ollama:info <model>`
- `/ollama:pull <model>`
- `/login ollama-cloud`

## Content packs

## `@ifi/oh-pi-prompts`

The prompt template pack ships 10 ready-made slash commands.

| Prompt | Purpose |
| --- | --- |
| `/review` | Review code for bugs, security issues, missing error handling, performance issues, and readability problems |
| `/fix` | Fix a bug with minimal changes and explain the root cause |
| `/explain` | Explain code or a concept from one-line summary through trade-offs and edge cases |
| `/refactor` | Refactor while preserving behavior |
| `/test` | Generate tests using the project's existing framework |
| `/commit` | Generate a Conventional Commit message from staged changes |
| `/document` | Generate or update technical documentation |
| `/optimize` | Analyze and improve performance without premature micro-optimization |
| `/security` | Run an OWASP-style security audit |
| `/pr` | Draft a pull request description |

## `@ifi/oh-pi-skills`

The skills pack currently ships 17 skills.

| Skill | What it is for |
| --- | --- |
| `btw` | Use the `/btw` or `/qq` side-conversation workflow effectively |
| `claymorphism` | Build soft, puffy clay-like interfaces |
| `context7` | Query up-to-date library and framework docs through Context7 |
| `debug-helper` | Analyze errors, logs, crashes, and performance issues |
| `flutter-serverpod-mvp` | Scaffold and evolve Flutter + Serverpod MVPs |
| `git-workflow` | Branching, commits, PRs, and merge/conflict workflow help |
| `glassmorphism` | Build frosted-glass style interfaces |
| `grill-me` | Stress-test a plan or design through adversarial questioning |
| `improve-codebase-architecture` | Find architecture improvements that deepen modules and improve testability |
| `liquid-glass` | Build Apple Liquid Glass-inspired interfaces |
| `neubrutalism` | Build bold, thick-bordered, offset-shadow interfaces |
| `quick-setup` | Detect project type and generate `.pi/` config |
| `request-refactor-plan` | Interview the user, create a tiny-commit refactor plan, and file it as a GitHub issue |
| `rust-workspace-bootstrap` | Scaffold a production Rust workspace with knope, devenv, and CI/release workflows |
| `web-fetch` | Fetch a web page and extract readable content |
| `web-search` | Search the web via DuckDuckGo |
| `write-a-skill` | Author new pi-compatible skills correctly |

## `@ifi/oh-pi-themes`

The theme pack currently ships 6 themes.

| Theme | Style |
| --- | --- |
| `oh-p-dark` | First-party cyan/purple dark theme |
| `cyberpunk` | Neon magenta + electric cyan |
| `nord` | Arctic blue palette |
| `catppuccin-mocha` | Pastel-on-dark palette |
| `tokyo-night` | Blue/purple twilight palette |
| `gruvbox-dark` | Warm retro dark palette |

## `@ifi/oh-pi-agents`

The AGENTS template pack currently ships 5 templates.

| Template | Focus |
| --- | --- |
| `general-developer` | Safe default project guidelines for everyday development |
| `fullstack-developer` | Full-stack application architecture, quality, and git conventions |
| `security-researcher` | Security testing/reporting workflow and ethics |
| `data-ai-engineer` | Data pipelines, AI/ML reproducibility, and infra discipline |
| `colony-operator` | When and how to delegate work to ant-colony |

## Contributor-facing packages and libraries

| Package | Role |
| --- | --- |
| [`@ifi/oh-pi`](../packages/oh-pi) | Meta-installer that registers the default bundle with pi |
| [`@ifi/oh-pi-cli`](../packages/cli) | Interactive setup/configuration TUI with provider/model/routing/package selection flows |
| [`@ifi/oh-pi-core`](../packages/core) | Shared registries, icons, i18n helpers, and path helpers for the pi agent directory and shared storage |
| [`@ifi/pi-shared-qna`](../packages/shared-qna) | Reusable TUI Q&A helpers and shared `pi-tui` loading logic |
| [`@ifi/pi-web-client`](../packages/web-client) | Platform-agnostic TypeScript client for custom remote session UIs |
| [`@ifi/pi-web-server`](../packages/web-server) | Embeddable HTTP + WebSocket remote session server |

## Which feature should I reach for?

- **Safer day-to-day pi sessions** → `@ifi/oh-pi-extensions`
- **Long-running shell commands, watches, and log tails** → `@ifi/pi-background-tasks`
- **Timing and completion visibility** → `@ifi/pi-diagnostics`
- **Large parallel work** → `@ifi/oh-pi-ant-colony`
- **Named specialists and reusable pipelines** → `@ifi/pi-extension-subagents`
- **Structured planning without implementing yet** → `@ifi/pi-plan`
- **Spec-first product development** → `@ifi/pi-spec`
- **Secure remote session sharing via Tailscale HTTPS with PTY/WebSocket** → `@ifi/pi-remote-tailscale`
- **PTY-backed live terminal viewing with real-time ANSI widget** → `@ifi/pi-bash-live-view`
- **Syntax highlighting, Nerd Font icons, tree-view listings, and colored output** → `@ifi/pi-pretty`
- **Remote access from a browser UI** → `@ifi/pi-web-remote`
- **Automatic or explainable model routing** → `@ifi/pi-extension-adaptive-routing`
- **Extra API-key providers** → `@ifi/pi-provider-catalog`
- **Cursor integration** → `@ifi/pi-provider-cursor`
- **Ollama local/cloud integration** → `@ifi/pi-provider-ollama`

For the local development loop that points a real pi install at this checkout, see the root
[README running locally section](../README.md#running-locally--local-development).
