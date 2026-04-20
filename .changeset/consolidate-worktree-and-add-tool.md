---
default: minor
---

Consolidate worktree registry into `@ifi/oh-pi-core` and add `worktree` tool

- **Consolidate duplicated worktree implementations**: The worktree registry logic that was
  duplicated across `packages/extensions/extensions/worktree-shared.ts` and
  `packages/ant-colony/extensions/ant-colony/worktree-registry.ts` is now consolidated into
  `@ifi/oh-pi-core`. Both files are now thin re-exports from `@ifi/oh-pi-core`, eliminating
  code duplication and ensuring a single source of truth for worktree management.

- **Add `RepoWorktreeContext` and caching to core**: The lightweight context probe
  (which uses only `git rev-parse` without `git worktree list --porcelain`) and the async
  cache-based refresh functions (`getRepoWorktreeContext`, `getCachedRepoWorktreeContext`,
  `refreshRepoWorktreeContext`, etc.) are now available in `@ifi/oh-pi-core`, matching the
  full feature set previously only in the extensions package.

- **Add `worktree` tool**: Register a `worktree` tool alongside the existing `/worktree`
  command. The AI agent can now programmatically create, list, check status, and clean up
  pi-owned worktrees without needing to use the slash command. This addresses the problem
  where the `ant_colony` tool bypassed `/worktree` because commands are TUI-only.
  The tool supports `create`, `status`, `list`, and `cleanup` actions.

- **Fix `touchManagedWorktreeSeen` throttling**: The `saveWorktreeRegistry` function now
  clears the worktree snapshot cache after writes, and `touchManagedWorktreeSeen` now
  throttles updates to avoid excessive I/O (5-minute interval).