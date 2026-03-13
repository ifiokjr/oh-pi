---
default: patch
---

Harden release safety with security gates:

- add `pnpm security:check` (dependency allowlist + vulnerability audits)
- run security checks in CI (`security` job) and PR dependency review (`dependency-review` job)
- require security checks in local release flow (`scripts/release.sh`) and `knope release` workflow
- use strict production audit threshold (`pnpm audit --prod --audit-level=high`)
- pin vulnerable transitive `file-type` to `21.3.1` via pnpm override
