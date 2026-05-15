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

# Remove ant-colony package and port concepts to subagents

## Breaking Changes
- **Removed `@ifi/oh-pi-ant-colony` package entirely.** The ant colony extension and all related code have been deleted from the codebase.
- **Colony preset removed** from the CLI interactive installer.
- **Colony operator agent** (`colony-operator.md`) deleted.
- **Ant-colony auto-trigger guidance** removed from generated system prompts.

## Migration for existing users
Existing installations that include the `ant-colony` extension will have it **automatically cleaned up** on the next `oh-pi` config apply. The `writeExtensions` installer step now removes stale extension directories that are no longer in the config.

## New Features
- **Dynamic subagent creation** (`packages/subagents/dynamic-agent.ts`): Hosts can now create ephemeral agents on-the-fly without requiring a `.md` agent file on disk. Pass `systemPrompt`, `tools`, `skills`, `extensions`, `model`, and `thinking` at runtime.
- **`runDynamicAgent()`**: Convenience wrapper that creates a dynamic agent spec, runs it via the existing `runSync` infrastructure, and cleans up afterward.
- **Usage tracking hook** (`onUsage` callback in `RunSyncOptions`): The main session can now receive `usage` data when any subagent completes, enabling budget/cost tracking across subagent calls.
- **Stale extension cleanup**: The oh-pi installer now removes extension directories from `~/.pi/extensions/` that are no longer listed in the user's config, preventing broken references after package removals.

## Internal Changes
- Ported adaptive routing model selection concepts to `packages/subagents/model-routing.ts` (already existed; no functional change).
- Removed all ant-colony references from `package.json`, `vitest.config.ts`, CLI presets, locales, registry, and test files.
