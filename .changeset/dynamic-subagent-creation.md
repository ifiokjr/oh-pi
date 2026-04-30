---
default: minor
---

# Dynamic Subagent Creation & External Agent Protocols

@ifi/oh-pi-subagents now supports inline dynamic agent creation via the `systemPrompt` parameter and external agent protocol resolution.

## Inline Dynamic Agent Creation

LLMs can now create subagents on-the-fly by passing `systemPrompt` alongside the agent name. When the named agent doesn't exist, the system automatically creates it as a temporary dynamic agent.

**Single mode:** `{ "agent": "devenv-scout", "systemPrompt": "You are a devenv config expert...", "task": "Find files" }`

**Chain steps and parallel tasks** also support inline `systemPrompt` for dynamic per-step agent creation.

## External Agent Protocol Resolution

Resolves agent definitions from standard external locations:

1. **VS Code** — `.vscode/agents.json`
2. **Claude Code** — `.claude/agents/<name>.md`
3. **Open Code** — `.opencode/agents/<name>.md`
4. **pi project** — `.pi/agents/<name>.md`

Priority: pi-project > VS Code > Claude Code > Open Code.
