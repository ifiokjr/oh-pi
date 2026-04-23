---
default: patch
---

Fix two sources of typing lag in long-running pi sessions:

1. **Scheduler idle heartbeat**: The scheduler previously started a 1-second heartbeat interval on every `session_start`, even when no tasks were scheduled. Over time this added unnecessary event-loop wake-ups and disk I/O. It now lazily starts the heartbeat only when the first task is added, and stops it when the last task is removed.

2. **Compact-header per-render catalog scan**: The compact header rebuilt the full prompt/skill command list on every render (which fires on every keystroke). The catalog is now computed once at header mount and reused across renders.

This also tightens the runtime-churn benchmark so the isolated scheduler scenario must show exactly zero widget, footer, status, and notification churn when no tasks exist.
