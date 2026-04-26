import { once } from "node:events";
import { createServer } from "node:http";

import { WebSocket } from "ws";
import { createPiWebServer } from '../src/server.js';
import type { PiWebServer } from '../src/server.js';
import type { AgentSessionLike } from "../src/ws-handler.js";

function createSession(): AgentSessionLike {
	const listeners = new Set<(event: unknown) => void>();
	return {
		abort: vi.fn(async () => {}),
		agent: { state: { systemPrompt: "You are helpful", tools: [] } },
		compact: vi.fn(async () => ({ compacted: true })),
		followUp: vi.fn(async () => {}),
		isStreaming: false,
		messages: [{ role: "user", content: "hello" }],
		model: "openai/gpt-5-mini",
		newSession: vi.fn(async () => ({ cancelled: false })),
		prompt: vi.fn(async () => {}),
		sessionFile: "/tmp/session-1.jsonl",
		sessionId: "session-1",
		setModel: vi.fn(async () => true),
		setThinkingLevel: vi.fn(),
		steer: vi.fn(async () => {}),
		subscribe: vi.fn((listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}),
		thinkingLevel: "medium",
	};
}

async function findFreePort(): Promise<number> {
	const probe = createServer();
	await new Promise<void>((resolve, reject) => {
		probe.listen(0, "127.0.0.1", () => resolve());
		probe.once("error", reject);
	});
	const address = probe.address();
	if (!address || typeof address === "string") {
		throw new Error("Expected an ephemeral TCP port.");
	}
	const { port } = address;
	await new Promise<void>((resolve, reject) => {
		probe.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
	return port;
}

async function openAuthedClient(server: PiWebServer): Promise<{ ws: WebSocket; authMessage: any }> {
	const ws = new WebSocket(server.url.replace("http://", "ws://"));
	await once(ws, "open");
	const authPromise = once(ws, "message").then(([message]) => JSON.parse(message.toString()));
	ws.send(JSON.stringify({ token: server.token, type: "auth" }));
	const authMessage = await authPromise;
	return { authMessage, ws };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe.sequential("piWebServer", () => {
	it("starts, serves authenticated routes, and stops cleanly", async () => {
		const session = createSession();
		const server = createPiWebServer({ host: "127.0.0.1", port: await findFreePort(), token: "test-token" });
		server.attachSession(session);
		const started = await server.start();

		try {
			expect(started.url).toBe(server.url);
			expect(server.isRunning).toBeTruthy();
			expect(server.instanceId).toBe(true);
			expect(server.connectedClients).toBe(0);

			const health = await fetch(`${server.url}/api/health`);
			expect(health.status).toBe(200);
			await expect(health.json()).resolves.toStrictEqual({ status: "ok", uptime: expect.any(Number) });

			const state = await fetch(`${server.url}/api/session/state`, {
				headers: { Authorization: `Bearer ${server.token}` },
			});
			expect(state.status).toBe(200);
			await expect(state.json()).resolves.toStrictEqual({
				isStreaming: false,
				messageCount: 1,
				model: "openai/gpt-5-mini",
				sessionId: "session-1",
				thinkingLevel: "medium",
			});

			server.detachSession();
			const detached = await fetch(`${server.url}/api/session/state`, {
				headers: { Authorization: `Bearer ${server.token}` },
			});
			expect(detached.status).toBe(503);
			await expect(detached.json()).resolves.toStrictEqual({ error: "No session attached" });
		} finally {
			await server.stop();
		}

		expect(server.isRunning).toBeFalsy();
	});

	it("tracks authenticated websocket clients, enforces maxClients, and emits lifecycle events", async () => {
		const session = createSession();
		const server = createPiWebServer({
			host: "127.0.0.1",
			maxClients: 1,
			port: await findFreePort(),
			token: "test-token",
		});
		server.attachSession(session);
		const onConnect = vi.fn();
		const onDisconnect = vi.fn();
		server.on("client_connect", onConnect);
		server.on("client_disconnect", onDisconnect);
		await server.start();

		let firstClient: WebSocket | undefined;
		let secondClient: WebSocket | undefined;
		try {
			const first = await openAuthedClient(server);
			firstClient = first.ws;
			expect(first.authMessage.type).toBe("auth_ok");
			expect(server.connectedClients).toBe(1);
			expect(onConnect).toHaveBeenCalledOnce();

			secondClient = new WebSocket(server.url.replace("http://", "ws://"));
			await once(secondClient, "open");
			const closed = once(secondClient, "close");
			secondClient.send(JSON.stringify({ token: server.token, type: "auth" }));
			const [code] = await closed;
			expect(code).toBe(4002);
			expect(server.connectedClients).toBe(1);

			const disconnected = once(firstClient, "close");
			firstClient.close(1000, "done");
			await disconnected;
			await vi.waitFor(() => {
				expect(onDisconnect).toHaveBeenCalledOnce();
				expect(server.connectedClients).toBe(0);
			});
		} finally {
			if (secondClient?.readyState === WebSocket.OPEN) {
				secondClient.close();
			}
			if (firstClient?.readyState === WebSocket.OPEN) {
				firstClient.close();
			}
			await server.stop();
		}
	});

	it("exposes tunnel metadata and closes connected clients during shutdown", async () => {
		const session = createSession();
		const server = createPiWebServer({ host: "127.0.0.1", port: await findFreePort(), token: "test-token" });
		server.attachSession(session);
		const tunnelStop = vi.fn();
		server.setTunnel({ provider: "cloudflared", publicUrl: "https://example.trycloudflare.com", stop: tunnelStop });
		await server.start();

		const { ws } = await openAuthedClient(server);
		const closed = once(ws, "close");

		await server.stop();
		const [code] = await closed;

		expect(server.tunnelUrl).toBeUndefined();
		expect(tunnelStop).toHaveBeenCalledOnce();
		expect(code).toBe(1001);
		ws.removeAllListeners();
	});
});
