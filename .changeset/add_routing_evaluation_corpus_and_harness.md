---
default: patch
---

Add a routing corpus and evaluation harness.

- add `evaluate-corpus.ts` reusable offline evaluation runner
- expand `fixtures.route-corpus.json` with richer fixture schema including intent, complexity, risk, tier, thinking, and acceptable fallbacks
- add `evaluate-corpus.test.ts` with regression coverage for classification correctness and model-selection mismatch checks
- update `engine.test.ts` to use the new `CorpusEntry` fields
- add `evaluate:corpus` package script
