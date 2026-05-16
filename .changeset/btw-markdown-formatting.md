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

- Changed `buildBtwMessageContent` and `formatThread` to generate Markdown instead of plain text.
- Updated `BTW_SYSTEM_PROMPT` to instruct the model to output Markdown.
- Replaced the `btw-note` message renderer's `Text` widget with a `Container` that holds a `Text` header and a `Markdown` body.
- Fixed a bug where `session_tree` events (fired when the main session updates its tree) would unconditionally call `restoreThread()`, which aborts all active BTW slots and clears the thread. The handler now skips the restore while any slot is still active, preventing concurrent `/btw` exchanges from being lost.
