---
default: patch
---

Avoid `bash` tool conflicts between `@ifi/pi-bash-live-view` and `@ifi/pi-pretty`.

Both extensions were registering a tool named `bash`, which made them conflict when
loaded together via `pnpm pi:local`. They now expose explicit alternative tools
instead:

- `bash_live_view` for PTY-backed terminal rendering
- `bash_pretty` for formatted command output summaries

The built-in `bash` tool is left untouched, and regression tests now verify these
extensions can be loaded together without duplicate tool registrations.
