---
default: patch
---

Fix watchdog extension crash on pi startup caused by `monitorEventLoopDelay` not being implemented in the embedded Bun runtime (1.2.8).

The extension now probes `monitorEventLoopDelay` at initialization and falls back to a no-op histogram when the API is unavailable. Event-loop lag fields report zero in fallback mode; CPU, RSS, and heap monitoring continue working normally.
