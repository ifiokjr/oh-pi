---
monopi: minor
---

# Allow projects to hide built-in subagents

- Added `.pi/settings.json` support for `subagents.excludeBuiltins: true`.
- When enabled, subagent discovery skips built-in and user-level agents so project agent lists stay focused.
