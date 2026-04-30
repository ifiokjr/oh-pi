---
default: minor
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
