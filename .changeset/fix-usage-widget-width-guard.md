---
default: patch
---

Fix usage-tracker widget line truncation by respecting the terminal `width` in widget `render(width)` and applying `truncateAnsi` to each rendered line. This prevents crashes from overlong widget lines when multiple provider bars are displayed in narrow terminals.
