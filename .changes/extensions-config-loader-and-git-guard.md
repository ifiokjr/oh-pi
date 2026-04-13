---
default: patch
---

Improve extension config resilience and harden git command safety.

- add a shared JSON config loader utility for extension configs that falls back cleanly on missing or invalid files and can forward normalization warnings
- migrate adaptive-routing config loading to the shared helper and surface warnings for malformed config files and invalid top-level sections
- teach `git-guard` to block git bash commands that are likely to open interactive editors in agent environments (for example `git rebase --continue` without non-interactive editor overrides)
