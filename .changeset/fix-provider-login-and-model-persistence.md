---
default: patch
---

fix(provider-catalog): use native ui.select for provider login and persist models across instances

Replaced the overlay-based provider picker with pi's built-in `ui.select` component for the `/providers:login` command. This provides the same UX as the native `/login` command with built-in fuzzy search, proper keyboard navigation, and no popup issues.

Fixed model persistence by loading models from stored credentials into `runtimeState.models` on `session_start`. Previously, models from logged-in providers were only stored in-memory and lost between pi instances, causing patterns like `xiaomi/mimo-v2.5-pro` to show "No models match pattern" warnings.
