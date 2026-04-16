<div align="center">

<img src="./logo.svg" width="180" alt="oh-pi logo"/>

# 🐜 oh-pi

**One command to supercharge [pi-coding-agent](https://github.com/badlogic/pi-mono).**

Like oh-my-zsh for pi — but with an autonomous ant colony.

[![CI](https://github.com/ifiokjr/oh-pi/actions/workflows/ci.yml/badge.svg)](https://github.com/ifiokjr/oh-pi/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/ifiokjr/oh-pi/graph/badge.svg?branch=main)](https://codecov.io/gh/ifiokjr/oh-pi)
[![license](https://img.shields.io/github/license/ifiokjr/oh-pi)](./LICENSE)
[![node](https://img.shields.io/node/v/@ifi/oh-pi)](https://nodejs.org)

```bash
npx @ifi/oh-pi
```

</div>

---

## 30-Second Start

```bash
npx @ifi/oh-pi       # install all extensions, themes, prompts, and skills
pi                    # start coding
```

oh-pi installs the full bundle into pi in one command. See [Installer Options](#installer-options)
for project-scoped installs and version pinning.

### Fork-based Git install

If you keep a personal fork with custom oh-pi changes, you can also install the repo root directly as a
pi package:

```bash
pi install https://github.com/<you>/oh-pi@<tag-or-commit>
```

That git-install path is meant for personal fork distribution across machines. It aggregates the repo's
shareable runtime packages directly from the clone so you do not have to mirror local workspace paths.
Published npm installs remain the better default for stable releases.

## Packages

This is a monorepo. Install everything at once with `npx @ifi/oh-pi`, or pick individual packages.

| Package                                          | Description                        | Install                                |
| ------------------------------------------------ | ---------------------------------- | -------------------------------------- |
| [`@ifi/oh-pi`](./packages/oh-pi)                 | One-command installer for all pkgs | `npx @ifi/oh-pi`                       |
| [`@ifi/oh-pi-core`](./packages/core)             | Shared types, registries, i18n     | (library, not installed directly)      |
| [`@ifi/oh-pi-extensions`](./packages/extensions)          | Core extension pack (see below)             | `pi install npm:@ifi/oh-pi-extensions`      |
| [`@ifi/pi-extension-adaptive-routing`](./packages/adaptive-routing) | Optional adaptive + delegated routing       | `pi install npm:@ifi/pi-extension-adaptive-routing` |
| [`@ifi/oh-pi-ant-colony`](./packages/ant-colony)          | Multi-agent swarm extension                 | `pi install npm:@ifi/oh-pi-ant-colony`      |
| [`@ifi/pi-diagnostics`](./packages/diagnostics)           | Prompt completion timing extension          | `pi install npm:@ifi/pi-diagnostics`         |
| [`@ifi/pi-extension-subagents`](./packages/subagents)     | Full-featured subagent delegation extension | `pi install npm:@ifi/pi-extension-subagents` |
| [`@ifi/pi-plan`](./packages/plan)                         | Branch-aware planning mode extension        | `pi install npm:@ifi/pi-plan`               |
| [`@ifi/pi-shared-qna`](./packages/shared-qna)             | Shared Q&A TUI helpers                      | (library, not installed directly)           |
| [`@ifi/pi-spec`](./packages/spec)                         | Native spec-driven workflow with `/spec`    | `pi install npm:@ifi/pi-spec`               |
| [`@ifi/pi-provider-catalog`](./packages/providers)        | Experimental OpenCode-backed provider catalog | `pi install npm:@ifi/pi-provider-catalog` |
| [`@ifi/pi-provider-cursor`](./packages/cursor)            | Experimental Cursor OAuth provider            | `pi install npm:@ifi/pi-provider-cursor`  |
| [`@ifi/pi-provider-ollama`](./packages/ollama)            | Experimental Ollama local + cloud provider    | `pi install npm:@ifi/pi-provider-ollama`  |
| [`@ifi/oh-pi-themes`](./packages/themes)                  | 6 color themes                              | `pi install npm:@ifi/oh-pi-themes`          |
| [`@ifi/oh-pi-prompts`](./packages/prompts)                | 10 prompt templates                         | `pi install npm:@ifi/oh-pi-prompts`         |
| [`@ifi/oh-pi-skills`](./packages/skills)                  | 12 skill packs                              | `pi install npm:@ifi/oh-pi-skills`          |
| [`@ifi/oh-pi-agents`](./packages/agents)                  | 5 AGENTS.md templates                       | (used by CLI only)                          |

`@ifi/pi-extension-adaptive-routing`, `@ifi/pi-provider-catalog`, `@ifi/pi-provider-cursor`, and
`@ifi/pi-provider-ollama` stay opt-in for now and are **not** installed by `npx @ifi/oh-pi`.
They are intentionally shipped as separate optional packages.

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

oh-pi tracks upstream pi fairly closely and currently treats **pi `0.56.1` or newer** as the
minimum supported runtime baseline for packages that integrate directly with the pi SDK.

Policy:

- new oh-pi releases target the current pi runtime family first
- compatibility with older pi builds is best-effort unless explicitly documented otherwise
- peer dependency ranges on pi-facing packages express the minimum supported baseline more clearly
- higher-risk runtime integrations should gain smoke coverage before broadening compatibility claims
- CI smoke-checks both the minimum supported baseline (`0.56.1`) and a pinned current upstream runtime (`0.64.0`)

### Documentation reuse with MDT

This repo uses [MDT](https://github.com/ifiokjr/mdt) to keep selected markdown sections and exported
TypeScript API docs synchronized from shared provider blocks under `docs/mdt/`.

<!-- {=repoMdtUsageRuleDocs} -->

Use MDT through `pnpm mdt ...`, not a globally installed `mdt` binary. This keeps documentation
reuse commands pinned to the repo's declared `@ifi/mdt` version and makes local runs, CI, and agent
instructions consistent.

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

CI runs `pnpm mdt check` so provider and consumer blocks stay in sync with the repo-pinned MDT
version.

<!-- {/repoMdtCiDocs} -->

---

## Configuration

### Plain Icons (disable emoji)

If emoji icons render poorly in your terminal (wrong font, garbled glyphs, misaligned widths), you
can switch to ASCII-safe fallbacks. All emoji like 🐜 ✅ ❌ 🚀 become plain text like `[ant]`
`[ok]` `[ERR]` `[>>]`.

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
  "plainIcons": true
  // ...
}
```

---

## Extensions

### 📦 Git Guard (`git-guard`) — **default: on**

Prevents accidental code loss by auto-creating stash checkpoints before the agent makes changes.
Warns when the repo is dirty (uncommitted changes) and notifies when operations complete.

**How it works:** On `session_start`, checks `git status`. If dirty, creates `git stash` with a
timestamped name. On `tool_result` for write/edit operations, tracks changed files.

### 📝 Auto Session Name (`auto-session-name`) — **default: on**

Automatically names sessions based on the first user message. Instead of "Session
2025-03-04T10:33:35", you get "Refactor auth to JWT" or "Fix CI pipeline".

**How it works:** Listens for the first `turn_end` event, extracts a short title from the user's
initial prompt, and calls `pi.setSessionName()`.

### 📊 Custom Footer (`custom-footer`) — **default: on**

Replaces the default pi footer with a rich status bar showing real-time metrics:

```
◆ claude-sonnet-4 | 12.3k/8.1k $0.42 62% | ⏱3m12s | ⌂ projects/oh-pi | ⎇ main
```

**Shows:** Model name with thinking-level indicator, input/output tokens, accumulated cost, context
window %, elapsed time, working directory, git branch, and repo/worktree context when available.

**How it works:** Uses `ctx.ui.setFooter()` with a component that reads
`ctx.sessionManager.getBranch()` for token/cost data and `footerData.getGitBranch()` for git info.
Auto-refreshes every 30s.

### ⏱ Diagnostics (`diagnostics`) — **default: on**

Adds prompt-level completion diagnostics so you can see when a prompt started, when it finished,
how long it took, and how each assistant turn progressed.

**Surfaces:**

- widget below the editor showing the active prompt or the last completed prompt
- session log entry after each prompt finishes with human-readable start/end timestamps
- expanded per-turn timing details for prompts that needed multiple assistant turns
- `Ctrl+Shift+D` shortcut and `/diagnostics [status|toggle|on|off]`

**How it works:** Reuses the same timestamp/duration formatting as `tool-metadata`, tracks
`before_agent_start`, `turn_end`, and `agent_end`, then emits a custom diagnostic message when the
agent goes idle for that prompt.

### ⚡ Compact Header (`compact-header`) — **default: on**

Replaces the verbose default startup header with a dense one-liner showing model, provider, thinking
level, and extension count.

### 🔄 Auto Update (`auto-update`) — **default: on**

Checks npm for newer versions of oh-pi on startup. If an update is available, shows a notification
with the new version and install command. Never blocks — fully async.

**How it works:** On `session_start`, runs `npm view oh-pi version` in the background via
`pi.exec()`. Compares with the local version using semver.

### ⌨️ External Editor (`external-editor`) — **default: on**

Adds a discoverable `/external-editor` command and a `Ctrl+Shift+E` shortcut for opening the
current draft in `$VISUAL` or `$EDITOR`, then syncing the saved text back into pi.

**Commands:** `/external-editor` | `/external-editor status`

**Notes:** This complements pi's built-in `app.editor.external` binding (`Ctrl+G` by default).
Users who want a different primary key can still remap that binding in `keybindings.json`.

### 🌲 Worktree (`worktree`) — **default: on**

Adds centralized git worktree awareness for oh-pi. It detects whether the current checkout is the
main repo or a linked worktree, shows when the current worktree is pi-owned, and tracks owner +
purpose metadata for pi-created worktrees.

**Commands:** `/worktree` | `/worktree status` | `/worktree list` | `/worktree open [branch|path]` | `/worktree create <branch> [purpose]` | `/worktree cleanup <branch|path|id|all>`

**Behavior:** pi-owned worktrees are created under shared pi storage, namespaced by the canonical
repo root. Cleanup focuses on pi-owned worktrees only and leaves external/manual worktrees alone
unless you explicitly intervene.

### ⏳ Background Process (`bg-process`) — **default: off**

Automatically backgrounds long-running commands (dev servers, builds, test suites). When a command
exceeds a 10-second timeout, it's moved to the background and the agent gets the PID + log file
path.

**How it works:** Overrides the built-in `bash` tool. Spawns commands with a timer — if they're
still running after 10s, detaches them and writes output to `/tmp/oh-pi-bg-*.log`. Provides a
`bg_status` tool for listing, viewing logs, and stopping background processes.

```
Agent: bash npm run dev
→ Command still running after 10s, moved to background.
  PID: 12345 | Log: /tmp/oh-pi-bg-1709654321.log
  ⏳ You will be notified automatically when it finishes.
```

**Commands:** `bg_status list` | `bg_status log --pid 12345` | `bg_status stop --pid 12345`

### 🧭 Adaptive Routing (`adaptive-routing`) — **optional package**

Adaptive routing now ships as its own package so users can opt into routing behavior explicitly:

```bash
pi install npm:@ifi/pi-extension-adaptive-routing
```

It adds `/route` controls, local routing telemetry, and delegated startup categories that subagents
and ant-colony can use for provider assignment when no explicit model override is set.

### 💰 Usage Tracker (`usage-tracker`) — **default: off**

<!-- {=extensionsUsageTrackerOverview} -->

The usage-tracker extension is a CodexBar-inspired provider quota and cost monitor for pi. It
shows provider-level rate limits for Anthropic, OpenAI, and Google using pi-managed auth, while
also tracking per-model token usage and session costs locally.

<!-- {/extensionsUsageTrackerOverview} -->

<!-- {=extensionsUsageTrackerPersistenceDocs} -->

Usage-tracker persists rolling 30-day cost history and the last known provider rate-limit snapshot
under the pi agent directory. That lets the widget and dashboard survive restarts and keep showing
recent subscription windows when a live provider probe is temporarily rate-limited or unavailable.

<!-- {/extensionsUsageTrackerPersistenceDocs} -->

**Widget** (always visible above editor):

```
Claude [████████░░░░] 67% ↻in 3d 2h │ 💰$0.42 │ 12.3k/8.1k
```

**`/usage` overlay** (`Ctrl+U`):

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
- `Ctrl+U` as a shortcut for the same overlay
- `/usage-toggle` to show or hide the widget
- `/usage-refresh` to force fresh provider probes
- `usage_report` so the agent can answer quota and spend questions directly

<!-- {/extensionsUsageTrackerCommandsDocs} -->

### 🐜 Ant Colony (`ant-colony`) — **default: off**

The headline feature. A multi-agent swarm modeled after real ant ecology — deeply integrated into
pi's SDK. See the [Ant Colony section](#-ant-colony-1) below for full documentation.

---

## 🐜 Ant Colony

A multi-agent swarm modeled after real ant ecology — deeply integrated into pi's SDK.

```
You: "Refactor auth from sessions to JWT"

oh-pi:
  🔍 Scout ants explore codebase (haiku — fast, cheap)
  📋 Task pool generated from discoveries
  ⚒️  Worker ants execute in parallel (sonnet — capable)
  🛡️ Soldier ants review all changes (sonnet — thorough)
  ✅ Done — report auto-injected into conversation
```

### Colony Lifecycle

`SCOUTING → (if needed) PLANNING_RECOVERY → WORKING → REVIEWING → DONE`

### Architecture

Each ant is an in-process `AgentSession` (pi SDK), not a child process:

```
pi (main process)
  └─ ant_colony tool
       └─ queen.ts → runColony()
            └─ spawnAnt() → createAgentSession()
                 ├─ session.subscribe() → real-time token stream
                 ├─ Zero startup overhead (shared process)
                 └─ Shared auth & model registry
```

### Why Ants?

| Real Ants             | oh-pi                                              |
| --------------------- | -------------------------------------------------- |
| Scout finds food      | Scout scans codebase, identifies targets           |
| Pheromone trail       | `.ant-colony/pheromone.jsonl` — shared discoveries |
| Worker carries food   | Worker executes task on assigned files             |
| Soldier guards nest   | Soldier reviews changes, requests fixes            |
| More food → more ants | More tasks → higher concurrency (auto-adapted)     |
| Pheromone evaporates  | 10-minute half-life — stale info fades             |

### Adaptive Concurrency

```
Cold start     →  ceil(max/2) ants (fast ramp-up)
Exploration    →  +1 each wave, monitoring throughput
Throughput ↓   →  lock optimal, stabilize
CPU > 85%      →  reduce immediately
429 rate limit →  -1 concurrency + backoff (2s→5s→10s cap)
Tasks done     →  scale down to minimum
```

### Real-time UI

- **Status bar** — tasks done, active ants, tool calls, output tokens, cost, elapsed time
- **Ctrl+Shift+A** — overlay panel with task list, active ant streams, colony log
- `/colony-stop` to abort a running colony

### Auto-trigger

The LLM automatically deploys the colony when appropriate:

- **≥3 files** need changes → colony
- **Parallel workstreams** possible → colony
- **Single file** change → direct execution (no overhead)

---

## Setup Modes

| Mode          | Steps | For                               |
| ------------- | ----- | --------------------------------- |
| 🚀 **Quick**  | 3     | Pick provider → enter key → done  |
| 📦 **Preset** | 2     | Choose a role profile → enter key |
| 🎛️ **Custom** | 6     | Pick everything yourself          |

### Presets

|                | Theme      | Thinking | Includes                                 |
| -------------- | ---------- | -------- | ---------------------------------------- |
| ⚫ Full Power  | oh-pi Dark | high     | Recommended extensions + bg-process + ant-colony |
| 🔴 Clean       | Default    | off      | No extensions, just core                 |
| 🐜 Colony Only | oh-pi Dark | medium   | Ant-colony with minimal setup            |

### Providers

Anthropic · OpenAI · Google Gemini · Groq · OpenRouter · xAI · Mistral

---

## Skills

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

| Skill                      | What it does                                        |
| -------------------------- | --------------------------------------------------- |
| `quick-setup`              | Detect project type, generate .pi/ config           |
| `debug-helper`             | Error analysis, log interpretation, profiling       |
| `git-workflow`             | Branching, commits, PRs, conflict resolution        |
| `rust-workspace-bootstrap` | Scaffold Rust workspaces with knope, devenv, CI/CD  |
| `flutter-serverpod-mvp`    | Scaffold full-stack Flutter + Serverpod MVPs        |

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

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contributor workflow, changeset requirements, and PR guidelines.

### Commands

```bash
pnpm build               # Build every workspace package that exposes a build script
pnpm typecheck           # Type check with tsgo (fast)
pnpm test                # Run all tests
pnpm test:coverage       # Run tests with repo-wide coverage reporting
pnpm test:patch-coverage # Enforce 100% patch coverage from coverage/lcov.info
pnpm lint                # Biome lint + format check
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

That keeps the repo-wide floor honest while still requiring new code paths in a PR to be fully
covered. CI uses the same `pnpm test:patch-coverage` command on pull requests, so local results and
CI results stay aligned.

### Test a local checkout in pi

Use the repo-local source switcher to flip pi between the published npm packages and the packages in
whatever checkout or worktree you want to test.

```bash
pnpm pi:local                             # point pi at this checkout
pnpm pi:published                         # switch back to published npm packages
pnpm pi:switch local -- --path /tmp/oh-pi-branch
pnpm pi:switch remote -- --version 0.4.4
pnpm pi:switch local -- --pi-local        # write into the current project's .pi/settings.json
pnpm pi:switch status                     # show the current managed package sources
```

What it does:

- rewrites only the managed oh-pi package sources in your pi settings
- preserves package-specific config objects already in `settings.json`, while refreshing local package manifests so newly added extensions like `worktree` are picked up
- runs `pi install` for newly added managed packages and `pi update` for packages you already had configured
- includes the experimental provider packages in addition to the main installer set, including `@ifi/pi-provider-catalog`
- lets you validate a branch or detached worktree before you publish

After switching, fully restart `pi`. Do not rely on `/reload` for source switches because it can
keep previously loaded package modules alive.

This is intended to be the normal development loop for testing a branch locally before cutting a
release.

### Changesets

**Every change must include a changeset.** This is enforced in CI.

```bash
knope document-change
```

This creates a file in `.changeset/` describing the change. Because this repo uses lockstep
versioning and a single knope `[package]`, changeset frontmatter must use **only** `default` as
the key:

```md
---
default: patch
---
```

Do not use package names like `@ifi/oh-pi` or `@ifi/oh-pi-extensions` in changeset frontmatter
here — knope ignores those entries in this repo.

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

The release script runs all CI/security checks (lint, security, typecheck, test, build) before
calling `knope release`. Use `--dry-run` to preview without making changes.

### Project Structure

```
oh-pi/
├── packages/
│   ├── core/                   Shared types, registry, i18n (compiled)
│   ├── cli/                    TUI configurator binary (compiled)
│   ├── extensions/             9 pi extensions (raw .ts)
│   ├── ant-colony/             Multi-agent swarm extension (raw .ts)
│   ├── subagents/              Subagent orchestration package (raw .ts)
│   ├── shared-qna/             Shared Q&A TUI helper library (raw .ts)
│   ├── plan/                   Planning mode extension (raw .ts)
│   ├── spec/                   Native spec-driven workflow package (raw .ts)
│   ├── cursor/                 Experimental Cursor OAuth provider package (raw .ts)
│   ├── ollama/                 Experimental Ollama local + cloud provider package (raw .ts)
│   ├── themes/                 6 JSON theme files
│   ├── prompts/                10 markdown prompt templates
│   ├── skills/                 12 skill directories
│   ├── agents/                 5 AGENTS.md templates
│   └── oh-pi/                  Installer CLI (npx @ifi/oh-pi)
├── docs/                  Full documentation
├── benchmarks/            Performance benchmarks
├── .changeset/            Pending changesets (knope)
├── CHANGELOG.md           Release history
├── knope.toml             Release automation config
└── biome.json             Linter + formatter config
```

## License

MIT
