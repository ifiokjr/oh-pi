# `@ifi/pi-web-server`

> Embeddable HTTP + WebSocket server for pi remote session sharing.

## Why use this?

When you want pi sessions to be viewable remotely, you need a server. This package provides the server-side primitives — HTTP routing, WebSocket streaming, and token-based access control — that `@ifi/pi-web-remote` uses to expose pi sessions.

Use it directly if you're embedding pi remote access into your own application or service.

## Installation

```bash
pnpm add @ifi/pi-web-server
```

> This is a compiled library (`dist/` output). Consumed as a dependency, not installed as a pi package.

## What it provides

- **HTTP server:** Serves the remote session UI and API endpoints
- **WebSocket transport:** Real-time streaming of session events (messages, tool calls, status)
- **Token-based access:** Secure session sharing with access tokens
- **LAN/tunnel awareness:** Connection URLs that work on local networks and via tunnels (Tailscale, etc.)
- **Embeddable:** Import into your own Node.js application

## Use case

- Building a custom remote session viewer
- Embedding pi remote access into a developer portal
- Creating a managed pi service with session sharing

## Related packages

| Package                    | Role                                                            |
| -------------------------- | --------------------------------------------------------------- |
| `@ifi/pi-web-client`       | Client library that connects to this server                     |
| `@ifi/pi-web-remote`       | Pi extension that wires this server into pi's `/remote` command |
| `@ifi/pi-remote-tailscale` | Tailscale tunnel integration for secure remote access           |

## Notes

- This package compiles to `dist/` — run `pnpm build` if modifying it
- Depends on `express` and `ws` for HTTP + WebSocket handling
