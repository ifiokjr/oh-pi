---
default: patch
---

fix(providers): use proper TUI components for provider login with height limiting and fuzzy search

Replaced `ui.select` with `ui.custom` using proper TUI components (`Container`, `Input`, `TruncatedText`, `Spacer`, `fuzzyFilter`) from `@mariozechner/pi-tui`. This provides:

- Height limiting: max 8 visible providers at a time (like pi's native `OAuthSelectorComponent`)
- Fuzzy search: type to filter providers by name, ID, env vars, or API type
- Keyboard navigation: Up/Down arrows (with wrap), Enter to confirm, Escape to cancel, Backspace to delete search
- Scroll indicators: shows position when list exceeds visible area
- Consistent UX with pi's built-in `/login` command
