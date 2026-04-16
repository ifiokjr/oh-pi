---
default: patch
---

Improve Ollama Cloud startup behavior and response reliability.

- register `streamSimple` for the `ollama-cloud` provider explicitly
- refresh cloud models on `session_start` using stored OAuth credentials when present
- update runtime cloud discovery state from credential-backed model catalogs so scoped model matching is stable
- add smoke coverage that validates `ollama-cloud` registers a stream handler
