---
default: patch
---

Improve long-running session continuity and resume ergonomics.

- update `auto-session-name` to refresh titles when conversation focus shifts instead of freezing on the first prompt
- auto-send a `continue` follow-up after compaction so manual and automatic compaction flows continue working without extra input
- emit a shutdown message with a resumable session id hint (`pi --session <id>`) to make resume flows faster
