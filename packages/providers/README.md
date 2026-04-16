# @ifi/pi-provider-catalog

Experimental multi-provider package for pi backed by the OpenCode `models.dev` catalog.

## What it does

- Registers configured API-key providers from the OpenCode catalog without flooding pi's global `/login` picker
- Keeps provider model lists, context windows, reasoning flags, and vision support aligned with `models.dev`
- Reuses live provider discovery when a provider exposes a model-list endpoint
- Adds a scrollable `/providers:login` picker with in-place search for lazy provider registration and API-key login
- Adds `/providers ...` commands for status, listing, inspection, and catalog refreshes

## Install

```bash
pi install npm:@ifi/pi-provider-catalog
```

This package is intentionally separate from `@ifi/oh-pi` for now.

## Use

1. Install the package
2. Run `/providers:list` to see supported provider ids
3. Run `/providers:login` to browse the full provider list in a scrollable picker, or `/providers:login <provider-id>` if you already know the id
4. Open `/model` and select one of the discovered models
5. Run `/providers:refresh-models <provider-id>` whenever you want to refresh the live catalog

You can also skip `/login` and set a supported provider env var directly when the provider uses a simple API-key flow.

## Commands

- `/providers:status` — summarize configured providers from this package
- `/providers:list [query]` — list supported provider ids and env vars
- `/providers:login [provider]` — scroll through the full provider list, search in place, lazily register one, and prompt for its API key
- `/providers:info <provider>` — inspect a provider's API mode, URLs, env vars, and model count
- `/providers:models <provider>` — list the current or fallback model catalog for one provider
- `/providers:refresh-models [provider|all]` — refresh configured providers from live discovery when possible

## Highlights

This package includes providers the user explicitly asked about, including:

- `xai`
- `opencode`
- `opencode-go`
- `moonshotai`
- other OpenCode-cataloged API-key providers

## Notes

- Ollama is intentionally excluded because `@ifi/pi-provider-ollama` already exists.
- This package focuses on providers that can be configured with a single API key plus a stable HTTP base URL.
- Some upstream providers still have provider-specific quirks or headers. When live discovery fails, pi falls back to the cached `models.dev` metadata instead of dropping the provider entirely.
- Providers that need multi-part auth or cloud-specific credential chains are still better served by dedicated integrations.

## Test hook

- `PI_PROVIDER_CATALOG_URL` — override the `models.dev` catalog URL for tests or local debugging
