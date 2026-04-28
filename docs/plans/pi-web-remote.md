# Plan: Remote Web Management of Pi (`@ifi/pi-web`)

## Overview

Add the ability to manage a pi-coding-agent instance remotely via a web browser or mobile app. Two modes of operation:

- **`/remote` command** — from within a running pi TUI session, exposes that session over the network. Displays a QR code + URL in the terminal.
- **Headless daemon** (`pi-web serve`) — a long-running background process for always-on access (e.g., Mac Mini that you talk to from anywhere).

Both modes share the same protocol, client library, web UI, and security model.

---

## User Experience

### The Only Thing You Need to Know

```
$ pi
> /remote

  ╭──────────────────────────────────────────╮
  │                                          │
  │    █▀▀▀▀▀█ █ ▄▀▄ █▀▀▀▀▀█                │
  │    █ ███ █ ▄▀ ▀ ▄ █ ███ █                │
  │    █ ▀▀▀ █ ▀█▀▄▀  █ ▀▀▀ █                │
  │    ▀▀▀▀▀▀▀ █▄▀▄█▄ ▀▀▀▀▀▀▀                │
  │    ...                                   │
  │                                          │
  │  Scan to connect.                        │
  │                                          │
  ╰──────────────────────────────────────────╯

  🌐 Remote active · 0 clients · /remote stop
```

That's it. Scan the QR code with your phone. The web UI opens. You're connected. Type on your phone or in the terminal — both work on the same session.

Everything else is automatic:

- Token generated, embedded in the QR URL
- Server started on a free port
- If `cloudflared` or `tailscale` is installed, a tunnel is created so it works from outside your network too
- If not, the LAN IP is used (phone must be on same WiFi)
- Web UI served from the local server, or from a hosted CDN if a tunnel is active

`/remote stop` tears it all down. `/remote` again shows the QR if already active.

### Headless Mode (Mac Mini / Always-On)

For a pi instance that stays alive permanently:

```bash
pi-web serve --cwd ~/projects/my-app
```

Same idea. QR code appears. Scan it. Run it in tmux or as a system service. Token is persisted to `~/.config/pi-web/token` so you can reconnect after restarts.

### For App Developers (Future)

The client library works in browsers, React Native, and Node.js — same API everywhere:

```typescript
import { PiWebClient } from "@ifi/pi-web-client";

const client = new PiWebClient({
	url: "wss://abc123.trycloudflare.com/ws",
	token: "b8e2d4f1a3c9...",
});

await client.connect();
client.on("message_update", (e) => {
	/* render in your app */
});
await client.prompt("What's the status of the build?");
```

Zero DOM dependencies. Uses native WebSocket (browser, React Native, Node 21+). Pass a WebSocket constructor for older Node.

---

## Connection & Authentication Flow

### Token-Based Identity

Every pi-web instance generates a **256-bit cryptographic token** on startup. This token is the sole credential for accessing that instance.

```
┌─────────────┐     1. /remote or pi-web serve        ┌──────────────┐
│  Pi Instance │ ──────────────────────────────────►    │  Web Server  │
│  (terminal)  │     2. generates token: a7f3b2c1...   │  (embedded)  │
└─────────────┘                                        └──────┬───────┘
                                                              │
      3. displays QR code + URL with token                    │
         http://192.168.1.42:3100?t=a7f3b2c1...               │
                                                              │
┌─────────────┐     4. opens URL or scans QR           ┌──────┴───────┐
│   Browser / │ ──────────────────────────────────►    │  Web Server  │
│   Mobile    │     5. WebSocket connect + token       │  validates   │
└─────────────┘     6. ✅ authenticated                └──────────────┘
```

### What the Token Protects

| Concern                   | How It's Handled                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Unauthorized access**   | Token required for every WebSocket connection and REST call                                            |
| **Token guessing**        | 256-bit random = 2²⁵⁶ possibilities. Infeasible to brute-force                                         |
| **Token leakage**         | Token only shown once in terminal. URL contains it for convenience but can be stripped after first use |
| **Network sniffing**      | TLS required for non-localhost. `--tls` flag or reverse proxy                                          |
| **Instance enumeration**  | No discovery endpoint. Must know the exact token to connect                                            |
| **Cross-instance access** | Each instance has a unique token. No shared state between instances                                    |
| **Replay attacks**        | WebSocket is a persistent connection. Optional: token expiry via `--token-ttl 24h`                     |
| **Multiple users**        | Each user runs their own pi instance with their own token                                              |

