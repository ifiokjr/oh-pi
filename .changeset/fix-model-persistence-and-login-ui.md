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

# Fix Model Persistence And Login Ui

fix(providers): fix model persistence timing and restore login UI

Fixed model persistence by loading stored credentials at extension load time using `AuthStorage.create()`. This ensures models from logged-in providers are available in the registry before `resolveModelScope` runs, eliminating the "No models match pattern" warnings on startup.

Restored the provider login UI to use `ui.select` instead of `ui.custom`, matching the native UX of pi's built-in `/login` command with proper fuzzy search and keyboard navigation.

Added `/providers:logout` to the command description so it appears in help text.
