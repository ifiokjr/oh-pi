# @ifi/pi-web-client

Platform-agnostic TypeScript client for remote pi sessions.

## What it does

`@ifi/pi-web-client` is a lightweight client library for connecting to pi remote session servers.
It is designed to work in:
- browsers
- Node.js
- React Native
- other TypeScript runtimes with WebSocket support

## Install

```bash
pnpm add @ifi/pi-web-client
```

## Use case

Use this package when you want to build your own web or mobile UI for a remote pi instance.

## API surface

The package exposes a small client-facing API from its compiled `dist/` output.

## Related packages

- `@ifi/pi-web-server` — embeddable remote server
- `@ifi/pi-web-remote` — pi extension that starts remote sharing from inside pi
