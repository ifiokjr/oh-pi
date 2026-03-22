---
default: patch
---

fix(scheduler): harden `/loop` against runaway recurring schedules

- Reject cron schedules that run more frequently than once per minute
- Prevent unsafe cron parsing fallback from misreading invalid 6-field cron as 5-field
- Sanitize loaded scheduler tasks (cap to `MAX_TASKS`, drop unsafe cron entries, clamp unsafe intervals)
- Harden recurring dispatch to self-heal invalid interval values and avoid pathological next-run loops
- Add a global scheduler dispatch fuse (max 6 task dispatches per minute) to prevent burst floods
- Improve cron-related error/help text to call out the 1-minute minimum cadence
