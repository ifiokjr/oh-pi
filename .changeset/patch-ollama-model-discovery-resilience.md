---
default: patch
---

- Make Ollama Cloud model discovery resilient to per-model metadata failures by falling back to the listed model ID or the package fallback catalog instead of dropping the whole refresh.