---
default: minor
---

# Make subagent fan-out limits configurable

- Added configurable subagent `maxParallel` and `maxConcurrency` limits.
- Environment variables (`PI_SUBAGENT_MAX_PARALLEL`, `PI_SUBAGENT_MAX_CONCURRENCY`) take precedence and can raise or lower limits.
- User settings can raise or lower limits, while project `.pi/settings.json` values can only lower the built-in defaults.