### Connection Flow

```
Client                                 Server
  │                                      │
  ├─── WebSocket connect ──────────────► │
  │    ws://host:port/ws                 │
  │                                      │
  ├─── { type: "auth",  ───────────────► │
  │      token: "a7f3b2c1..." }          │  ← validates token
  │                                      │
  │ ◄── { type: "auth_ok",  ──────────── ┤
  │      instanceId: "blue-fox-92",      │
  │      session: { ... } }              │
  │                                      │
  │    (now authenticated — all RPC      │
  │     commands available)              │
  │                                      │
  ├─── { type: "prompt",  ─────────────► │
  │      message: "List files" }         │
  │                                      │
  │ ◄── { type: "agent_start" } ──────── ┤
  │ ◄── { type: "message_update" } ───── ┤
  │ ◄── { type: "agent_end" } ────────── ┤
```

### QR Code Contents

The QR code encodes a single URL. The format is chosen automatically:

| Situation        | QR URL                                                           |
| ---------------- | ---------------------------------------------------------------- |
| Tunnel available | `https://pi-remote.dev?host=wss://abc.trycloudflare.com&t=TOKEN` |
| LAN only         | `http://192.168.1.42:3100?t=TOKEN`                               |

The user never chooses between these. `/remote` detects the best option and shows one QR code.

The web UI reads `t` from the URL on load, stores it in memory (never in localStorage for security), and uses it for the WebSocket `auth` handshake. The token is stripped from the URL bar after connection to prevent accidental sharing via screenshots or copy-paste.

### Instance ID

The human-readable instance ID (e.g., `blue-fox-92`) is a **display name only**. It is not a credential and cannot be used to connect. It helps users identify which instance they're looking at when they have multiple running.

Generated as `adjective-noun-number` from the token hash — deterministic but not reversible.

---

## Security Model — Instance Isolation

### Single-User, Single-Instance Architecture

Each pi-web instance is a **single-user, single-pi-session** system. There is no concept of "users" or "accounts" on the server. The security boundary is:

> **One token = one instance = one owner.**

```
┌──────────────────────────────────────────────────────────┐
│  User A's machine                                        │
│                                                          │
│  ┌──────────┐  token-A  ┌──────────┐                     │
│  │ pi inst. ├──────────►│ :3100    │ ◄── User A's phone  │
│  └──────────┘           └──────────┘                     │
│                                                          │
│  ┌──────────┐  token-B  ┌──────────┐                     │
│  │ pi inst. ├──────────►│ :3101    │ ◄── User A's laptop │
│  └──────────┘           └──────────┘                     │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  User B's machine                                        │
│                                                          │
│  ┌──────────┐  token-C  ┌──────────┐                     │
│  │ pi inst. ├──────────►│ :3100    │ ◄── User B's phone  │
│  └──────────┘           └──────────┘                     │
└──────────────────────────────────────────────────────────┘
```

There is **no way** for User B to access User A's instance:

- Different machines, different tokens, different ports
- No shared service or registry to enumerate instances
- Even on the same machine, each instance binds to a different port with a different token

### Multiple Clients, Same Instance

Multiple devices CAN connect to the same instance simultaneously (your laptop and phone both open to the same session):

```
Phone  ──► ┐
            ├──► pi-web instance (token-A) ──► pi session
Laptop ──► ┘
```

Both clients see the same event stream. Input from either client is delivered to the agent. This is intentional — it's **your** instance on **your** devices.

### Preventing Takeover

| Attack Vector                             | Defense                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Guess the token**                       | 256-bit entropy. The sun will burn out first.                                                       |
| **Find the port**                         | Port scan finds HTTP, but every endpoint requires the token. 401 without it.                        |
| **Intercept the token**                   | Localhost is immune. Remote requires TLS. QR code is shown only in your terminal.                   |
| **Steal the token from URL**              | Token stripped from URL bar after connection. Never stored in localStorage. Kept only in JS memory. |
| **MITM on the WebSocket**                 | TLS (WSS) prevents this. Server validates token on every connection, not just first message.        |
| **Shared machine, different users**       | Each user runs their own instance on a different port. OS-level process isolation.                  |
| **Token persisted to disk (daemon mode)** | Token file created with `0600` permissions (owner-only read). Path is user-configurable.            |
| **Hosted UI on CDN**                      | CDN serves static files only. Token goes browser → your pi-web server directly. CDN never sees it.  |

