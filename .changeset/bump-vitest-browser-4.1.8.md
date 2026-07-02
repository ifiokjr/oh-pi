---
monopi: patch
---

Bump `@vitest/browser` to 4.1.8 (fixes GHSA-2h32-95rg-cppp)

Patches a critical vulnerability where Vitest browser mode served an
unsanitized `otelCarrier` query parameter as an inline script.