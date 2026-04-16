---
default: patch
---

Add a clearer local-source-mode reminder to run `pnpm install --frozen-lockfile` after pulling, rebasing, or switching branches so pi does not fail to resolve internal workspace packages from a stale install.
