---
default: patch
---

The usage tracker now defers loading persisted cost history and rate-limit caches and reads those files asynchronously. This removes startup filesystem work while still preserving cached quota and 30-day cost data when the widget, commands, shortcut, or usage report need it.
