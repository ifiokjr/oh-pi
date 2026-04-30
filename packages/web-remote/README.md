# `@ifi/pi-web-remote`

> Share your pi session through a browser — for code reviews, pair programming, or demos.

## Why use this?

Sometimes you want someone else to see what pi is doing in real time:
- **Code review:** Share your session so a colleague can watch pi work through your code
- **Pair programming:** Let someone follow along as you prompt pi through a design session
- **Demos:** Show stakeholders your AI-assisted workflow without them installing anything

`/remote` spins up a web server that streams your current pi session to any browser.

## Installation

```bash
pi install npm:@ifi/pi-web-remote
```

> This is installed by default with `npx @ifi/oh-pi`.

## Usage

```text
/remote              # Start sharing. Shows the URL to share.
/remote status       # Check if sharing is active and how many are connected
/remote stop         # Stop sharing the session
```

### Typical flow

1. Type `/remote` in pi
2. Pi starts a web server and shows a URL like `http://localhost:3000` or a tunnel URL
3. Share that URL with whoever needs to see
4. They open it in a browser and see your pi session updating in real time
5. When done, type `/remote stop`

```
You: /remote

oh-pi: Remote session active at http://localhost:3000
       Share this URL with collaborators.
       Type /remote stop to end sharing.

You: /remote stop
oh-pi: Remote session stopped.
```

## What the web UI shows

The browser view mirrors your pi session:
- Current conversation history
- Tool calls and results as they happen
- Live status updates
- Tokens and cost information

## Security

- By default the server binds to `localhost` only
- For remote access, pair with `@ifi/pi-remote-tailscale` for HTTPS over Tailscale tunnels
- No data is stored on disk — the session streams live

## Related packages

| Package | Purpose |
| ------- | ------- |
| `@ifi/pi-web-server` | The embeddable HTTP + WebSocket server this extension uses |
| `@ifi/pi-web-client` | TypeScript client library for building custom remote UIs |
| `@ifi/pi-remote-tailscale` | Secure remote sharing via Tailscale HTTPS with QR codes |

## Notes

- This package ships raw TypeScript — pi loads it directly, no build step needed
- Only one remote session can be active at a time
- Works with `@ifi/pi-remote-tailscale` for accessing over the internet with TLS
