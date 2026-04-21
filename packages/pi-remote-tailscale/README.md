# @ifi/pi-remote-tailscale

Pi extension for secure remote session sharing with Tailscale URLs, QR codes, and a compact TUI widget.

## Why this exists

`@ifi/pi-remote-tailscale` brings the original `pi-remote` workflow into oh-pi, but reuses the shared `@ifi/pi-web-server` package for the HTTP and WebSocket transport layer.

This package focuses on:

- secure per-session token auth
- Tailscale HTTPS URLs for remote access
- QR code output for phone and tablet handoff
- an optional remote status widget inside the TUI
- lightweight discovery metadata for active sessions

## Install

```bash
pi install npm:@ifi/pi-remote-tailscale
```

## Commands

Inside pi:

```text
/remote
/remote stop
/remote:widget
/remote:widget off
/remote:widget on
```

## What happens

When `/remote` starts a session, the extension:

1. creates a `PiWebServer` via `@ifi/pi-web-server`
2. generates a random session token
3. attempts to publish a Tailscale HTTPS path
4. shows local, LAN, or Tailscale connection details
5. renders an optional widget and QR code

If Tailscale is unavailable, the extension falls back to LAN or localhost URLs.

## Security notes

- every session gets a fresh random token
- tokens are compared with constant-time validation
- QR links put the token in the query string, never the path
- discovery metadata excludes the token
- no secrets are written to logs

## Remote mode

The package supports a remote-mode environment flag:

- `PI_REMOTE_TAILSCALE_MODE=remote`

When this flag is present, the extension can auto-start remote sharing during session startup. This keeps the package compatible with PTY-based launcher flows while still allowing direct use in a normal pi session.

## Development

Run the package tests directly:

```bash
pnpm exec vitest run --config packages/pi-remote-tailscale/vitest.config.ts --coverage
```

## Related packages

- `@ifi/pi-web-server` — shared HTTP + WebSocket transport
- `@ifi/pi-web-remote` — simpler built-in remote command package
