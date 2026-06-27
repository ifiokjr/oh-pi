---
default: minor
---

# Watch external agent config directories

- Added debounced watchers for existing `.vscode`, `.claude/agents`, `.opencode/agents`, and `.pi/agents` directories during external subagent resolution.
- Scoped cache invalidation to entries backed by changed directories and close watchers on session reset/shutdown.