### Optional Hardening (Phase 5)

- `--allowed-ips 192.168.1.0/24` — restrict to local network
- `--token-ttl 24h` — auto-expire token, must re-run `/remote` to get a new one
- `--max-clients 2` — limit concurrent connections
- `--read-only` — clients can observe but not send prompts (monitoring mode)

---

## How It Works Under the Hood

The user types `/remote`. Behind the scenes, the extension auto-detects the best connectivity strategy. The user never sees any of this.

### Auto-Detection Logic

```
/remote
  │
  ├── 1. Start web server on free port (3100, 3101, ...)
  │
  ├── 2. Check for tunnel provider
  │     ├── cloudflared installed? → start tunnel → get public wss:// URL
  │     ├── tailscale funnel available? → start funnel → get public wss:// URL
  │     └── neither? → fall back to LAN
  │
  ├── 3. Build QR URL
  │     ├── Tunnel found:
  │     │     https://pi-remote.dev?host=wss://abc.trycloudflare.com&t=TOKEN
  │     │     (works from anywhere — phone doesn't need to be on same WiFi)
  │     │
  │     └── LAN only:
  │           http://192.168.1.42:3100?t=TOKEN
  │           (phone must be on same WiFi)
  │
  └── 4. Display QR code
```

### Why Hosted UI + Local Pi Is Secure

When a tunnel is available, the QR code points to a hosted UI (e.g., Deno Deploy). This is a **static SPA** — just HTML, CSS, and JavaScript served from a CDN.

```
┌──────────────────┐   1. Load UI (static files)   ┌──────────────────┐
│  pi-remote.dev   │ ─────────────────────────────► │  Your phone      │
│  (CDN)           │   no tokens, no data           │                  │
└──────────────────┘                                │  2. Read token   │
                                                    │     from URL     │
┌──────────────────┐   3. wss:// direct connection  │                  │
│  Your machine    │ ◄───────────────────────────── │  3. Connect WS   │
│  (pi-web)        │   token + conversation here    │     to YOUR      │
└──────────────────┘   CDN never sees any of it     │     machine      │
                                                    └──────────────────┘
```

- The CDN serves files. It never sees your token or conversation data.
- The token goes browser → your pi-web server directly.
- All data flows over the WebSocket between your phone and your machine.
- Same security model as Grafana Cloud connecting to your self-hosted Prometheus.

### LAN vs Tunnel

|                          | LAN (no tunnel)      | Tunnel (cloudflared/tailscale)         |
| ------------------------ | -------------------- | -------------------------------------- |
| **Phone on same WiFi?**  | ✅ Required          | Not required                           |
| **Works from anywhere?** | ❌                   | ✅                                     |
| **TLS**                  | Not needed (HTTP)    | Auto (HTTPS)                           |
| **QR points to**         | `http://LAN_IP:PORT` | `https://pi-remote.dev?host=wss://...` |
| **Install needed**       | Nothing              | `cloudflared` or `tailscale`           |

The user doesn't choose. `/remote` picks whichever is available.

---

## New Packages

| Package                | Name                 | Type             | Ships                               |
| ---------------------- | -------------------- | ---------------- | ----------------------------------- |
| `packages/web-server/` | `@ifi/pi-web-server` | Compiled (dist/) | Embedded HTTP + WebSocket server    |
| `packages/web-remote/` | `@ifi/pi-web-remote` | Raw .ts          | Pi extension: `/remote` command     |
| `packages/web-client/` | `@ifi/pi-web-client` | Compiled (dist/) | Platform-agnostic TypeScript client |
| `packages/web-ui/`     | `@ifi/pi-web-ui`     | Bundled (dist/)  | React SPA (served by web-server)    |

All four packages join the lockstep versioning in `knope.toml`.

**Note:** `web-remote` replaces the old `web-extension` concept. It serves double duty — it's both a pi extension (registers `/remote`) AND loads the web server. For headless daemon mode, `web-server` runs standalone without the extension.

