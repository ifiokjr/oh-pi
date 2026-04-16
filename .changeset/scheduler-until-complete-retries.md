---
default: patch
---

Add scheduler support for completion-aware retries.

- extend `schedule_prompt add` with `continueUntilComplete`, `completionSignal`, `retryInterval`, and `maxAttempts`
- keep compatible tasks in an `awaiting_completion` state and evaluate completion on `agent_end` before deleting or rescheduling
- persist per-task completion settings and outcome snippets for better `/schedule` and tool observability
