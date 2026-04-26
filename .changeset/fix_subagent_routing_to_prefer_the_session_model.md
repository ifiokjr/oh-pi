---
default: patch
---

Fix subagent routing to prefer the current session model before delegated adaptive routing.

Subagents without an explicit runtime or frontmatter model now inherit the active session model when it is available, instead of silently switching providers through delegated category routing.
