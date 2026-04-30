# `@ifi/pi-web-client`

> Platform-agnostic TypeScript client for connecting to pi remote sessions.

## Why use this?

When pi is sharing a session via `/remote`, a web server streams the conversation. This library lets you build your own UI — browser, mobile, or desktop — that connects to that server and displays the session.

Use it when the built-in remote web UI doesn't match your needs.

## Installation

```bash
pnpm add @ifi/pi-web-client
```

> This is a compiled library (`dist/` output). Consumed as a dependency, not installed as a pi package.

## What it provides

- WebSocket-based session streaming client
- Works in browsers, Node.js, React Native, and any TypeScript runtime with WebSocket support
- Handles connection lifecycle: connect, reconnect, disconnect
- Event-based API for receiving session updates (messages, tool calls, status changes)

## Use case

Build your own:
- Custom browser dashboard for remote pi sessions
- Mobile app to follow pi sessions on your phone
- Internal tooling that embeds pi session views

## Related packages

| Package | Role |
| ------- | ---- |
| `@ifi/pi-web-server` | The server this client connects to |
| `@ifi/pi-web-remote` | Pi extension that starts the remote server |
| `@ifi/pi-remote-tailscale` | Secure remote sharing via Tailscale |

## Notes

- This package compiles to `dist/` — run `pnpm build` if modifying it
- No runtime dependency on pi itself — works as a standalone library
