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

# Fix Provider Login Scrollable Ui

fix(providers): use proper TUI components for provider login with height limiting and fuzzy search

Replaced `ui.select` with `ui.custom` using proper TUI components (`Container`, `Input`, `TruncatedText`, `Spacer`, `fuzzyFilter`) from `@mariozechner/pi-tui`. This provides:

- Height limiting: max 8 visible providers at a time (like pi's native `OAuthSelectorComponent`)
- Fuzzy search: type to filter providers by name, ID, env vars, or API type
- Keyboard navigation: Up/Down arrows (with wrap), Enter to confirm, Escape to cancel, Backspace to delete search
- Scroll indicators: shows position when list exceeds visible area
- Consistent UX with pi's built-in `/login` command
