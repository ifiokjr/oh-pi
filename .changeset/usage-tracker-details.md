---
"@ifi/oh-pi-extensions": minor
"@ifi/oh-pi": minor
---

Enhance the usage tracker dashboard to provide CodexBar-style depth:

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
