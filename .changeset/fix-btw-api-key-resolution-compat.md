---
default: patch
---

fix BTW API key resolution on older pi runtimes that do not expose `ctx.modelRegistry.getApiKey()`.
