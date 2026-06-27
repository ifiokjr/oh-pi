# @monopi/extension-review

Standalone pi extension package for `review` — code change review workflows.

```bash
pi install npm:@monopi/extension-review
```

## Commands

- `/review` — interactive selector for review modes.
- `/review pr <n|url>` — review a GitHub pull request (checks out locally).
- `/review branch <base>` — review against a base branch.
- `/review uncommitted` — review uncommitted changes.
- `/review commit <sha>` — review a specific commit.
- `/review folder <paths...>` — review specific folders/files (snapshot, not diff).
- `/review --extra "..."` — add an extra review instruction (works with any mode).
- `/end-review` — finish the review and return to the original position.

Project-specific guidelines are loaded from a `REVIEW_GUIDELINES.md` next to the `.pi` directory when present.

## Attribution

This implementation is adapted from [`mitsuhiko/agent-stuff`](https://github.com/mitsuhiko/agent-stuff) `extensions/review.ts`.
The adapted upstream code is Copyright Armin Ronacher and contributors and licensed under Apache-2.0.
Monopi package metadata and surrounding repository files remain MIT licensed.
