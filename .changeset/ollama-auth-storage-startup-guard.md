---
default: patch
---

Prevent Ollama extension startup crashes when auth storage is not ready yet.

- guard `authStorage.get` and `authStorage.set` calls with safe wrappers
- make cloud-model refresh on `session_start` best-effort to avoid aborting extension initialization
- add smoke coverage for `session_start` with throwing auth storage access
