---
---
"@ifi/oh-pi": patch
"@ifi/oh-pi-agents": patch
"@ifi/oh-pi-cli": patch
"@ifi/oh-pi-context": patch
"@ifi/oh-pi-core": patch
"@ifi/oh-pi-docs": patch
"@ifi/oh-pi-extensions": patch
"@ifi/oh-pi-prompts": patch
"@ifi/oh-pi-skills": patch
"@ifi/oh-pi-themes": patch
"@ifi/pi-analytics-dashboard": patch
"@ifi/pi-analytics-db": patch
"@ifi/pi-analytics-extension": patch
"@ifi/pi-background-tasks": patch
"@ifi/pi-bash-live-view": patch
"@ifi/pi-diagnostics": patch
"@ifi/pi-extension-adaptive-routing": patch
"@ifi/pi-extension-subagents": patch
"@ifi/pi-plan": patch
"@ifi/pi-pretty": patch
"@ifi/pi-provider-catalog": patch
"@ifi/pi-provider-cursor": patch
"@ifi/pi-provider-ollama": patch
"@ifi/pi-remote-tailscale": patch
"@ifi/pi-shared-qna": patch
"@ifi/pi-spec": patch
"@ifi/pi-web-client": patch
"@ifi/pi-web-remote": patch
"@ifi/pi-web-server": patch
---

# Btw Markdown Formatting

Format `btw` output as Markdown and fix occasional context loss

**What changed:**

- Replaced the widget-based UI with an overlay (`ctx.ui.custom()`) supporting multi-turn chat input via `BtwOverlay` (Container + Input + Focusable).
- Replaced `streamSimple`/`completeSimple` with `createAgentSession` for a full side session with tools (read, bash, edit, write).
- Added real-time streaming via `session.subscribe()` with tool call tracking (`ToolCallInfo`, `renderToolCallLines`).
- Added `buildSeedMessages` / `buildSessionContext` for seeding the side session with main conversation context.
- Added `stripDynamicSystemPromptFooter` and `createBtwResourceLoader` for clean side session resource loading.
- Added close flow: when closing the overlay, user can "Keep side thread" or "Inject summary into main chat".
- Added `btw-thread-reset` resource type persistence.
- Transcript lines render Markdown via Pi's `Markdown` renderer with fallback to plain text wrapping.
- `/btw` with no arguments now offers "Continue previous conversation" or "Start fresh" via `ctx.ui.select()`.
- Commands `/btw:inject` and `/btw:summarize` still work as direct injection paths.
- The `--save` flag still persists visible BTW notes to the session.
- Removed `btw:new`/`qq:new` commands (replaced by `/btw` no-args "Start fresh" flow).

Based on https://github.com/mitsuhiko/agent-stuff by Armin Ronacher (MIT).