---

## Phase 1 — Server Core

**Goal:** An embeddable HTTP + WebSocket server that bridges a pi `AgentSession` to remote clients with token-based auth.

### 1.1 — Scaffold `packages/web-server/`

- [ ] Create `package.json`:
  - `"name": "@ifi/pi-web-server"`
  - `"type": "module"`
  - `"bin": { "pi-web": "dist/bin/pi-web.js" }`
  - Dependencies: `hono`, `@hono/node-server`, `ws`, `qrcode-terminal`
  - Peer dependency: `@mariozechner/pi-coding-agent`
- [ ] `tsconfig.json` extending root
- [ ] Build/typecheck scripts matching `packages/core/` pattern
- [ ] Add to `knope.toml` `versioned_files`
- [ ] Add test globs to root `vitest.config.ts` and `biome.json`

### 1.2 — Token Generation & Management

- [ ] `src/token.ts`
  - `generateToken(): string` — 256-bit crypto random, hex-encoded (64 chars)
  - `generateInstanceId(token: string): string` — deterministic adjective-noun-NN from SHA-256 of token (e.g., `blue-fox-92`)
  - `loadOrCreateToken(tokenFilePath?: string): { token, instanceId, isNew }`
  - Token file written with `0600` permissions
  - `validateToken(provided: string, expected: string): boolean` — constant-time comparison to prevent timing attacks

### 1.3 — Embeddable Web Server

- [ ] `src/server.ts` — `PiWebServer` class (used by both `/remote` and daemon)

  ```typescript
  class PiWebServer {
  	constructor(options: PiWebServerOptions);

  	// Lifecycle
  	start(): Promise<{ url: string; token: string; instanceId: string }>;
  	stop(): Promise<void>;
  	readonly isRunning: boolean;

  	// Attach a pi session (from extension or daemon)
  	attachSession(session: AgentSession): void;
  	detachSession(): void;

  	// Connection info
  	readonly connectedClients: number;
  	readonly url: string;
  	readonly token: string;
  	readonly instanceId: string;

  	// Events
  	on(event: "client_connect", handler: (clientId: string) => void): void;
  	on(event: "client_disconnect", handler: (clientId: string) => void): void;
  }

  interface PiWebServerOptions {
  	port?: number; // default: auto (3100, then increment)
  	host?: string; // default: "0.0.0.0"
  	token?: string; // auto-generated if not provided
  	tokenFile?: string; // persist token to file for daemon restarts
  	tunnel?: boolean; // default: auto-detect (true if provider found)
  	tls?: { cert: string; key: string };
  	maxClients?: number; // default: 5
  	staticDir?: string; // path to web-ui dist/ assets
  	hostedUiUrl?: string; // default: "https://pi-remote.dev"
  }
  ```

### 1.4 — WebSocket Protocol Handler

- [ ] `src/ws-handler.ts`
  - **Auth handshake:** first message must be `{ type: "auth", token: "..." }`. Reject with `{ type: "auth_error", reason: "invalid_token" }` and close the socket on failure. Respond with `{ type: "auth_ok", instanceId, session }` on success.
  - **After auth:** reuse pi's RPC command format 1:1 (prompt, steer, follow_up, abort, get_state, get_messages, set_model, compact, etc.)
  - **Event streaming:** relay `AgentSession` events to all authenticated clients
  - **Extension UI bridging:** relay `extension_ui_request` to clients, relay `extension_ui_response` back to the session
  - **Client tracking:** assign each connection a `clientId`, track connected count
  - **CORS:** allow connections from `hostedUiUrl` origin if configured

### 1.5 — REST API

- [ ] `src/routes.ts` — Hono routes (all require `Authorization: Bearer <token>`)
  - `GET /api/health` — server status (no auth required)
  - `GET /api/instance` — instance info (id, uptime, connected clients)
  - `GET /api/session/state` — current session state
  - `GET /api/session/messages` — message history
  - `GET /api/session/stats` — token usage and cost
  - `GET /api/session/export` — HTML export
  - `GET /api/models` — available models
  - `GET /` — serve web-ui SPA (no auth — token is in the URL query param)

### 1.6 — Tunnel Integration

