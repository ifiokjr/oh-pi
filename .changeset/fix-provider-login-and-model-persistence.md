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

# Fix Provider Login And Model Persistence

fix(provider-catalog): use native ui.select for provider login and persist models across instances

Replaced the overlay-based provider picker with pi's built-in `ui.select` component for the `/providers:login` command. This provides the same UX as the native `/login` command with built-in fuzzy search, proper keyboard navigation, and no popup issues.

Fixed model persistence by loading models from stored credentials into `runtimeState.models` on `session_start`. Previously, models from logged-in providers were only stored in-memory and lost between pi instances, causing patterns like `xiaomi/mimo-v2.5-pro` to show "No models match pattern" warnings.
