---
default: minor
---

Add option to disable emoji icons and use plain ASCII fallbacks.

Three ways to enable plain icon mode (in priority order):

1. **Environment variable**: `OH_PI_PLAIN_ICONS=1`
2. **CLI flag**: `pi --plain-icons`
3. **settings.json**: `{ "plainIcons": true }` (global `~/.pi/agent/settings.json` or project-local `.pi/settings.json`)

This replaces all emoji icons (🐜, ✅, ❌, 🚀, etc.) with ASCII-safe equivalents (`[ant]`, `[ok]`, `[ERR]`, `[>>]`, etc.) across all oh-pi extensions — helpful for terminals or fonts that don't render Unicode emoji correctly.

Closes #24.
