import { once } from "node:events";
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { createPiWebServer, type PiWebServer } from "../src/server.js";
import type { AgentSessionLike } from "../src/ws-handler.js";

function createSession(): AgentSessionLike {
	const listeners = new Set<(event: unknown) => void>();
	return {
		prompt: vi.fn(async () => {}),
		steer: vi.fn(async () => {}),
		followUp: vi.fn(async () => {}),
		abort: vi.fn(async () => {}),
		compact: vi.fn(async () => ({ compacted: true })),
		setModel: vi.fn(async () => true),
		setThinkingLevel: vi.fn(),
		subscribe: vi.fn((listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}),
		isStreaming: false,
		messages: [{ role: "user", content: "hello" }],
		model: "openai/gpt-5-mini",
		thinkingLevel: "medium",
		sessionId: "session-1",
		sessionFile: "/tmp/session-1.jsonl",
		agent: { state: { systemPrompt: "You are helpful", tools: [] } },
		newSession: vi.fn(async () => ({ cancelled: false })),
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
	ws.send(JSON.stringify({ type: "auth", token: server.token }));
	const authMessage = await authPromise;
	return { ws, authMessage };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe.sequential("PiWebServer", () => {
	it("starts, serves authenticated routes, and stops cleanly", async () => {
		const session = createSession();
		const server = createPiWebServer({
			host: "127.0.0.1",
			port: await findFreePort(),
			token: "test-token",
		});
		server.attachSession(session);
		const started = await server.start();

		try {
			expect(started.url).toBe(server.url);
			expect(server.isRunning).toBe(true);
			expect(server.instanceId).toBeTruthy();
			expect(server.connectedClients).toBe(0);

			const health = await fetch(`${server.url}/api/health`);
			expect(health.status).toBe(200);
			expect(await health.json()).toEqual({
				status: "ok",
				uptime: expect.any(Number),
			});

			const state = await fetch(`${server.url}/api/session/state`, {
				headers: { Authorization: `Bearer ${server.token}` },
			});
			expect(state.status).toBe(200);
			expect(await state.json()).toEqual({
				model: "openai/gpt-5-mini",
				thinkingLevel: "medium",
				isStreaming: false,
				sessionId: "session-1",
				messageCount: 1,
			});

			server.detachSession();
			const detached = await fetch(`${server.url}/api/session/state`, {
				headers: { Authorization: `Bearer ${server.token}` },
			});
			expect(detached.status).toBe(503);
			expect(await detached.json()).toEqual({ error: "No session attached" });
		} finally {
			await server.stop();
		}

		expect(server.isRunning).toBe(false);
	});

	it("tracks authenticated websocket clients, enforces maxClients, and emits lifecycle events", async () => {
		const session = createSession();
		const server = createPiWebServer({
			host: "127.0.0.1",
			port: await findFreePort(),
			token: "test-token",
			maxClients: 1,
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
			expect(onConnect).toHaveBeenCalledTimes(1);

			secondClient = new WebSocket(server.url.replace("http://", "ws://"));
			await once(secondClient, "open");
			const closed = once(secondClient, "close");
			secondClient.send(JSON.stringify({ type: "auth", token: server.token }));
			const [code] = await closed;
			expect(code).toBe(4002);
			expect(server.connectedClients).toBe(1);

			const disconnected = once(firstClient, "close");
			firstClient.close(1000, "done");
			await disconnected;
			await vi.waitFor(() => {
				expect(onDisconnect).toHaveBeenCalledTimes(1);
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
		const server = createPiWebServer({
			host: "127.0.0.1",
			port: await findFreePort(),
			token: "test-token",
		});
		server.attachSession(session);
		const tunnelStop = vi.fn();
		server.setTunnel({
			publicUrl: "https://example.trycloudflare.com",
			provider: "cloudflared",
			stop: tunnelStop,
		});
		await server.start();

		const { ws } = await openAuthedClient(server);
		const closed = once(ws, "close");

		await server.stop();
		const [code] = await closed;

		expect(server.tunnelUrl).toBeUndefined();
		expect(tunnelStop).toHaveBeenCalledTimes(1);
		expect(code).toBe(1001);
		ws.removeAllListeners();
	});
});
