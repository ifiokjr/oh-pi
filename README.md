<div align="center">

<img src="./logo.svg" width="180" alt="monopi logo"/>

# 🐜 monopi

**One command to supercharge [pi-coding-agent](https://github.com/badlogic/pi-mono).**

Like oh-my-zsh for pi.

[![CI](https://github.com/ifiokjr/monopi/actions/workflows/ci.yml/badge.svg)](https://github.com/ifiokjr/monopi/actions/workflows/ci.yml) [![codecov](https://codecov.io/gh/ifiokjr/monopi/graph/badge.svg?branch=main)](https://codecov.io/gh/ifiokjr/monopi) [![license](https://img.shields.io/github/license/ifiokjr/monopi)](./LICENSE) [![node](https://img.shields.io/node/v/@monopi/monopi)](https://nodejs.org)

```bash
npx @monopi/monopi
```

</div>

---

## 30-Second Start

```bash
npx @monopi/monopi       # install the default monopi bundle
pi                    # start coding
```

monopi installs the full bundle into pi in one command. See [Installer Options](#installer-options) for project-scoped installs and version pinning.

## Start Here

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

### Fork-based Git install

If you keep a personal fork with custom monopi changes, you can also install the repo root directly as a pi package:

```bash
pi install https://github.com/<you>/monopi@<tag-or-commit>
```

That git-install path is meant for personal fork distribution across machines. It aggregates the repo's shareable runtime packages directly from the clone so you do not have to mirror local workspace paths. Published npm installs remain the better default for stable releases.

## Packages

This is a monorepo. Install everything at once with `npx @monopi/monopi`, or pick individual packages.

| Package                                                                 | Role                                                                       | Install                                      |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| [`@monopi/monopi`](./packages/monopi__monopi)                           | Meta-installer for the default monopi bundle                               | `npx @monopi/monopi`                         |
| [`@monopi/cli`](./packages/monopi__cli)                                 | Interactive TUI configurator                                               | `npx @monopi/cli`                            |
| [`@monopi/core`](./packages/monopi__core)                               | Shared types, registries, icons, i18n, and path helpers                    | (library, not installed directly)            |
| [`@monopi/db`](./packages/monopi__db)                                   | Shared SQLite/Drizzle database for persistence-based extensions            | (library, not installed directly)            |
| [`@monopi/extension-worktree`](./packages/monopi__extension-worktree)   | Split extension package for worktree management                            | `pi install npm:@monopi/extension-worktree`  |
| [`@monopi/background-tasks`](./packages/monopi__background-tasks)       | Reactive background shell tasks with `/bg`, `Ctrl+Shift+B`, and `bg_task`  | `pi install npm:@monopi/background-tasks`    |
| [`@monopi/diagnostics`](./packages/monopi__diagnostics)                 | Prompt completion timing extension                                         | `pi install npm:@monopi/diagnostics`         |
| [`@monopi/subagents`](./packages/monopi__subagents)                     | Full-featured subagent delegation runtime                                  | `pi install npm:@monopi/subagents`           |
| [`@monopi/web-remote`](./packages/monopi__web-remote)                   | `/remote` session sharing extension                                        | `pi install npm:@monopi/web-remote`          |
| [`@monopi/adaptive-routing`](./packages/monopi__adaptive-routing)       | Optional adaptive + delegated routing                                      | `pi install npm:@monopi/adaptive-routing`    |
| [`@monopi/provider-catalog`](./packages/monopi__provider-catalog)       | Experimental OpenCode-backed provider catalog                              | `pi install npm:@monopi/provider-catalog`    |
| [`@monopi/provider-cursor`](./packages/monopi__provider-cursor)         | Experimental Cursor OAuth provider                                         | `pi install npm:@monopi/provider-cursor`     |
| [`@monopi/provider-ollama`](./packages/monopi__provider-ollama)         | Experimental Ollama local + cloud provider                                 | `pi install npm:@monopi/provider-ollama`     |
| [`@monopi/skills`](./packages/monopi__skills)                           | 3 maintained skill packs                                                   | `pi install npm:@monopi/skills`              |
| [`@monopi/agents`](./packages/monopi__agents)                           | 5 AGENTS.md templates                                                      | (used by CLI/templates)                      |
| [`@monopi/shared-qna`](./packages/monopi__shared-qna)                   | Shared Q&A TUI helpers                                                     | (library, not installed directly)            |
| [`@monopi/web-client`](./packages/monopi__web-client)                   | Platform-agnostic remote session client library                            | `pnpm add @monopi/web-client`                |
| [`@monopi/web-server`](./packages/monopi__web-server)                   | Embeddable remote session server                                           | `pnpm add @monopi/web-server`                |
| [`@monopi/analytics-extension`](./packages/monopi__analytics-extension) | Analytics tracking extension with SQLite persistence and browser dashboard | `pi install npm:@monopi/analytics-extension` |
| [`@monopi/analytics-db`](./packages/monopi__analytics-db)               | SQLite schema and Drizzle ORM client for analytics data                    | (library, not installed directly)            |
| [`@monopi/analytics-dashboard`](./packages/monopi__analytics-dashboard) | React dashboard for visualizing AI usage (private package)                 | (private, run `pnpm dev` in package)         |
| [`@monopi/docs`](./packages/monopi__docs)                               | Documentation site for monopi (private package)                            | (private, run `pnpm dev` in package)         |

`@monopi/adaptive-routing`, `@monopi/provider-catalog`, `@monopi/provider-cursor`, `@monopi/provider-ollama`, and `@monopi/analytics-extension` stay opt-in for now and are **not** installed by `npx @monopi/monopi`. They are intentionally shipped as separate optional packages.

### Full Feature Catalog

For a package-by-package inventory of everything in the repo — including every extension, runtime package, skill, theme, AGENTS template, and contributor-facing library — see [docs/feature-catalog.md](./docs/feature-catalog.md).

### Installer Options

```bash
npx @monopi/monopi                      # install latest versions (global)
npx @monopi/monopi --version 0.2.13     # pin to a specific version
npx @monopi/monopi --local              # install to project .pi/settings.json
npx @monopi/monopi --remove             # uninstall all monopi packages from pi
```

### Compatibility Policy

monopi tracks upstream pi fairly closely and currently treats **pi `0.56.1` or newer** as the minimum supported runtime baseline for packages that integrate directly with the pi SDK.

Policy:

- new monopi releases target the current pi runtime family first
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

### 📊 Custom Footer (`custom-footer`) — **default: on**

Replaces the default pi footer with a rich status bar showing real-time metrics:

```
◆ claude-sonnet-4 | 12.3k/8.1k $0.42 62% | ⏱3m12s | ⌂ projects/monopi | ⎇ main
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

### ⌨️ External Editor (`external-editor`) — **default: on**

Adds a discoverable `/external-editor` command and a `Ctrl+Shift+E` shortcut for opening the current draft in `$VISUAL` or `$EDITOR`, then syncing the saved text back into pi.

**Commands:** `/external-editor` | `/external-editor status`

**Notes:** This complements pi's built-in `app.editor.external` binding (`Ctrl+G` by default). Users who want a different primary key can still remap that binding in `keybindings.json`.

### 🌲 Worktree (`worktree`) — **default: on**

Adds centralized git worktree awareness for monopi. It detects whether the current checkout is the main repo or a linked worktree, shows when the current worktree is pi-owned, and tracks owner + purpose metadata for pi-created worktrees.

**Commands:** `/worktree` | `/worktree status` | `/worktree list` | `/worktree open [branch|path]` | `/worktree create <branch> [purpose]` | `/worktree cleanup <branch|path|id|all>`

**Behavior:** pi-owned worktrees are created under shared pi storage, namespaced by the canonical repo root. Cleanup focuses on pi-owned worktrees only and leaves external/manual worktrees alone unless you explicitly intervene.

### 📅 Scheduler (`scheduler`) — **default: on**

Adds first-class reminders, recurring follow-ups, and future check-ins to pi.

**Commands:** `/remind in 45m <prompt>` | `/loop 5m <prompt>` | `/loop cron '*/5 * * * *' <prompt>` | `/schedule` | `/schedule tui` | `/schedule list` | `/schedule enable <id>` | `/schedule disable <id>` | `/schedule delete <id>` | `/schedule clear` | `/schedule clear-other` | `/schedule adopt <id|all>` | `/schedule release <id|all>` | `/schedule clear-foreign`

**Tool:** `schedule_prompt`

**Behavior:** tasks run only while pi is active and idle, persist under shared pi storage, default to instance scope, and can opt into workspace scope for shared CI/build/deploy monitors. Use `continueUntilComplete` when a follow-up should keep retrying until a success marker appears.

### 💬 BTW / QQ (`btw`) — **default: on**

Creates a side-conversation widget above the editor so you can ask follow-up questions, think in parallel, or park a tangent without interrupting the main thread.

**Commands:** `/btw` | `/btw new` | `/btw clear` | `/btw inject` | `/btw summarize` and the alias set `/qq`, `/qq new`, `/qq clear`, `/qq inject`, `/qq summarize`

**Behavior:** keep a lightweight parallel thread, then either inject the full exchange into the main agent or inject a generated summary instead.

### ⏳ Background Process (`bg-process`) — **default: off**

Manages explicit background tasks for long-lived commands like dev servers, PR watchers, and log followers. Ordinary `bash` commands stay in the foreground so their output remains visible in the current pi session.

**How it works:** Use `bg_task` or `/bg` when you want a command to keep running after the tool returns. Background tasks write output to `/tmp/monopi-bg-*.log`, can wake pi up on new output, and can be inspected or stopped later with `bg_status`, `bg_task`, or the `/bg` dashboard.

```
Agent: bg_task spawn "npm run dev"
→ Started bg-1 (pid 12345) in the background.
  Log: /tmp/monopi-bg-bg-1-1709654321.log
  ⏳ Pi can notify you when new output arrives or when the task exits.
```

**Commands:** `bg_status list` | `bg_status log --pid 12345` | `bg_status stop --pid 12345`

### 🧭 Adaptive Routing (`adaptive-routing`) — **optional package**

Adaptive routing now ships as its own package so users can opt into routing behavior explicitly:

```bash
pi install npm:@monopi/adaptive-routing
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

**Commands:** `/watchdog` | `/watchdog status` | `/watchdog startup` | `/watchdog overlay` | `/watchdog dashboard` | `/watchdog config` | `/watchdog reset` | `/watchdog on` | `/watchdog off` | `/watchdog sample` | `/watchdog blame` | `/safe-mode [on|off|status]`

**Behavior:** tracks CPU, memory, and event-loop lag; records recent samples and alerts; and can escalate into safe mode when repeated alerts suggest sustained UI churn. The optional config file lives at `~/.pi/agent/extensions/watchdog/config.json`.

---

## Setup Modes

| Mode          | Steps | For                               |
| ------------- | ----- | --------------------------------- |
| 🚀 **Quick**  | 3     | Pick provider → enter key → done  |
| 📦 **Preset** | 2     | Choose a role profile → enter key |
| 🎛️ **Custom** | 6     | Pick everything yourself          |

### Presets

|               | Theme       | Thinking | Includes                               |
| ------------- | ----------- | -------- | -------------------------------------- |
| ⚫ Full Power | monopi Dark | high     | Recommended extensions + bg-process    |
| 🔴 Clean      | Default     | off      | No extensions, just core               |
| 🚀 Subagents  | monopi Dark | medium   | Subagent chains and parallel execution |

### Providers

Anthropic · OpenAI · Google Gemini · Groq · OpenRouter · xAI · Mistral

---

## Skills

| Skill          | What it does                                          |
| -------------- | ----------------------------------------------------- |
| `btw` (`/qq`)  | Run side conversations without interrupting main work |
| `debug-helper` | Error analysis, log interpretation, and profiling     |
| `nushell`      | Nushell syntax reference for shell commands           |

## Themes

| Theme               | Description                  |
| ------------------- | ---------------------------- |
| 🌙 monopi Dark      | Cyan + purple, high contrast |
| 🌙 Cyberpunk        | Neon magenta + electric cyan |
| 🌙 Nord             | Arctic blue palette          |
| 🌙 Catppuccin Mocha | Pastel on dark               |
| 🌙 Tokyo Night      | Blue + purple twilight       |
| 🌙 Gruvbox Dark     | Warm retro tones             |

---

## Development

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 10
- MonoChange CLI (`pnpm mc:*` scripts) for releases

### Setup

```bash
git clone https://github.com/ifiokjr/monopi.git
cd monopi
pnpm install
```

<!-- {=repoContributorCompiledPackagesDocs} -->

Most runtime packages in this repo ship raw TypeScript and can be loaded directly by pi. A smaller set of contributor-facing packages (`core`, `cli`, `db`, `web-client`, `web-server`) emit `dist/` output, so build those when you are working on them directly.

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

The `pnpm pi:local` workflow points a real pi install at this checkout instead of the published npm packages. It is the normal local development loop for testing unpublished monopi changes in a real interactive pi session.

<!-- {/repoPiLocalSwitcherOverviewDocs} -->

#### Quick start

<!-- {=repoPiLocalQuickstartDocs} -->

```bash
pnpm install
pnpm pi:local
pi
```

<!-- {/repoPiLocalQuickstartDocs} -->

That is the normal developer loop for monopi feature work.

#### What `pnpm pi:local` does

<!-- {=repoPiLocalWhatItDoesDocs} -->

`pnpm pi:local` runs the repo-local source switcher in `local` mode. It:

- rewrites only the managed monopi package sources in your pi settings
- points those package sources at the workspace packages in this checkout
- preserves package-specific config objects already present in `settings.json`
- refreshes package manifest paths so newly added extensions/skills/themes are picked up
- runs `pi install` for newly added managed packages and `pi update` for packages you already had configured
- manages the default installer set and the opt-in experimental packages used for local feature development
- lets you validate unpublished changes from a branch, worktree, or detached checkout before release

<!-- {/repoPiLocalWhatItDoesDocs} -->

<!-- {=repoPiLocalManagedPackagesDocs} -->

Managed local switching covers these packages:

- `@monopi/extension-worktree`
- `@monopi/background-tasks`
- `@monopi/diagnostics`
- `@monopi/subagents`
- `@monopi/web-remote`
- `@monopi/skills`
- `@monopi/extension-bg-process`
- `@monopi/adaptive-routing`
- `@monopi/provider-catalog`
- `@monopi/provider-cursor`
- `@monopi/provider-ollama`
- `@monopi/analytics-extension`

<!-- {/repoPiLocalManagedPackagesDocs} -->

#### Common commands

```bash
pnpm pi:local                             # point pi at this checkout
pnpm pi:published                         # switch back to published npm packages
pnpm pi:switch local -- --path /tmp/monopi-branch
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

If you recently pulled, rebased, or switched branches in the checkout you pointed `pi` at, run `pnpm install --frozen-lockfile` there before restarting `pi`. Local source mode loads workspace files directly, so stale `node_modules` can surface missing internal `@monopi/*` package errors.

<!-- {/repoPiLocalInstallFreshnessDocs} -->

If you are changing one of the compiled contributor packages (`@monopi/core`, `@monopi/cli`, `@monopi/web-client`, or `@monopi/web-server`), also run the relevant build command or `pnpm build` so their emitted `dist/` output stays current.

### Changesets

**Every change must include a changeset.** This is enforced in CI.

```bash
pnpm change
```

This creates a file in `.changeset/` describing the change. Because this repo uses MonoChange with a lockstep `default` group, changeset frontmatter must use **only** `default` as the key:

```md
---
default: patch
---
```

Do not use package names like `@monopi/monopi` or `@monopi/extension-worktree` in changeset frontmatter here — MonoChange validates changesets against the configured `default` release group.

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
pnpm publish
```

The release script runs all CI/security checks (lint, security, typecheck, test, build) before calling `pnpm release`. Use `--dry-run` to preview without making changes.

### Project Structure

```
monopi/
├── packages/
│   ├── monopi__core/              Shared types, registries, icons, i18n, and path helpers (compiled)
│   ├── monopi__cli/               Interactive TUI configurator (compiled)
│   ├── monopi__extension-*/      Split pi extension packages
│   ├── monopi__background-tasks/  Reactive background shell task package (raw .ts)
│   ├── monopi__diagnostics/       Prompt completion timing extension (raw .ts)
│   ├── monopi__subagents/         Subagent orchestration package (raw .ts)
│   ├── monopi__adaptive-routing/  Optional adaptive/delegated routing package (raw .ts)
│   ├── monopi__provider-catalog/  Provider catalog package (raw .ts)
│   ├── monopi__provider-cursor/   Cursor OAuth provider package (raw .ts)
│   ├── monopi__provider-ollama/   Ollama local + cloud provider package (raw .ts)
│   ├── monopi__web-remote/        `/remote` session sharing extension (raw .ts)
│   ├── monopi__web-client/        Remote session client library (compiled)
│   ├── monopi__web-server/        Remote session server library (compiled)
│   ├── monopi__shared-qna/        Shared Q&A TUI helper library (raw .ts)
│   ├── monopi__analytics-db/      SQLite schema and Drizzle ORM client for analytics data
│   ├── monopi__analytics-dashboard/ React dashboard for visualizing AI usage (private app)
│   ├── monopi__analytics-extension/ Analytics tracking extension for pi (raw .ts)
│   ├── monopi__docs/             Documentation site for monopi (private app)
│   ├── monopi__skills/           Curated skill directories
│   ├── monopi__agents/           AGENTS.md templates
│   └── monopi__monopi/          Installer CLI (npx @monopi/monopi)
├── docs/                       Full documentation
├── benchmarks/                 Performance benchmarks
├── .changeset/                 Pending MonoChange changesets
├── CHANGELOG.md                Release history
├── monochange.toml             Release automation config
└── .oxlintrc.json + .oxfmtrc.json                  Linter + formatter config
```

## License

MIT
