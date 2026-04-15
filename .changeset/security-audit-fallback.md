---
default: patch
---

Treat pnpm audit failures caused by npm's retired audit endpoints as a non-fatal upstream issue in repo security checks, while still preserving allowlist enforcement and real audit failures.
