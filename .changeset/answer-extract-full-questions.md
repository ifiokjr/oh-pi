---
default: patch
---

Improve answer extension question extraction to find the most complete formulation with options.

The LLM extraction prompt was updated to:
- Look for the most complete formulation of each question instead of just extracting from a summary at the end
- Keep `question` concise while extracting all explicit choices as `options`
- Support a new `header` field for markdown headings (e.g. "### 2. ...")
- Add a concrete example showing how to extract choices from a detailed section

`normalizeExtractedQuestions` now extracts and passes through the `header` field, and `toQnAQuestions` maps it to the QnA question object so the TUI can display it.
