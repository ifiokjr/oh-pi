---
default: patch
---

Fix worktree tool renderCall/renderResult returning strings instead of Widget instances

The worktree tool's `renderCall` and `renderResult` returned plain strings
instead of TUI `Widget` instances. `Box.render` calls `child.render()` on
every child, so a bare string caused `TypeError: child.render is not a function`.