- [ ] `src/tunnel.ts` — tunnel lifecycle management
  - `startTunnel(localPort, provider?): Promise<{ publicUrl: string; stop: () => void }>`
  - Auto-detect available tunnel provider:
    1. Check for `cloudflared` binary → `cloudflared tunnel --url http://localhost:PORT`
    2. Check for `tailscale` → `tailscale funnel PORT`
    3. Fall back to `--tunnel-command` if provided
  - Parse the public URL from tunnel process stdout
  - Health check: periodically verify tunnel is alive
  - Graceful stop: kill tunnel process on server shutdown

### 1.7 — Daemon CLI Entrypoint

- [ ] `src/bin/pi-web.ts` — `pi-web serve` command
  - Minimal required: `pi-web serve --cwd ~/projects/my-app`
  - Optional overrides: `--port`, `--host`, `--token-file`, `--no-tunnel`
  - Auto-detect tunnel + LAN IP (same logic as `/remote` extension)
  - Create a pi session via `createAgentSession()` with full SDK
  - Attach it to `PiWebServer`
  - Display QR code + URL
  - Persist token to `~/.config/pi-web/token` by default
  - Graceful shutdown on SIGINT/SIGTERM — save session, stop tunnel, stop server

### 1.8 — Tests

- [ ] `tests/token.test.ts` — generation, validation, persistence, constant-time compare
- [ ] `tests/server.test.ts` — start/stop lifecycle, client connect/disconnect
- [ ] `tests/ws-handler.test.ts` — auth handshake, command dispatch, event relay
- [ ] `tests/routes.test.ts` — REST endpoint auth + response shapes
- [ ] `tests/tunnel.test.ts` — tunnel provider detection, URL parsing, lifecycle
- [ ] Mock `AgentSession` for unit tests (no real LLM calls)

### Phase 1 Deliverable

```bash
# Start a daemon — auto-detects tunnel, shows QR code
pi-web serve --cwd ~/projects/my-app

# Under the hood, WebSocket protocol works like this:
wscat -c ws://localhost:3100/ws
> {"type":"auth","token":"a7f3b2c1..."}
< {"type":"auth_ok","instanceId":"blue-fox-92","session":{...}}
> {"type":"prompt","message":"List files"}
< {"type":"agent_start"}
< {"type":"message_update",...}
< {"type":"agent_end",...}
```

---

## Phase 2 — `/remote` Extension

**Goal:** A pi extension that registers the `/remote` command. One command, zero config. Starts the server, detects connectivity, shows a QR code.

### 2.1 — Scaffold `packages/web-remote/`

- [ ] Create `package.json`:
  - `"name": "@ifi/pi-web-remote"`
  - Raw .ts (pi loads via jiti)
  - `"pi": { "extensions": ["./index.ts"] }`
  - Dependency: `@ifi/pi-web-server` (workspace)
  - Peer dependencies: `@mariozechner/pi-coding-agent`, `@sinclair/typebox`
- [ ] Add to `knope.toml` `versioned_files`

### 2.2 — Extension Implementation

- [ ] `index.ts` — Main extension
  - **`/remote`** — the only command the user needs to know
    - If not active: start server + show QR code
    - If already active: re-show QR code + connected client count
    - `/remote stop` — tear everything down
  - **Auto-detect everything on start:**
    1. Find a free port (start at 3100, increment if taken)
    2. Generate token
    3. Check for tunnel provider (`cloudflared` → `tailscale` → none)
    4. If tunnel found: start it, build QR URL as `https://pi-remote.dev?host=wss://TUNNEL_URL&t=TOKEN`
    5. If no tunnel: get LAN IP, build QR URL as `http://LAN_IP:PORT?t=TOKEN`
    6. Show QR code via `ctx.ui.custom()` overlay (auto-dismiss after 15s)
  - **Status line** — persistent `🌐 Remote: 2 clients` in footer via `ctx.ui.setStatus()`
  - **Session lifecycle** — on `session_shutdown`, stop server + tunnel. On `session_switch`, detach old session, attach new one.
  - **Client connect/disconnect** — `ctx.ui.notify()` toast in terminal

### 2.3 — Permission Gate

- [ ] When remote clients are connected, dangerous tool calls (`rm -rf`, `sudo`, sensitive path writes) trigger `ctx.ui.confirm()` which routes to the web client as an `extension_ui_request` dialog. Terminal user can also approve.

