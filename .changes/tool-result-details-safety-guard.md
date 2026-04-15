---
default: patch
---

Further harden interactive tool-result rendering against pathological payloads.

- sanitize large string fields in tool-result `details` before renderer fallback paths consume them
- strip NUL bytes and bound nested details depth/field counts to avoid shell/text sanitizer crashes
- keep `outputGuard` metadata with a `detailsSanitized` flag when truncation is applied
- add tests covering oversized nested `details.stdout/stderr` payloads
