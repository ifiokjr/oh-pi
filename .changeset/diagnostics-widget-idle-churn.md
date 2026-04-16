---
default: patch
---

Reduce diagnostics widget idle redraw churn by only running its elapsed-time refresh timer while a prompt is actively in progress. This removes the always-on one-second idle redraw loop that could multiply across several pi instances and contribute to watchdog event-loop warnings.