### 2.4 — Tests

- [ ] `tests/remote.test.ts` — auto-detect logic, server lifecycle

### Phase 2 Deliverable

```bash
pi
> /remote
# QR code appears. Scan it. Done.

> /remote
# Already active — shows QR again + "2 clients connected"

> /remote stop
# Everything stops
```

---

## Phase 3 — Client Library

**Goal:** A typed, platform-agnostic TypeScript client that works in browsers, React Native, and Node.js.

### 3.1 — Scaffold `packages/web-client/`

- [ ] Create `package.json`:
  - `"name": "@ifi/pi-web-client"`
  - `"type": "module"`, compiled to dist/
  - **Zero runtime dependencies** — uses native `WebSocket` API
  - Exports ESM + CJS for maximum compatibility
- [ ] `tsconfig.json` with `"lib": ["ES2022"]` — no DOM types
- [ ] Add to `knope.toml` `versioned_files`

### 3.2 — Client Core

- [ ] `src/types.ts` — Full TypeScript types mirroring pi's RPC protocol
  - All command types (prompt, steer, set_model, etc.)
  - All event types (agent_start, message_update, etc.)
  - `ConnectionState`, `SessionInfo`, `InstanceInfo`
  - No dependency on pi packages — types are self-contained

- [ ] `src/client.ts` — `PiWebClient` class

  ```typescript
  class PiWebClient {
  	constructor(options: PiWebClientOptions);

  	// Connection
  	connect(): Promise<InstanceInfo>;
  	disconnect(): void;
  	readonly state: "disconnected" | "connecting" | "authenticating" | "connected";
  	readonly instanceId: string | undefined;

  	// Conversation (mirrors RPC)
  	prompt(message: string, options?: PromptOptions): Promise<void>;
  	steer(message: string): Promise<void>;
  	followUp(message: string): Promise<void>;
  	abort(): Promise<void>;

  	// State queries
  	getState(): Promise<SessionState>;
  	getMessages(): Promise<AgentMessage[]>;
  	getSessionStats(): Promise<SessionStats>;
  	getCommands(): Promise<CommandInfo[]>;

  	// Model control
  	setModel(provider: string, modelId: string): Promise<Model>;
  	getAvailableModels(): Promise<Model[]>;
  	setThinkingLevel(level: ThinkingLevel): Promise<void>;

  	// Session management
  	compact(instructions?: string): Promise<CompactionResult>;
  	newSession(): Promise<{ cancelled: boolean }>;

  	// Event subscription (typed overloads)
  	on(event: "message_update", handler: (e: MessageUpdateEvent) => void): Unsubscribe;
  	on(event: "agent_start" | "agent_end", handler: (e: AgentEvent) => void): Unsubscribe;
  	on(event: "tool_execution_start", handler: (e: ToolStartEvent) => void): Unsubscribe;
  	on(event: "extension_ui_request", handler: (e: ExtensionUIRequest) => void): Unsubscribe;
  	on(event: "connection", handler: (state: ConnectionState) => void): Unsubscribe;
  	on(event: "error", handler: (error: Error) => void): Unsubscribe;

  	// Extension UI responses
  	respondToUI(requestId: string, response: ExtensionUIResponse): void;
  }

  interface PiWebClientOptions {
  	url: string; // ws://host:port/ws or wss://
  	token: string;
  	autoReconnect?: boolean; // default: true
  	reconnectInterval?: number;
  	WebSocket?: typeof WebSocket; // for environments without native WS
  }
  ```

- [ ] `src/reconnect.ts` — Auto-reconnection with exponential backoff
  - On reconnect: re-authenticate with same token
  - Fetch messages via `getMessages()` to re-sync UI state
  - Emit `connection` event so UI can show reconnecting state

### 3.3 — Platform Compatibility

- [ ] **Browser** — uses native `WebSocket`, works out of the box
- [ ] **React Native** — uses native `WebSocket`, works out of the box
- [ ] **Node.js 21+** — uses native `WebSocket`, works out of the box
- [ ] **Node.js <21** — pass `ws` library as `options.WebSocket`:
  ```typescript
  import WebSocket from "ws";
  const client = new PiWebClient({
  	url: "ws://localhost:3100/ws",
  	token: "...",
  	WebSocket: WebSocket as any,
  });
  ```
