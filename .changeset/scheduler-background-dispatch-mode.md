---
monopi: minor
---

# Scheduler Background Dispatch Mode

## Background Task Support

Added `dispatchMode` option to scheduled tasks, allowing tasks to run as subagents without interrupting the current conversation context.

### Problem

When a scheduled task fires (e.g., "Check CI"), it injects a prompt directly into the active session. This causes the agent to lose context of whatever work was in progress — the user's task is effectively abandoned.

### Solution

Tasks can now be dispatched in two modes:

- **`foreground`** (default): Current behavior — injects the prompt directly into the conversation
- **`background`**: Wraps the task prompt with subagent instructions, so the agent runs it silently in the background and only surfaces noteworthy results (failures, errors, actionable findings)

### Usage

```typescript
// Via the schedule_prompt tool
{
  action: "add",
  kind: "recurring",
  prompt: "Check CI status",
  duration: "5m",
  dispatchMode: "background"  // <-- New option
}

// Via the runtime API
runtime.addRecurringIntervalTask("Check CI", 60_000, {
  dispatchMode: "background"
});
```

### Changes

- Added `ScheduleTaskDispatchMode` type (`"foreground" | "background"`) to scheduler-shared
- Added `dispatchMode` field to `ScheduleTask` interface
- Added `dispatchMode` parameter to `SchedulePromptToolParams` tool schema
- Added `buildBackgroundPrompt()` method that wraps task prompts with subagent instructions
- Modified `dispatchTask()` to use background wrapping when `dispatchMode === "background"`
- Modified `taskMode()` to append `[bg]` indicator for background tasks
- Updated tool description and prompt guidelines to mention `dispatchMode`
- All new code has 100% test coverage (21 new tests)
