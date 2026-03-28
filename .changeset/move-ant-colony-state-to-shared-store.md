---
default: patch
---

Move ant-colony runtime state and isolated worktree directories out of repository-local `.ant-colony/` folders into a shared pi agent storage root under `~/.pi/agent/ant-colony/...` by default. Legacy local colony state is migrated automatically, `.gitignore` is no longer modified in the default shared mode, and an explicit `storageMode: "project"` opt-in remains available for users who prefer the old repo-local behavior.
