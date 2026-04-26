---
default: patch
---

Fix subagent project agent discovery to cascade through parent workspaces.

Subagent agent and chain discovery now loads project-scoped definitions from every ancestor project agents directory, with the nearest project definition winning on name collisions while still keeping parent-only entries available.
