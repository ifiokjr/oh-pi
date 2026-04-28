---
default: patch
---

Subagents now clean old chain directories and artifacts asynchronously after startup instead of scanning and deleting files synchronously during session initialization. This keeps startup responsive in workspaces with large artifact directories while preserving automatic cleanup.
