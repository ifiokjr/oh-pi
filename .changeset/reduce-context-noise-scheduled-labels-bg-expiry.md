---
default: minor
---

Reduce context noise from watchdog/safe-mode messages, add bg task default expiry, and label scheduled task runs

- **Background tasks**: Add a default 10-minute expiry to all background tasks. Expired tasks are automatically stopped and logged. Set `expiresAt: null` to disable. The expiry is displayed in the dashboard and spawn output.
- **Background task output events**: No longer trigger agent turns (only exit events do), reducing unnecessary LLM context consumption from routine output notifications.
- **Scheduler dispatches**: Use `sendMessage` with a custom type (`pi-scheduler:dispatched`) instead of `sendUserMessage`. Scheduled task runs now render with a distinct "⏰ Scheduled run" label in the TUI, showing the task ID, mode, and run count, instead of appearing as regular user messages.