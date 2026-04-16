---
default: patch
---

Add a PR-gated runtime churn benchmark suite that mounts widgets and footers, advances an idle window, and ranks extensions by redraw and status-write churn. This makes steady-state performance issues easier to catch, including cases that can later surface as watchdog event-loop warnings even when startup time looks healthy.
