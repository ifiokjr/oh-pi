---
default: patch
---

The footer worktree indicator now shows the worktree folder name alongside the branch name, making it easy to identify which worktree you're working in. When the folder name differs from the branch (common with slash-containing branch names), both are displayed as `wt <folder> (<branch>)`. When they match, only the branch is shown. Detached worktrees show just the folder name.
