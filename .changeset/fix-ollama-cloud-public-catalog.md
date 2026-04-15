---
default: patch
---

Fix the Ollama Cloud provider to discover the public model catalog during bootstrap and refreshes even before login, keep that broader public catalog visible even when authenticated discovery is narrower, extend the bundled fallback catalog with `glm-5.1`, and add CLI-aware local download prompts plus local context-window metadata sourced from the cloud catalog.
