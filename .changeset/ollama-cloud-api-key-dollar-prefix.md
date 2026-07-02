---
monopi: patch
---

Fix `registerProvider("ollama-cloud")` legacy env var deprecation warning

Pass `$OLLAMA_API_KEY` (with `$` prefix) instead of bare `OLLAMA_API_KEY`
as the apiKey value to `registerProvider`, matching Pi's new config value
syntax for environment variable references.