---
default: patch
---

Fix the `@ifi/pi-bash-live-view` package build by running the normal package test suite during `pnpm build` and keeping coverage behind a dedicated `test:coverage` script.
