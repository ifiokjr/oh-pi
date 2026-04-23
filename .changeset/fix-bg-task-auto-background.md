---
default: patch
---

Remove auto-backgrounding from the `bash` tool override in `@ifi/pi-background-tasks`.

The extension no longer intercepts ordinary `bash` calls to promote them into
background tasks after a timeout. Instead, the `bash` tool passes through to
pi's built-in execution flow so output stays visible in the foreground.

Background task management remains available through `bg_task`, `bg_status`,
`/bg`, and `Ctrl+Shift+B` for commands that should explicitly run in the
background (e.g. dev servers, file watchers, log tails).
