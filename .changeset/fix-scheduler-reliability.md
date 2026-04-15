---
default: patch
---

Improve scheduler reliability by keeping it active across session churn, making manual `Run now` actions immediately runnable, and shortening recurring task expiry defaults to 24 hours with a configurable expiry for recurring monitors.
