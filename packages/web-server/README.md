# @ifi/pi-web-server

Embeddable HTTP + WebSocket server for remote pi session management.

## What it does

`@ifi/pi-web-server` provides the server-side building blocks for exposing a pi session over HTTP and WebSocket transports.

It includes support for:

- token-based access
- LAN/tunnel-aware connection flows
- remote session transport primitives
- embedding in first-party or custom tooling

## Install

```bash
pnpm add @ifi/pi-web-server
```

## Use case

Use this package if you want to embed remote pi access into your own app or service, or if you are building on top of the oh-pi remote workflow.

## Related packages

- `@ifi/pi-web-client` — remote client library
- `@ifi/pi-web-remote` — pi extension that exposes the feature as `/remote`
