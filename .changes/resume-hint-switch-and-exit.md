---
default: patch
---

Improve session resume guidance for long-running instances.

- extend `auto-session-name` to emit resume command hints on both `session_switch` and `session_shutdown`
- include both the direct form (`pi --session <id>`) and an alias-path hint (`pi resume <id>`) in the emitted message
- keep the existing compaction auto-continue and dynamic session title behavior intact
