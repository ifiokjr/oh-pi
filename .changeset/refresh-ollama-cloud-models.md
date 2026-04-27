---
default: patch
---

Refresh Ollama Cloud models during startup so newly released cloud models can be registered before model scope resolution.

- Prime the cloud provider from the live `/v1/models` catalog before registration, with a bounded timeout and fallback behavior.
- Persist discovered cloud models to a local startup cache so later offline starts can still resolve recently discovered models.
- Keep the static fallback catalog as a resilient baseline instead of requiring every new cloud model to be added manually.
