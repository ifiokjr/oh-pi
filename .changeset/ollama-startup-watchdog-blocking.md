---
default: patch
---

Ollama model discovery now runs local and cloud startup refreshes after a short delay instead of awaiting them during session startup. This prevents provider discovery and auth reads from blocking the UI or tripping the startup watchdog while still refreshing the model list once the session is ready.
