---
default: minor
---

Improve colony isolation and cost visibility:

- run ant-colony executions in isolated git worktrees by default (with shared-cwd fallback when unavailable)
- persist/report workspace metadata so users can see where colony edits were made
- resume colonies with saved workspace hints, including worktree re-attachment when possible
- emit ant inference usage events (`usage:record`) from colony workers/soldiers/scouts
- aggregate external/background inference in usage-tracker reports, widget, and session totals
- add tests for worktree isolation and external usage ingestion
