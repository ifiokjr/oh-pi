---
default: patch
---

- Clarify the git-workflow skill to disable both `GIT_EDITOR` and `GIT_SEQUENCE_EDITOR` (plus `core.editor`/`sequence.editor` overrides) so agent-run Git commands avoid interactive editors in rebase and merge flows.