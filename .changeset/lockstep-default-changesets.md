---
default: patch
---

Document and enforce the lockstep knope changeset format:

- document the `default`-only frontmatter rule in AGENTS, README, and CONTRIBUTING
- require `.changeset/*.md` files to use `default` as the only frontmatter key
- validate the rule in CI so package-name frontmatter entries fail fast
- normalize pending changesets to the lockstep `default` format
