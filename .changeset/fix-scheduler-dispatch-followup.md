---
default: patch
---

Fix scheduled task dispatching to use `deliverAs: "followUp"` alongside `triggerTurn: true`. This ensures scheduled prompts are properly injected into the agent's message stream and trigger a real LLM turn, matching the behavior of the previous `sendUserMessage` approach.
