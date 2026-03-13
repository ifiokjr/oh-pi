---
default: minor
---

Add scheduler extension with `/loop`, `/remind`, `/schedule`, and `/unschedule` commands:

- `/loop` creates recurring scheduled prompts with interval or cron expressions
- `/remind` creates one-time reminders with delay durations
- `/schedule` manages tasks via TUI manager or subcommands (list, enable, disable, delete, clear)
- `/unschedule` is an alias for `/schedule delete <id>`
- Exposes `schedule_prompt` LLM-callable tool for agent-driven scheduling
- Tasks run only when pi is idle; recurring tasks auto-expire after 3 days
- State is persisted to `.pi/scheduler.json` across sessions
- Supports both interval (5m, 2h) and cron expressions (5-field and 6-field)
- Max 50 active tasks with jitter to prevent thundering herd

Based on pi-scheduler by @manojlds (MIT).
