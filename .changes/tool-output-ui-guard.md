---
default: patch
---

Harden tool result rendering against oversized or malformed text output.

- sanitize tool-result text blocks before metadata rendering
- split extremely long single lines into bounded chunks to avoid recursive line-wrap overflows
- cap total rendered text size/line count and strip NUL bytes before UI fallback rendering
- attach `outputGuard` details when truncation is applied
