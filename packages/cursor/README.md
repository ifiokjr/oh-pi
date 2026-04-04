# @ifi/pi-provider-cursor

Experimental Cursor model provider for pi.

## What it does

- Registers a `cursor` provider via `pi.registerProvider(...)`
- Adds `/login cursor` OAuth support
- Discovers usable Cursor models and stores them with the OAuth credential
- Streams responses directly from Cursor's `AgentService/Run` transport
- Continues MCP-style tool calls across pi tool execution rounds

## Install

```bash
pi install npm:@ifi/pi-provider-cursor
```

This package is intentionally separate from `@ifi/oh-pi` for now.

## Use

1. Install the package
2. Run `/login cursor`
3. Open `/model` and select a Cursor model
4. Optionally run `/cursor refresh-models` to refresh the discovered model catalog

## Commands

- `/cursor status` — show auth and runtime status
- `/cursor refresh-models` — rediscover available Cursor models and refresh the provider registry
- `/cursor clear-state` — clear in-memory conversation checkpoints and pending tool bridges

## Notes

- This integration is **experimental** and uses unofficial Cursor endpoints.
- It is designed as a pi-native provider and does **not** expose a local OpenAI-compatible proxy.
- Model discovery is stored alongside the OAuth credential so `/login cursor` can refresh the model list immediately.
- Image input is not currently advertised; models are registered as text-first until a real integration test pass proves multimodal support.

## Test hooks

These environment variables exist mainly for tests and local debugging:

- `PI_CURSOR_API_URL`
- `PI_CURSOR_LOGIN_URL`
- `PI_CURSOR_POLL_URL`
- `PI_CURSOR_REFRESH_URL`
- `PI_CURSOR_CLIENT_VERSION`

Legacy `CURSOR_*` env names are also accepted for compatibility with the reference implementation.
