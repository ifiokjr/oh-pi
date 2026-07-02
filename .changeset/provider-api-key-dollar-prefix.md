---
monopi: patch
---

Fix legacy env var reference deprecation warning in provider catalog

`resolveApiKeyConfig()` now passes env var names with the `$` prefix (e.g.
`$XIAOMI_API_KEY`) to `registerProvider()`, matching Pi's new config value
syntax. This resolves the deprecation warning:

> registerProvider("xiaomi-token-plan-ams") apiKey value "XIAOMI_API_KEY" is treated
> as a legacy environment variable reference. Pass "$XIAOMI_API_KEY" instead.