---
default: minor
---

Add `/answer` extension for interactive Q&A from LLM responses.

- `/answer` extracts questions from the last assistant message and presents them in a QnA overlay powered by `@ifi/pi-shared-qna`
- `/answer:auto` toggles auto-detection: when enabled, questions in the final LLM response automatically trigger the QnA overlay
- Uses LLM-powered question extraction with structured output (questions, context, and multiple-choice options)
- Answers are injected back into the session as a follow-up user message