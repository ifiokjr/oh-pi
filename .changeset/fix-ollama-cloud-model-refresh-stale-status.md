---
default: patch
---

Fix Ollama cloud models showing stale data after refresh and surface discovery errors

The `/ollama:refresh-models` command and `/ollama:status` display always read
cloud models from the stored OAuth credential when one exists, even after a
successful discovery that updated the runtime state. This meant newly available
models (like kimi-k2.6) would not appear until the credential was re-stored,
and the "last refreshed" timestamp shown in status was the credential's
`lastModelRefresh` — often hours or days stale.

Changes:

- Cloud model display now prefers the runtime discovery state
  (`cloudEnvDiscoveryState.models`) over the stored credential. The credential
  models are only used as fallback when the runtime state is empty (e.g. before
  first discovery).
- The "last refreshed" age shown in status now uses
  `cloudEnvDiscoveryState.lastRefresh` (always set to `Date.now()` during
  refresh) instead of the credential's `lastModelRefresh`.
- Discovery errors are now surfaced in `/ollama:refresh-models`,
  `/ollama:status`, and `/ollama-cloud status` output, making it obvious when
  the cloud catalog couldn't be reached instead of silently falling back to
  stale data.