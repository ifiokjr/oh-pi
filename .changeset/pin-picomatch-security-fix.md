---
default: patch
---

Pin `picomatch` to `4.0.4` via pnpm overrides so CI security audits pass with the patched version of the transitive dependency used by the Vitest toolchain.
