---
"@ifi/oh-pi-extensions": patch
---

Format `btw` output as Markdown and fix occasional context loss

**What changed:**

- Changed `buildBtwMessageContent` and `formatThread` to generate Markdown instead of plain text.
- Updated `BTW_SYSTEM_PROMPT` to instruct the model to output Markdown.
- Replaced the `btw-note` message renderer's `Text` widget with a `Container` that holds a `Text` header and a `Markdown` body.
- Fixed a bug where `session_tree` events (fired when the main session updates its tree) would unconditionally call `restoreThread()`, which aborts all active BTW slots and clears the thread. The handler now skips the restore while any slot is still active, preventing concurrent `/btw` exchanges from being lost.
