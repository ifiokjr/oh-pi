---
default: patch
---

Reduce usage-tracker widget redraw churn by removing the fixed refresh timer, re-rendering on real usage/probe/session changes instead, and keeping the widget aligned with the latest active session after switches.
