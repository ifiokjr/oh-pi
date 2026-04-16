---
default: patch
---

Reduce idle startup status churn by skipping initial no-op status clear writes for unseen status-bar keys while preserving real clears after visible status text has been shown.
