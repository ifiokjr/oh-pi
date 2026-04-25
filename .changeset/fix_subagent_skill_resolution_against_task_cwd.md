---
default: patch
---

Fix subagent skill resolution against the task cwd for sync and async runs.

Explicit skills now resolve relative to the subagent task directory instead of the runtime/session cwd, so delegated runs can find project-local skills and inject the expected skill content.
