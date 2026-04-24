---
default: patch
---

fix(extensions): guard `ctx.model` getter in compact-header and custom-footer render paths

The `ctx.model` getter throws when the underlying ExtensionRunner is no longer active (e.g. during session shutdown). Both `compact-header.ts` and `custom-footer.ts` access `ctx.model` inside TUI `render` callbacks that may fire asynchronously after the session ends. Wrapping those accesses in try/catch prevents the crash.
