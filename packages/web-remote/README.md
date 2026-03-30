# @ifi/pi-web-remote

Pi extension that adds the `/remote` command for sharing sessions via a web UI.

## What it does

This package registers a `/remote` command that can:
- start remote access for the current pi session
- expose a connection URL or tunnel-backed URL
- show connection status
- stop remote sharing

## Install

```bash
pi install npm:@ifi/pi-web-remote
```

## Usage

Inside pi:

```text
/remote
/remote stop
```

## Related packages

- `@ifi/pi-web-server` — the server implementation used by this extension
- `@ifi/pi-web-client` — client library for custom remote UIs

## Notes

This package ships raw TypeScript for pi to load directly as an extension.
