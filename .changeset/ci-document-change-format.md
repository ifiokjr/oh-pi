---
default: patch
---

Improve project automation ergonomics:

- fix pull-request conventional-commit validation to lint real PR commits instead of synthetic merge commit messages
- update `knope document-change` workflow to run `pnpm format` after creating a changeset file
