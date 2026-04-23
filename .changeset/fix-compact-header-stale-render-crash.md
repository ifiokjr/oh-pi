---
default: patch
---

Fix stale extension context crash in compact-header on quit.

`pi.getThinkingLevel()` and `ctx.model` both call `assertActive()` on the
extension runner and throw `"This extension instance is stale after session
replacement or reload."` if accessed after the runner is invalidated.

The TUI render loop schedules its final render via `setTimeout`, which fires
during pi's `drainInput` shutdown window — after `extensionRunner.invalidate()`
but before `process.exit(0)`. Any `render()` callback that calls back into
`pi.*` or `ctx.*` at that point crashes the process instead of exiting cleanly.

`commandCatalog` was already hoisted out of `render()` in a previous fix, but
`ctx.model` and `pi.getThinkingLevel()` were still called on every render tick.
Both are now captured as plain values at `session_start` time, outside the
render closure, so the render function is free of all assertActive-guarded calls.
