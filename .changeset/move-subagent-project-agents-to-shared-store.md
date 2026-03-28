---
default: patch
---

Move subagent project-scope agent and chain definitions out of repo-local `.pi/agents/` folders into a shared pi agent directory under `~/.pi/agent/subagents/project-agents/...` by default. Legacy project-local definitions are migrated automatically when discovered, mirrored parent workspaces are still searched for project overrides, and a `projectAgentStorageMode: "project"` opt-in keeps the old repo-local behavior available.
