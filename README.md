<div align="center">

<img src="./logo.svg" width="180" alt="oh-pi logo"/>

# 🐜 oh-pi

**One command to supercharge [pi-coding-agent](https://github.com/badlogic/pi-mono).**

Like oh-my-zsh for pi.

[![CI](https://github.com/ifiokjr/oh-pi/actions/workflows/ci.yml/badge.svg)](https://github.com/ifiokjr/oh-pi/actions/workflows/ci.yml) [![codecov](https://codecov.io/gh/ifiokjr/oh-pi/graph/badge.svg?branch=main)](https://codecov.io/gh/ifiokjr/oh-pi) [![license](https://img.shields.io/github/license/ifiokjr/oh-pi)](./LICENSE) [![node](https://img.shields.io/node/v/@ifi/oh-pi)](https://nodejs.org)

```bash
npx @ifi/oh-pi
```

</div>

---

## 30-Second Start

```bash
npx @ifi/oh-pi       # install the default oh-pi bundle
pi                    # start coding
```

oh-pi installs the full bundle into pi in one command. See [Installer Options](#installer-options) for project-scoped installs and version pinning.

## Start Here

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
    ├── analytics-db
    ├── analytics-dashboard
    └── docs
```

<!-- {/repoArchitectureAtAGlanceDocs} -->

### Fork-based Git install

If you keep a personal fork with custom oh-pi changes, you can also install the repo root directly as a pi package:

```bash
pi install https://github.com/<you>/oh-pi@<tag-or-commit>
```

That git-install path is meant for personal fork distribution across machines. It aggregates the repo's shareable runtime packages directly from the clone so you do not have to mirror local workspace paths. Published npm installs remain the better default for stable releases.

## Packages

This is a monorepo. Install everything at once with `npx @ifi/oh-pi`, or pick individual packages.

| Package                                                             | Role                                                                       | Install                                             |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- |
| [`@ifi/oh-pi`](./packages/oh-pi)                                    | Meta-installer for the default oh-pi bundle                                | `npx @ifi/oh-pi`                                    |
| [`@ifi/oh-pi-cli`](./packages/cli)                                  | Interactive TUI configurator                                               | `npx @ifi/oh-pi-cli`                                |
| [`@ifi/oh-pi-core`](./packages/core)                                | Shared types, registries, icons, i18n, and path helpers                    | (library, not installed directly)                   |
| [`@ifi/oh-pi-extensions`](./packages/extensions)                    | Core extension pack with 13 session features                               | `pi install npm:@ifi/oh-pi-extensions`              |
| [`@ifi/pi-background-tasks`](./packages/background-tasks)           | Reactive background shell tasks with `/bg`, `Ctrl+Shift+B`, and `bg_task`  | `pi install npm:@ifi/pi-background-tasks`           |
| [`@ifi/pi-diagnostics`](./packages/diagnostics)                     | Prompt completion timing extension                                         | `pi install npm:@ifi/pi-diagnostics`                |
| [`@ifi/pi-extension-subagents`](./packages/subagents)               | Full-featured subagent delegation runtime                                  | `pi install npm:@ifi/pi-extension-subagents`        |
| [`@ifi/pi-plan`](./packages/plan)                                   | Branch-aware planning mode extension                                       | `pi install npm:@ifi/pi-plan`                       |
| [`@ifi/pi-spec`](./packages/spec)                                   | Native spec-driven workflow with `/spec`                                   | `pi install npm:@ifi/pi-spec`                       |
| [`@ifi/pi-web-remote`](./packages/web-remote)                       | `/remote` session sharing extension                                        | `pi install npm:@ifi/pi-web-remote`                 |
| [`@ifi/pi-extension-adaptive-routing`](./packages/adaptive-routing) | Optional adaptive + delegated routing                                      | `pi install npm:@ifi/pi-extension-adaptive-routing` |
| [`@ifi/pi-provider-catalog`](./packages/providers)                  | Experimental OpenCode-backed provider catalog                              | `pi install npm:@ifi/pi-provider-catalog`           |
| [`@ifi/pi-provider-cursor`](./packages/cursor)                      | Experimental Cursor OAuth provider                                         | `pi install npm:@ifi/pi-provider-cursor`            |
| [`@ifi/pi-provider-ollama`](./packages/ollama)                      | Experimental Ollama local + cloud provider                                 | `pi install npm:@ifi/pi-provider-ollama`            |
| [`@ifi/oh-pi-themes`](./packages/themes)                            | 6 color themes                                                             | `pi install npm:@ifi/oh-pi-themes`                  |
| [`@ifi/oh-pi-prompts`](./packages/prompts)                          | 10 prompt templates                                                        | `pi install npm:@ifi/oh-pi-prompts`                 |
| [`@ifi/oh-pi-skills`](./packages/skills)                            | 17 skill packs                                                             | `pi install npm:@ifi/oh-pi-skills`                  |
| [`@ifi/oh-pi-agents`](./packages/agents)                            | 5 AGENTS.md templates                                                      | (used by CLI/templates)                             |
| [`@ifi/pi-shared-qna`](./packages/shared-qna)                       | Shared Q&A TUI helpers                                                     | (library, not installed directly)                   |
| [`@ifi/pi-web-client`](./packages/web-client)                       | Platform-agnostic remote session client library                            | `pnpm add @ifi/pi-web-client`                       |
| [`@ifi/pi-web-server`](./packages/web-server)                       | Embeddable remote session server                                           | `pnpm add @ifi/pi-web-server`                       |
| [`@ifi/pi-analytics-extension`](./packages/analytics-extension)     | Analytics tracking extension with SQLite persistence and browser dashboard | `pi install npm:@ifi/pi-analytics-extension`        |
| [`@ifi/pi-analytics-db`](./packages/analytics-db)                   | SQLite schema and Drizzle ORM client for analytics data                    | (library, not installed directly)                   |
| [`@ifi/pi-analytics-dashboard`](./packages/analytics-dashboard)     | React dashboard for visualizing AI usage (private package)                 | (private, run `pnpm dev` in package)                |
| [`@ifi/oh-pi-docs`](./packages/docs)                                | Documentation site for oh-pi (private package)                             | (private, run `pnpm dev` in package)                |

`@ifi/pi-extension-adaptive-routing`, `@ifi/pi-provider-catalog`, `@ifi/pi-provider-cursor`, `@ifi/pi-provider-ollama`, and `@ifi/pi-analytics-extension` stay opt-in for now and are **not** installed by `npx @ifi/oh-pi`. They are intentionally shipped as separate optional packages.

### Full Feature Catalog

For a package-by-package inventory of everything in the repo — including every extension, runtime package, prompt, skill, theme, AGENTS template, and contributor-facing library — see [docs/feature-catalog.md](./docs/feature-catalog.md).

### Native `/spec` Workflow

```bash
/spec init
/spec constitution Security-first, testable, minimal-complexity defaults
/spec specify Build a native spec workflow package for pi
/spec clarify
/spec plan Use TypeScript, Vitest, and direct pi tool access
/spec tasks
/spec analyze
/spec implement
```

### Installer Options

```bash
npx @ifi/oh-pi                      # install latest versions (global)
npx @ifi/oh-pi --version 0.2.13     # pin to a specific version
npx @ifi/oh-pi --local              # install to project .pi/settings.json
npx @ifi/oh-pi --remove             # uninstall all oh-pi packages from pi
```

### Compatibility Policy

oh-pi tracks upstream pi fairly closely and currently treats **pi `0.56.1` or newer** as the minimum supported runtime baseline for packages that integrate directly with the pi SDK.

Policy:

- new oh-pi releases target the current pi runtime family first
- compatibility with older pi builds is best-effort unless explicitly documented otherwise
- peer dependency ranges on pi-facing packages express the minimum supported baseline more clearly
- higher-risk runtime integrations should gain smoke coverage before broadening compatibility claims
- CI smoke-checks both the minimum supported baseline (`0.56.1`) and a pinned current upstream runtime (`0.64.0`)

### Documentation reuse with MDT

This repo uses [MDT](https://github.com/ifiokjr/mdt) to keep selected markdown sections and exported TypeScript API docs synchronized from shared provider blocks under `docs/mdt/`.

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

<!-- {=repoMdtCiDocs} -->

CI runs `pnpm mdt check` so provider and consumer blocks stay in sync with the repo-pinned MDT version.

<!-- {/repoMdtCiDocs} -->

---

## Configuration

### Plain Icons (disable emoji)

If emoji icons render poorly in your terminal (wrong font, garbled glyphs, misaligned widths), you can switch to ASCII-safe fallbacks. All emoji like 🐜 ✅ ❌ 🚀 become plain text like `[ant]` `[ok]` `[ERR]` `[>>]`.

Three ways to enable (in priority order):

**1. Environment variable** (highest priority)

```bash
export OH_PI_PLAIN_ICONS=1    # add to ~/.bashrc or ~/.zshrc
```

**2. CLI flag** (per session)

```bash
pi --plain-icons
```

**3. settings.json** (persistent, recommended)

Add `"plainIcons": true` to your global or project-local settings:

```bash
# Global — applies to all projects
echo '  "plainIcons": true' >> ~/.pi/agent/settings.json

# Or project-local — applies only to this repo
echo '  "plainIcons": true' >> .pi/settings.json
```

```jsonc
// ~/.pi/agent/settings.json
{
	"defaultProvider": "anthropic",
	"defaultModel": "claude-sonnet-4",
	"plainIcons": true,
	// ...
}
```

---

## Extensions

### 📦 Git Guard (`git-guard`) — **default: on**

Prevents accidental code loss by auto-creating stash checkpoints before the agent makes changes. Warns when the repo is dirty (uncommitted changes) and notifies when operations complete.

**How it works:** On `session_start`, checks `git status`. If dirty, creates `git stash` with a timestamped name. On `tool_result` for write/edit operations, tracks changed files.

### 📝 Auto Session Name (`auto-session-name`) — **default: on**

Automatically names sessions based on the first user message. Instead of "Session 2025-03-04T10:33:35", you get "Refactor auth to JWT" or "Fix CI pipeline".

**How it works:** Listens for the first `turn_end` event, extracts a short title from the user's initial prompt, and calls `pi.setSessionName()`.

### 📊 Custom Footer (`custom-footer`) — **default: on**

Replaces the default pi footer with a rich status bar showing real-time metrics:

```
◆ claude-sonnet-4 | 12.3k/8.1k $0.42 62% | ⏱3m12s | ⌂ projects/oh-pi | ⎇ main
```

**Shows:** Model name with thinking-level indicator, input/output tokens, accumulated cost, context window %, elapsed time, working directory, git branch, and repo/worktree context when available.

**How it works:** Uses `ctx.ui.setFooter()` with a component that reads `ctx.sessionManager.getBranch()` for token/cost data and `footerData.getGitBranch()` for git info. Auto-refreshes every 30s.

### ⏱ Diagnostics (`diagnostics`) — **default: on**

Adds prompt-level completion diagnostics so you can see when a prompt started, when it finished, how long it took, and how each assistant turn progressed.

**Surfaces:**

- widget below the editor showing the active prompt or the last completed prompt
- session log entry after each prompt finishes with human-readable start/end timestamps
- expanded per-turn timing details for prompts that needed multiple assistant turns
- `Ctrl+Shift+D` shortcut and `/diagnostics [status|toggle|on|off]`

**How it works:** Reuses the same timestamp/duration formatting as `tool-metadata`, tracks `before_agent_start`, `turn_end`, and `agent_end`, then emits a custom diagnostic message when the agent goes idle for that prompt.

### 🧾 Tool Metadata (`tool-metadata`) — **default: on**

Enriches tool results with execution metadata so pi can show when a tool started, when it finished, how long it took, and roughly how much text went in or out.

**Adds:** start/end timestamps, duration, approximate input/output sizing, and a context snapshot at completion. It also sanitizes oversized tool output/details payloads so the TUI stays stable even when tools return huge text blobs.

**How it works:** Hooks tool calls/results centrally and appends structured metadata to tool result `details`, which other features like diagnostics can reuse for consistent timing displays.

### ⚡ Compact Header (`compact-header`) — **default: on**

Replaces the verbose default startup header with a dense one-liner showing model, provider, thinking level, and extension count.

### 🔄 Auto Update (`auto-update`) — **default: on**

Checks npm for newer versions of oh-pi on startup. If an update is available, shows a notification with the new version and install command. Never blocks — fully async.

**How it works:** On `session_start`, runs `npm view oh-pi version` in the background via `pi.exec()`. Compares with the local version using semver.

### ⌨️ External Editor (`external-editor`) — **default: on**

Adds a discoverable `/external-editor` command and a `Ctrl+Shift+E` shortcut for opening the current draft in `$VISUAL` or `$EDITOR`, then syncing the saved text back into pi.

**Commands:** `/external-editor` | `/external-editor status`

**Notes:** This complements pi's built-in `app.editor.external` binding (`Ctrl+G` by default). Users who want a different primary key can still remap that binding in `keybindings.json`.

### 🌲 Worktree (`worktree`) — **default: on**

Adds centralized git worktree awareness for oh-pi. It detects whether the current checkout is the main repo or a linked worktree, shows when the current worktree is pi-owned, and tracks owner + purpose metadata for pi-created worktrees.

**Commands:** `/worktree` | `/worktree status` | `/worktree list` | `/worktree open [branch|path]` | `/worktree create <branch> [purpose]` | `/worktree cleanup <branch|path|id|all>`

**Behavior:** pi-owned worktrees are created under shared pi storage, namespaced by the canonical repo root. Cleanup focuses on pi-owned worktrees only and leaves external/manual worktrees alone unless you explicitly intervene.

### 📅 Scheduler (`scheduler`) — **default: on**

Adds first-class reminders, recurring follow-ups, and future check-ins to pi.

**Commands:** `/remind in 45m <prompt>` | `/loop 5m <prompt>` | `/loop cron '*/5 * * * *' <prompt>` | `/schedule` | `/schedule:tui` | `/schedule:list` | `/schedule:enable <id>` | `/schedule:disable <id>` | `/schedule:delete <id>` | `/schedule:clear` | `/schedule:clear-other` | `/schedule:adopt <id|all>` | `/schedule:release <id|all>` | `/schedule:clear-foreign`

**Tool:** `schedule_prompt`

**Behavior:** tasks run only while pi is active and idle, persist under shared pi storage, default to instance scope, and can opt into workspace scope for shared CI/build/deploy monitors. Use `continueUntilComplete` when a follow-up should keep retrying until a success marker appears.

### 💬 BTW / QQ (`btw`) — **default: on**

Creates a side-conversation widget above the editor so you can ask follow-up questions, think in parallel, or park a tangent without interrupting the main thread.

**Commands:** `/btw` | `/btw:new` | `/btw:clear` | `/btw:inject` | `/btw:summarize` and the alias set `/qq`, `/qq:new`, `/qq:clear`, `/qq:inject`, `/qq:summarize`

**Behavior:** keep a lightweight parallel thread, then either inject the full exchange into the main agent or inject a generated summary instead.

### ⏳ Background Process (`bg-process`) — **default: off**

Manages explicit background tasks for long-lived commands like dev servers, PR watchers, and log followers. Ordinary `bash` commands stay in the foreground so their output remains visible in the current pi session.

**How it works:** Use `bg_task` or `/bg` when you want a command to keep running after the tool returns. Background tasks write output to `/tmp/oh-pi-bg-*.log`, can wake pi up on new output, and can be inspected or stopped later with `bg_status`, `bg_task`, or the `/bg` dashboard.

```
Agent: bg_task spawn "npm run dev"
→ Started bg-1 (pid 12345) in the background.
  Log: /tmp/oh-pi-bg-bg-1-1709654321.log
  ⏳ Pi can notify you when new output arrives or when the task exits.
```

**Commands:** `bg_status list` | `bg_status log --pid 12345` | `bg_status stop --pid 12345`

### 🧭 Adaptive Routing (`adaptive-routing`) — **optional package**

Adaptive routing now ships as its own package so users can opt into routing behavior explicitly:

```bash
pi install npm:@ifi/pi-extension-adaptive-routing
```

It adds `/route` controls, local routing telemetry, and delegated startup categories that subagents can use for provider assignment when no explicit model override is set.

### 💰 Usage Tracker (`usage-tracker`) — **default: off**

<!-- {=extensionsUsageTrackerOverview} -->

The usage-tracker extension is a CodexBar-inspired provider quota and cost monitor for pi. It shows provider-level rate limits for Anthropic, OpenAI, and Google using pi-managed auth, while also tracking per-model token usage and session costs locally.

<!-- {/extensionsUsageTrackerOverview} -->

<!-- {=extensionsUsageTrackerPersistenceDocs} -->

Usage-tracker persists rolling 30-day cost history and the last known provider rate-limit snapshot under the pi agent directory. That lets the widget and dashboard survive restarts and keep showing recent subscription windows when a live provider probe is temporarily rate-limited or unavailable.

<!-- {/extensionsUsageTrackerPersistenceDocs} -->

**Widget** (always visible above editor):

```
Claude [████████░░░░] 67% ↻in 3d 2h │ 💰$0.42 │ 12.3k/8.1k
```

**`/usage` overlay** (`Ctrl+Shift+U`):

```
╭─ Usage Dashboard ──────────────────────────────────────╮

  ▸ Claude Rate Limits
    Weekly (all)   [████████████░░░░░░░░] 67% left (33% used) — resets in 3d 2h
      Pace: On pace | Expected 31% used | Lasts until reset
    Session        [████████████████░░░░] 82% left (18% used) — resets in 2h 5m
    Most constrained: Weekly (all) (67% left)

  ──────────────────────────────────────────────────────────
  Session │ 23m12s │ 14 turns │ $0.42
  Tokens  │ 45.2k in │ 18.7k out │ 63.9k total
  Avg     │ 4.6k tok/turn │ $0.030/turn
  Cache   │ 12.4k read │ 1.8k write │ 27% read/input

  Per-Model Breakdown
  ◆ claude-sonnet-4 (anthropic)
    [████████████] $0.38 │ 12 turns │ 40.1k in / 16.2k out │ 90% of cost
    avg 4.7k tok/turn
╰────────────────────────────────────────────────────────╯
```

<!-- {=extensionsUsageTrackerCommandsDocs} -->

Key usage-tracker surfaces:

- widget above the editor for at-a-glance quotas and session totals
- `/usage` for the full dashboard overlay
- `Ctrl+Shift+U` as a shortcut for the same overlay
- `/usage-toggle` to show or hide the widget
- `/usage-refresh` to force fresh provider probes
- `usage_report` so the agent can answer quota and spend questions directly

<!-- {/extensionsUsageTrackerCommandsDocs} -->

### 🛡️ Watchdog + Safe Mode (`watchdog`) — **default: on**

Continuously samples runtime health so heavy sessions stay usable.

**Commands:** `/watchdog` | `/watchdog:status` | `/watchdog:startup` | `/watchdog:overlay` | `/watchdog:dashboard` | `/watchdog:config` | `/watchdog:reset` | `/watchdog:on` | `/watchdog:off` | `/watchdog:sample` | `/watchdog:blame` | `/safe-mode [on|off|status]`

**Behavior:** tracks CPU, memory, and event-loop lag; records recent samples and alerts; and can escalate into safe mode when repeated alerts suggest sustained UI churn. The optional config file lives at `~/.pi/agent/extensions/watchdog/config.json`.

---

## Setup Modes

| Mode          | Steps | For                               |
| ------------- | ----- | --------------------------------- |
| 🚀 **Quick**  | 3     | Pick provider → enter key → done  |
| 📦 **Preset** | 2     | Choose a role profile → enter key |
| 🎛️ **Custom** | 6     | Pick everything yourself          |

### Presets

|               | Theme      | Thinking | Includes                               |
| ------------- | ---------- | -------- | -------------------------------------- |
| ⚫ Full Power | oh-pi Dark | high     | Recommended extensions + bg-process    |
| 🔴 Clean      | Default    | off      | No extensions, just core               |
| 🚀 Subagents  | oh-pi Dark | medium   | Subagent chains and parallel execution |

### Providers

Anthropic · OpenAI · Google Gemini · Groq · OpenRouter · xAI · Mistral

---

## Skills

The tables below highlight the most commonly reached-for skills. For the full list of all 17 skills, plus the 5 AGENTS.md templates that ship in this repo, see [docs/feature-catalog.md](./docs/feature-catalog.md).

### 🔧 Tool Skills

| Skill        | What it does                               |
| ------------ | ------------------------------------------ |
| `context7`   | Query latest library docs via Context7 API |
| `web-search` | DuckDuckGo search (free, no key)           |
| `web-fetch`  | Extract webpage content as plain text      |

### 🎨 UI Design System Skills

| Skill           | Style                                       |
| --------------- | ------------------------------------------- |
| `liquid-glass`  | Apple WWDC 2025 translucent glass           |
| `glassmorphism` | Frosted glass blur + transparency           |
| `claymorphism`  | Soft 3D clay-like surfaces                  |
| `neubrutalism`  | Bold borders, offset shadows, high contrast |

### 🔄 Workflow Skills

| Skill                      | What it does                                       |
| -------------------------- | -------------------------------------------------- |
| `quick-setup`              | Detect project type, generate .pi/ config          |
| `debug-helper`             | Error analysis, log interpretation, profiling      |
| `git-workflow`             | Branching, commits, PRs, conflict resolution       |
| `rust-workspace-bootstrap` | Scaffold Rust workspaces with knope, devenv, CI/CD |
| `flutter-serverpod-mvp`    | Scaffold full-stack Flutter + Serverpod MVPs       |

## Themes

| Theme               | Description                  |
| ------------------- | ---------------------------- |
| 🌙 oh-pi Dark       | Cyan + purple, high contrast |
| 🌙 Cyberpunk        | Neon magenta + electric cyan |
| 🌙 Nord             | Arctic blue palette          |
| 🌙 Catppuccin Mocha | Pastel on dark               |
| 🌙 Tokyo Night      | Blue + purple twilight       |
| 🌙 Gruvbox Dark     | Warm retro tones             |

## Prompt Templates

| Command     | Description                              |
| ----------- | ---------------------------------------- |
| `/review`   | Code review: bugs, security, performance |
| `/fix`      | Fix errors with minimal changes          |
| `/explain`  | Explain code, simple to detailed         |
| `/refactor` | Refactor preserving behavior             |
| `/test`     | Generate tests                           |
| `/commit`   | Conventional Commit message              |
| `/pr`       | Pull request description                 |
| `/security` | OWASP security audit                     |
| `/optimize` | Performance optimization                 |
| `/document` | Generate documentation                   |

---

## Development

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 10
- [knope](https://knope.tech) (for releases)

### Setup

```bash
git clone https://github.com/ifiokjr/oh-pi.git
cd oh-pi
pnpm install
```

<!-- {=repoContributorCompiledPackagesDocs} -->

Most runtime packages in this repo ship raw TypeScript and can be loaded directly by pi. A smaller set of contributor-facing packages (`core`, `cli`, `web-client`, `web-server`) emit `dist/` output, so build those when you are working on them directly.

<!-- {/repoContributorCompiledPackagesDocs} -->

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contributor workflow, changeset requirements, and PR guidelines.

### Commands

```bash
pnpm build               # Build every workspace package that exposes a build script
pnpm typecheck           # Type check with tsgo (fast)
pnpm test                # Run all tests
pnpm test:coverage       # Run tests with repo-wide coverage reporting
pnpm test:patch-coverage # Enforce 100% patch coverage from coverage/lcov.info
pnpm lint                # oxlint + oxfmt check
pnpm security:check      # Dependency allowlist + vulnerability audits
pnpm lint:fix            # Auto-fix lint issues
pnpm format              # Format all files
```

### Coverage policy

- Overall/project coverage is currently enforced at **60%**.
- Patch coverage for new PR changes is enforced at **100%**.
- The local contributor loop for coverage-sensitive work is:

```bash
pnpm test:coverage
pnpm test:patch-coverage
```

That keeps the repo-wide floor honest while still requiring new code paths in a PR to be fully covered. CI uses the same `pnpm test:patch-coverage` command on pull requests, so local results and CI results stay aligned.

### Running locally & local development

<!-- {=repoPiLocalSwitcherOverviewDocs} -->

The `pnpm pi:local` workflow points a real pi install at this checkout instead of the published npm packages. It is the normal local development loop for testing unpublished oh-pi changes in a real interactive pi session.

<!-- {/repoPiLocalSwitcherOverviewDocs} -->

#### Quick start

<!-- {=repoPiLocalQuickstartDocs} -->

```bash
pnpm install
pnpm pi:local
pi
```

<!-- {/repoPiLocalQuickstartDocs} -->

That is the normal developer loop for oh-pi feature work.

#### What `pnpm pi:local` does

<!-- {=repoPiLocalWhatItDoesDocs} -->

`pnpm pi:local` runs the repo-local source switcher in `local` mode. It:

- rewrites only the managed oh-pi package sources in your pi settings
- points those package sources at the workspace packages in this checkout
- preserves package-specific config objects already present in `settings.json`
- refreshes package manifest paths so newly added extensions/prompts/skills/themes are picked up
- runs `pi install` for newly added managed packages and `pi update` for packages you already had configured
- manages the default installer set and the opt-in experimental packages used for local feature development
- lets you validate unpublished changes from a branch, worktree, or detached checkout before release

<!-- {/repoPiLocalWhatItDoesDocs} -->

<!-- {=repoPiLocalManagedPackagesDocs} -->

Managed local switching covers these packages:

- `@ifi/oh-pi-extensions`
- `@ifi/pi-background-tasks`
- `@ifi/pi-diagnostics`
- `@ifi/pi-extension-subagents`
- `@ifi/pi-plan`
- `@ifi/pi-spec`
- `@ifi/pi-web-remote`
- `@ifi/oh-pi-themes`
- `@ifi/oh-pi-prompts`
- `@ifi/oh-pi-skills`
- `@ifi/pi-extension-adaptive-routing`
- `@ifi/pi-provider-catalog`
- `@ifi/pi-provider-cursor`
- `@ifi/pi-provider-ollama`
- `@ifi/pi-analytics-extension`

<!-- {/repoPiLocalManagedPackagesDocs} -->

#### Common commands

```bash
pnpm pi:local                             # point pi at this checkout
pnpm pi:published                         # switch back to published npm packages
pnpm pi:switch local -- --path /tmp/oh-pi-branch
pnpm pi:switch remote -- --version 0.4.4
pnpm pi:switch local -- --pi-local        # write into the current project's .pi/settings.json
pnpm pi:switch status                     # show the current managed package sources
```

#### Typical local workflow

1. `pnpm install`
2. `pnpm pi:local`
3. Fully restart `pi`
4. Exercise the feature in a real pi session
5. Make changes in this repo
6. Restart `pi` again when the package source or loaded modules need a clean reload
7. Switch back with `pnpm pi:published` when you want the published packages again

#### Important restart note

<!-- {=repoPiSourceSwitchRestartDocs} -->

After switching package sources, fully restart `pi`. Do not rely on `/reload` for source switches, because it can keep previously loaded package modules alive.

<!-- {/repoPiSourceSwitchRestartDocs} -->

#### When to re-run installs or builds

<!-- {=repoPiLocalInstallFreshnessDocs} -->

If you recently pulled, rebased, or switched branches in the checkout you pointed `pi` at, run `pnpm install --frozen-lockfile` there before restarting `pi`. Local source mode loads workspace files directly, so stale `node_modules` can surface missing internal `@ifi/*` package errors.

<!-- {/repoPiLocalInstallFreshnessDocs} -->

If you are changing one of the compiled contributor packages (`@ifi/oh-pi-core`, `@ifi/oh-pi-cli`, `@ifi/pi-web-client`, or `@ifi/pi-web-server`), also run the relevant build command or `pnpm build` so their emitted `dist/` output stays current.

### Changesets

**Every change must include a changeset.** This is enforced in CI.

```bash
knope document-change
```

This creates a file in `.changeset/` describing the change. Because this repo uses lockstep versioning and a single knope `[package]`, changeset frontmatter must use **only** `default` as the key:

```md
---
default: patch
---
```

Do not use package names like `@ifi/oh-pi` or `@ifi/oh-pi-extensions` in changeset frontmatter here — knope ignores those entries in this repo.

Choose the change type:

- **`major`** — Breaking changes
- **`minor`** — New features
- **`patch`** — Bug fixes

### Releasing

Releases are done locally in two steps:

```bash
# 1. Release: bump versions, update CHANGELOG.md, tag, push
./scripts/release.sh

# 2. Publish: build and push all packages to npm
knope publish
```

The release script runs all CI/security checks (lint, security, typecheck, test, build) before calling `knope release`. Use `--dry-run` to preview without making changes.

### Project Structure

```
oh-pi/
├── packages/
│   ├── core/                   Shared types, registries, icons, i18n, and path helpers (compiled)
│   ├── cli/                    Interactive TUI configurator (compiled)
│   ├── extensions/             13 core pi extensions (raw .ts)
│   ├── background-tasks/       Reactive background shell task package (raw .ts)
│   ├── diagnostics/            Prompt completion timing extension (raw .ts)
│   ├── subagents/              Subagent orchestration package (raw .ts)
│   ├── plan/                   Planning mode extension (raw .ts)
│   ├── spec/                   Native spec-driven workflow package (raw .ts)
│   ├── adaptive-routing/       Optional adaptive/delegated routing package (raw .ts)
│   ├── providers/              Experimental provider catalog package (raw .ts)
│   ├── cursor/                 Experimental Cursor OAuth provider package (raw .ts)
│   ├── ollama/                 Experimental Ollama local + cloud provider package (raw .ts)
│   ├── web-remote/             `/remote` session sharing extension (raw .ts)
│   ├── web-client/             Remote session client library (compiled)
│   ├── web-server/             Remote session server library (compiled)
│   ├── shared-qna/             Shared Q&A TUI helper library (raw .ts)
│   ├── analytics-db/             SQLite schema and Drizzle ORM client for analytics data
│   ├── analytics-dashboard/      React dashboard for visualizing AI usage (private app)
│   ├── analytics-extension/      Analytics tracking extension for pi (raw .ts)
│   ├── docs/                     Documentation site for oh-pi (private app)
│   ├── themes/                 6 JSON theme files
│   ├── prompts/                10 markdown prompt templates
│   ├── skills/                 17 skill directories
│   ├── agents/                 5 AGENTS.md templates
│   └── oh-pi/                  Installer CLI (npx @ifi/oh-pi)
├── docs/                       Full documentation
├── benchmarks/                 Performance benchmarks
├── .changeset/                 Pending changesets (knope)
├── CHANGELOG.md                Release history
├── knope.toml                  Release automation config
└── .oxlintrc.json + .oxfmtrc.json                  Linter + formatter config
```

## License

MIT
