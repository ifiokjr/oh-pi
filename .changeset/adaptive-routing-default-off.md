---
default: patch
---

Make adaptive routing opt-in by default.

- change the default adaptive-routing mode from `shadow` to `off`
- add regression coverage to ensure no route suggestions are emitted without explicit config
- document that adaptive routing is off by default in the extensions README
