---
default: patch
---

Remove conflicting `bash` passthrough tool from `@ifi/pi-background-tasks`.

The background-tasks extension was incorrectly registering a `bash` tool as a thin
passthrough, which conflicted with the actual `bash` tool registered by other
extensions like `@ifi/pi-bash-live-view` and `@ifi/pi-pretty`. The background tasks
package should only register `bg_task` and `bg_status` tools.

Also updates the runtime benchmark test to gracefully handle filtered extension
sets (`OH_PI_BENCH_EXTENSION_FILTER`) so it no longer fails when only a subset
of extensions is benchmarked.
