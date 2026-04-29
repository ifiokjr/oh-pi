---
default: patch
---

fix(providers): fix model persistence timing and restore login UI

Fixed model persistence by loading stored credentials at extension load time using `AuthStorage.create()`. This ensures models from logged-in providers are available in the registry before `resolveModelScope` runs, eliminating the "No models match pattern" warnings on startup.

Restored the provider login UI to use `ui.select` instead of `ui.custom`, matching the native UX of pi's built-in `/login` command with proper fuzzy search and keyboard navigation.

Added `/providers:logout` to the command description so it appears in help text.
