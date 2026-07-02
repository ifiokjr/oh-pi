---
monopi: minor
---

Adopt upstream-inspired BTW and answer extension improvements

**What changed:**

- Replaced `@monopi/extension-btw` with the simpler upstream side-chat flow adapted from `mitsuhiko/agent-stuff`.
- Updated BTW tests to match the single `/btw` command behavior and side-thread persistence model.
- Kept the Monopi `answer` extension UI, while adding upstream-inspired extraction model selection and JSON repair/object-output handling.
- Documented upstream Apache-2.0 attribution and updated package license metadata for adapted code.
