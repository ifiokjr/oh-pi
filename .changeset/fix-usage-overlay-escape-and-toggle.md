---
monopi: patch
---

Fix usage dashboard overlay not closable with Escape key

The usage dashboard overlay (`/usage` and `Ctrl+Shift+U`) was impossible
to close because `handleInput` matched raw `\x1B` which is also the start
of multi-byte terminal sequences (arrow keys, etc.).

Changes:
- Use `keybindings.matches(data, "tui.select.cancel")` instead of raw
  `\x1B` comparison for Escape detection (matching btw overlay pattern)
- Support toggle: pressing `Ctrl+Shift+U` (or `/usage`) while the overlay
  is open now closes it instead of opening a second overlay
- Track overlay handle via `onHandle` callback for visibility control