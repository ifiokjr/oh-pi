# @ifi/pi-provider-ollama

Experimental Ollama provider package for pi with both local and cloud support.

## What it does

- Registers a local `ollama` provider via `pi.registerProvider(...)`
- Detects whether the Ollama CLI is available on Windows and Unix-like systems
- Auto-discovers installed local Ollama models from the running daemon
- Surfaces downloadable local candidates from the cloud catalog with context-window metadata
- Adds `/login ollama-cloud` support using an Ollama API key flow
- Discovers the current Ollama Cloud model catalog even before login, then stores refreshed metadata with the login credential
- Exposes local models in `/model` as `ollama/<model-id>`
- Exposes cloud models in `/model` as `ollama-cloud/<model-id>`
- Prompts to download a missing local model when you select `ollama/<model-id>` and uses the Ollama CLI to pull it
- Adds `/ollama status|refresh-models|models|info|pull` for a unified local + cloud workflow

## Install

```bash
pi install npm:@ifi/pi-provider-ollama
```

This package is intentionally separate from `@ifi/oh-pi` for now.

## Use

### Local Ollama

1. Install the package
2. Make sure the `ollama` CLI is installed and a local Ollama instance is running
3. Open `/model` and select an `ollama/...` model
4. If the model is not installed yet, pi will prompt to download it with the Ollama CLI
5. Run `/ollama refresh-models` whenever you pull or remove local models outside pi

### Ollama Cloud

1. Install the package
2. Open `/model` or run `/ollama models` to browse the public Ollama Cloud catalog
3. Run `/login ollama-cloud` before using an `ollama-cloud/...` model
4. Create an API key on Ollama when pi opens the keys page
5. Paste the key back into pi
6. Open `/model` and select an `ollama-cloud/...` model
7. Optionally run `/ollama refresh-models` later to refresh both local and cloud catalogs

## Commands

- `/ollama status` — show local CLI + daemon status, local install/download counts, and cloud auth/catalog status
- `/ollama refresh-models` — refresh both local and cloud Ollama models
- `/ollama models` — list local and cloud Ollama models with source/capability badges for easier selection
- `/ollama info <model>` — show detailed metadata for a local or cloud Ollama model, including context window size
- `/ollama pull <model>` — manually download a local Ollama model via the Ollama CLI
- `/ollama-cloud status` — backward-compatible cloud-only status alias
- `/ollama-cloud refresh-models` — backward-compatible cloud-only refresh alias

## Notes

- Local Ollama uses the daemon's OpenAI-compatible `/v1` API plus `/api/show` metadata.
- If the Ollama CLI is missing, pi warns that only `ollama-cloud/...` models are available because Ollama is not installed locally.
- pi prefers the broader cloud catalog for browsing and uses the cloud metadata to annotate local download candidates with accurate context sizes.
- Cloud Ollama always discovers the public catalog first, then merges any authenticated metadata so login cannot shrink the visible model list.
- Ollama's documented API-key flow is still used for actual cloud access.
- Local model discovery is dynamic and installation-specific, so there is no static local fallback catalog.
- Cloud model discovery falls back to a bundled cloud catalog when live discovery is unavailable.
- Costs are currently left at zero because Ollama does not expose stable per-token pricing for local or cloud use in a way that pi can rely on here.

## Test hooks

These environment variables exist mainly for tests and local debugging:

### Local

- `PI_OLLAMA_LOCAL_API_URL`
- `PI_OLLAMA_LOCAL_MODELS_URL`
- `PI_OLLAMA_LOCAL_SHOW_URL`
- `PI_OLLAMA_LOCAL_ORIGIN`
- `OLLAMA_HOST`

### Cloud

- `PI_OLLAMA_CLOUD_API_URL`
- `PI_OLLAMA_CLOUD_MODELS_URL`
- `PI_OLLAMA_CLOUD_SHOW_URL`
- `PI_OLLAMA_CLOUD_KEYS_URL`
- `PI_OLLAMA_CLOUD_ORIGIN`
- `OLLAMA_HOST_CLOUD`
- `OLLAMA_API_KEY`

Legacy `OLLAMA_CLOUD_*` env names are also accepted for cloud compatibility with earlier iterations of this package.
