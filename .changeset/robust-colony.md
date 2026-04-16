---
default: patch
---

Improve error reporting and robustness for ant colony and subagent swarms.

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
