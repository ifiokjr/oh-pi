---
default: patch
---

fix(providers): use scrollable searchable list for provider login and add logout command

Replaced `ui.select` with `ui.custom` for the `/providers:login` provider picker, implementing a proper scrollable searchable list with height limiting (max 8 visible items), fuzzy filtering, and keyboard navigation matching pi's native OAuth selector UX.

Added `/providers:logout` command to remove stored provider credentials and clear cached state.
