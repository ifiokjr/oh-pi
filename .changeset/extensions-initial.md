---
default: minor
---

### `@ifi/oh-pi-extensions` — Initial release

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
