---
default: patch
---

Reduce usage-tracker idle startup churn by skipping widget redraw requests when deferred startup probe or persisted-state work does not change the widget's visible content.