- [ ] No `Buffer`, `process`, `fs`, or other Node-only APIs in client code
- [ ] No `document`, `window`, or other DOM APIs in client code

### 3.4 — Tests

- [ ] `tests/client.test.ts` — auth flow, command/response, event dispatch
- [ ] `tests/reconnect.test.ts` — reconnection + state recovery
- [ ] Mock WebSocket for unit tests

### Phase 3 Deliverable

```typescript
// Works identically in browser, React Native, or Node.js
import { PiWebClient } from "@ifi/pi-web-client";

const client = new PiWebClient({
	url: "ws://192.168.1.42:3100/ws",
	token: "a7f3b2c1...",
});

await client.connect();

client.on("message_update", (e) => {
	if (e.assistantMessageEvent.type === "text_delta") {
		console.log(e.assistantMessageEvent.delta);
	}
});

await client.prompt("What files are here?");
```

---

## Phase 4 — Web UI

**Goal:** A React SPA served by the web server. Chat interface with tool output, model switching, and extension dialogs.

### 4.1 — Scaffold `packages/web-ui/`

- [ ] Create `package.json`:
  - `"name": "@ifi/pi-web-ui"`
  - Dependencies: `react`, `react-dom`, `@ifi/pi-web-client`
  - Dev dependencies: `vite`, `@vitejs/plugin-react`, `tailwindcss`
- [ ] Vite config: builds to `dist/`, `web-server` serves statically
- [ ] Add to `knope.toml` `versioned_files`

### 4.2 — Connection Screen

- [ ] `src/pages/Connect.tsx`
  - On load: read URL parameters:
    - `t` — token
    - `host` — pi-web server WebSocket URL (for hosted UI mode)
  - **Self-contained mode** (no `host` param): connect WebSocket to same origin
  - **Hosted UI mode** (`host` param present): connect WebSocket to the `host` URL
  - If token present: auto-connect, show connecting spinner
  - If no token: show manual entry form (paste a full pi-web URL or token + host)
  - On success: strip `t` from URL bar (`history.replaceState`; keep `host`), navigate to chat
  - On failure: show error with retry button
  - Store `host` in sessionStorage (survives refresh, not tabs) so the user doesn't need to re-enter it. **Never store token** — memory only.

### 4.3 — Core Layout

- [ ] `src/pages/Chat.tsx` — Main layout
  - Header: instance ID, model name, thinking level, connected indicator
  - Main area: scrollable message list
  - Input area: chat input with send/abort controls
  - Status bar: token usage, cost, context usage %

### 4.4 — Chat Components

- [ ] `src/components/ChatMessage.tsx`
  - User messages: plain text with markdown
  - Assistant messages: streaming text, markdown, code highlighting
  - Thinking blocks: collapsible sections
  - Tool calls: collapsible cards (tool name, args, result)

- [ ] `src/components/ChatInput.tsx`
  - Multi-line textarea with Shift+Enter for newlines
  - Send button + Enter to submit
  - During streaming: show abort button
  - Steering vs follow-up: Enter (steer) vs Shift+Enter (follow-up) during streaming
  - Image paste / drag-and-drop

- [ ] `src/components/ToolCard.tsx`
  - Collapsible card per tool call
  - `bash`: command + output (ANSI-to-HTML)
  - `read`: file path + syntax-highlighted content
  - `write`/`edit`: file path + diff view
  - Custom tools: JSON fallback

### 4.5 — Extension UI Dialogs

- [ ] `src/components/ExtensionDialog.tsx`
  - `select` → radio/button list modal
  - `confirm` → yes/no modal with countdown timer
  - `input` → text input modal
  - `editor` → textarea modal
  - `notify` → toast notification (non-blocking)
  - `setStatus` → status bar update

### 4.6 — Controls

- [ ] `src/components/ModelSelector.tsx` — dropdown + thinking level
- [ ] `src/components/ConnectionStatus.tsx` — connected/reconnecting indicator
- [ ] `src/components/SessionInfo.tsx` — tokens, cost, context %

### 4.7 — State Management

