---
monopi: patch
---

# Hide diagnostics message text from LLM context

## Fixed

- Keep prompt-completion and diagnostics-history summaries in custom message details instead of message content so visible diagnostics entries do not get replayed to the LLM as user prompt text.
