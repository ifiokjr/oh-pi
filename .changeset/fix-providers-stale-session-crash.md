---
default: patch
---

Fix stale ExtensionAPI crash in provider catalog after session replacement.

The `@mariozechner/pi-coding-agent` extension loader invalidates the `ExtensionAPI`
instance (`pi`) after a session reload or replacement. The provider catalog extension
was calling `pi.registerProvider()` from `session_start` handlers and command
handlers that captured the original `pi`, which threw:

  "This extension instance is stale after session replacement or reload."

All `registerProvider` calls in event and command handlers now use the fresh
`ctx.modelRegistry` passed to each handler instead. `bootstrapProviders` still
uses the initial `pi` (which is valid at extension load time).
