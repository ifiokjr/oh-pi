---
default: patch
---

Reduce background UI churn by deduplicating repeated scheduler and watchdog status-bar updates, and by slowing footer PR polling to match the existing GitHub probe cooldown.
