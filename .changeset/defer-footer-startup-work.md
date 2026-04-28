---
default: patch
---

The custom footer now waits until after session startup to aggregate session usage, refresh worktree metadata, and probe for pull requests. This keeps large sessions responsive during startup while still updating token totals, costs, worktree context, and PR links shortly after the footer renders.
