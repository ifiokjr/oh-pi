---
default: patch
---

Highlight recommended options in answer extension QnA overlay.

The QnA TUI now renders recommended options with bold text and a `(recommended)` postfix so the user's preferred choice stands out visually.

LLM extraction prompt changes:
- Instructs the model to mark clearly recommended options with `recommended: true`
- When there is a recommendation without multiple explicit choices, the model creates a single synthetic recommended option; the TUI already presents an `Other` choice so the user can describe what they actually want.
- Added example showing single-recommendation extraction

Shared QnA component (`qna-tui.ts`):
- Added `recommended?: boolean` to `QnAOption` interface
- Render loop appends `(recommended)` postfix and applies bold styling when `recommended` is true

Answer extension (`answer.ts`):
- Updated `ExtractedQuestion` option type to carry `recommended`
- `normalizeExtractedQuestions` passes through the flag and synthesizes a recommended option from a `recommendation` string when no explicit options exist

Tests:
- Added coverage for recommended flag extraction, defaulting to false, synthesis from recommendation string, and preference for explicit options
- Updated prompt assertion tests for new recommendation guidelines
