---
"@ifi/oh-pi": minor
"@ifi/oh-pi-agents": minor
"@ifi/oh-pi-cli": minor
"@ifi/oh-pi-context": minor
"@ifi/oh-pi-core": minor
"@ifi/oh-pi-docs": minor
"@ifi/oh-pi-extensions": minor
"@ifi/oh-pi-prompts": minor
"@ifi/oh-pi-skills": minor
"@ifi/oh-pi-themes": minor
"@ifi/pi-analytics-dashboard": minor
"@ifi/pi-analytics-db": minor
"@ifi/pi-analytics-extension": minor
"@ifi/pi-background-tasks": minor
"@ifi/pi-bash-live-view": minor
"@ifi/pi-diagnostics": minor
"@ifi/pi-extension-adaptive-routing": minor
"@ifi/pi-extension-subagents": minor
"@ifi/pi-plan": minor
"@ifi/pi-pretty": minor
"@ifi/pi-provider-catalog": minor
"@ifi/pi-provider-cursor": minor
"@ifi/pi-provider-ollama": minor
"@ifi/pi-remote-tailscale": minor
"@ifi/pi-shared-qna": minor
"@ifi/pi-spec": minor
"@ifi/pi-web-client": minor
"@ifi/pi-web-remote": minor
"@ifi/pi-web-server": minor
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
