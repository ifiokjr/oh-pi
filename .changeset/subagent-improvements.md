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

# Subagent Improvements: Caching, Auto-save, Inline Fields, Better Errors

## External Agent Caching & Auto-save

- Added bounded LRU cache for external agent resolution with mtime invalidation
- Discovered external agents (from .vscode, .claude, .opencode) are now auto-saved to `.pi/agents/<name>.md` for quick future lookup
- Export `clearExternalAgentCache()` for testing and manual invalidation

## Inline Agent Creation Enhancements

- SubagentParams now accepts `modelOverride`, `toolsOverride`, `skillsOverride`, and `thinkingOverride` for dynamic agent creation
- These fields are passed through to `createDynamicAgent` when the named agent doesn't exist

## Better Error Messages

- Agent resolution failures now suggest similar agent names (Levenshtein distance ≤3)
- Errors note when external config files exist in the workspace
- Hint to use `systemPrompt` for inline creation is included

## Parallel Execution

- Added `continueOnError` field to `ParallelStepSchema` / `ParallelStep`
- When `continueOnError: true`, partial failures are collected instead of aborting the entire parallel group
- Overrides `failFast` when explicitly set to `true`
