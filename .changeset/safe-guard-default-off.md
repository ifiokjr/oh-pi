---
default: patch
---

Disable `safe-guard` as a default-enabled extension going forward:

- mark `safe-guard` as opt-in in the core extension registry used by setup flows
- remove `safe-guard` from quick-mode default extension selection in the CLI
- update the `@ifi/oh-pi` meta-package manifest to exclude `safe-guard` from default loaded extensions
- refresh docs to clarify `safe-guard` is available but not enabled by default
