---
default: minor
---

Add @monopi/extension-review package

**What changed:**

- Ports the code review extension from `mitsuhiko/agent-stuff` `extensions/review.ts` into a new `@monopi/extension-review` package.
- Registers the `/review` command (pr/branch/uncommitted/commit/folder modes, custom instructions, `--extra`) and `/end-review`.
- Loads project-specific guidelines from `REVIEW_GUIDELINES.md` next to `.pi` when present.
- Adds Apache-2.0 attribution and registers the package in `monochange.toml`, the root `pi.extensions` array, and the git-install manifest test.