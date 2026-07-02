---
monopi: minor
---

Rewrite `btw` extension as overlay-based side session with tools

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