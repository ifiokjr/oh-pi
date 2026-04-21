---
default: patch
---

Add Ctrl+O context expansion popup for QnA questions.

When a question has a longer original formulation, pressing Ctrl+O opens a
popup inside the QnA overlay showing the full question text, context, and all
option descriptions. Escape, Enter, or Ctrl+O again closes the popup.

- Added `fullContext` field to `QnAQuestion` for preserving the verbatim
  original text alongside the concise `question` summary.
- LLM extraction prompt now instructs preserving `fullContext` when the
  question is summarized from a longer original.
- `QnATuiComponent` toggles a context popup with Ctrl+O.
- `normalizeExtractedQuestions` passes through `fullContext`.