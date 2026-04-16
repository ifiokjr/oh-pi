---
default: patch
---

Reduce worktree startup overhead by splitting lightweight context refreshes from full worktree inventory snapshots, throttling managed-worktree touch writes, and extending startup benchmarks to track both paths.
