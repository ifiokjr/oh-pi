---
default: patch
---

The performance watchdog now records but ignores the first automatic startup sample for alerting. This avoids warnings or automatic safe mode from expected warm-up CPU and event-loop spikes before extensions have finished settling.