- [ ] `src/hooks/usePiClient.ts` — `PiWebClient` lifecycle + React state
- [ ] `src/hooks/useMessages.ts` — accumulate messages from events
- [ ] `src/hooks/useExtensionUI.ts` — dialog queue + auto-timeout

### 4.8 — Build Integration

- [ ] `web-server` serves `web-ui/dist/` at `GET /` with SPA fallback
- [ ] Dev mode: Vite dev server proxies `/ws` to `web-server`

### Phase 4 Deliverable

```bash
pi
> /remote
# QR code appears
# Scan with phone → full chat UI in mobile browser
# Type on phone → response appears in both terminal and phone
```

---

## Phase 5 — Advanced Features

### 5.1 — Session Branching & Tree View

- [ ] Visual tree navigator in web UI (mirrors pi's `/tree`)
- [ ] Fork from any message
- [ ] Labels / bookmarks

### 5.2 — Slash Commands & Skills

- [ ] `/` trigger in chat input with autocomplete
- [ ] List from `getCommands()`

### 5.3 — Security Hardening (Internal — No User Config)

- [ ] Auto-expire tokens after 30 days for daemon mode (re-run to refresh)
- [ ] Max 5 concurrent clients (hard limit, not configurable)
- [ ] Audit log to `~/.config/pi-web/audit.log`

### 5.4 — Hosted UI Deployment

- [ ] Publish and maintain `https://pi-remote.dev` (static SPA on Deno Deploy) so `/remote` with tunnel just works — no user deployment needed
- [ ] Vercel / Netlify / Deno Deploy adapters for self-hosting the UI

### 5.5 — React Native Starter

- [ ] Example React Native app in `examples/react-native/`
- [ ] Demonstrates: connect, chat, tool output, extension dialogs
- [ ] Uses `@ifi/pi-web-client` directly

---

## Build & CI Integration

### `knope.toml` — Add to `versioned_files`

```toml
"packages/web-server/package.json",
"packages/web-remote/package.json",
"packages/web-client/package.json",
"packages/web-ui/package.json",
```

### Root `package.json` — Update build script

```json
"build": "pnpm -r --filter @ifi/oh-pi-core --filter @ifi/oh-pi-cli --filter @ifi/pi-web-server --filter @ifi/pi-web-client --filter @ifi/pi-web-ui run build"
```

### Root `vitest.config.ts` — Add test globs

```typescript
"packages/web-server/tests/**/*.test.ts",
"packages/web-client/tests/**/*.test.ts",
"packages/web-remote/tests/**/*.test.ts",
```

### `biome.json` — Add source globs

```json
"packages/web-server/src/**/*.ts",
"packages/web-client/src/**/*.ts",
"packages/web-remote/**/*.ts",
"packages/web-ui/src/**/*.ts",
"packages/web-ui/src/**/*.tsx"
```

### `packages/oh-pi/bin/oh-pi.mjs` — Add to PACKAGES

```javascript
"@ifi/pi-web-remote",   // /remote command extension
// web-server is a dependency of web-remote, installed automatically
// web-client and web-ui are bundled into web-server
```

---

## Dependency Map

```
@ifi/pi-web-remote (pi extension: /remote command)
  ├── @ifi/pi-web-server (starts embedded server)
  └── @mariozechner/pi-coding-agent (peer dep)

@ifi/pi-web-server (embeddable server)
  ├── @ifi/pi-web-ui (bundled static assets)
  └── @mariozechner/pi-coding-agent (peer dep: SDK)

@ifi/pi-web-client (standalone client library)
  └── (no dependencies — platform-agnostic)

@ifi/pi-web-ui (React SPA)
  └── @ifi/pi-web-client
```

---

## Implementation Order

```
Phase 1: web-server          ← START HERE
  │
  ├── Phase 2: web-remote    ← needs web-server
  │
  ├── Phase 3: web-client    ← can start in parallel with phase 2
  │
  └── Phase 4: web-ui        ← needs web-client
        │
        └── Phase 5: advanced
```

Phase 1 (server) and Phase 3 (client) can be developed in parallel. Phase 2 (extension) needs Phase 1. Phase 4 (UI) needs Phase 3.

**Estimated effort:**

- Phase 1: ~3–4 days
- Phase 2: ~2 days
- Phase 3: ~2 days
- Phase 4: ~5–7 days
- Phase 5: ~5–7 days (incremental)
