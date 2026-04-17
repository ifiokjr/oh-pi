---
default: minor
---

Add a reactive background task extension for shell watchers.

- add the new `@ifi/pi-background-tasks` package with `/bg`, `Ctrl+Shift+B`, a richer multi-pane dashboard, `bg_task`, and compatibility `bash`/`bg_status` tooling
- move the existing `bg-process` entrypoint in `@ifi/oh-pi-extensions` onto the new shared runtime
- include the new package in the default `@ifi/oh-pi` installer package list and document it in the repo package listings
