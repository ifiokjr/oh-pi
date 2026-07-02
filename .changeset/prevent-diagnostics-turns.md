---
monopi: patch
---

# Prevent diagnostics messages from triggering LLM turns

## Fixed

- Changed diagnostics custom messages to use empty structured content and `triggerTurn: false` so prompt completion diagnostics stay visible without being treated as an LLM prompt.
