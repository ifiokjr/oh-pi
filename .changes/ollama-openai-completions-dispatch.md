---
default: patch
---

Fix Ollama startup and request routing so cloud models can be selected and answered reliably.

- seed fallback Ollama cloud models immediately so startup model scoping can resolve known cloud IDs before async refresh finishes
- route Ollama `openai-completions` requests by `model.provider` instead of assuming one handler per provider registration
- keep non-Ollama `openai-completions` models on pi's built-in OpenAI-compatible stream path
- add regression coverage for both startup fallback models and cloud dispatch when the local provider registers last
