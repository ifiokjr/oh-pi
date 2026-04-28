import { describe, expect, it, vi } from "vitest";
import { PiWebClient } from "../src/client.js";

// Minimal mock WebSocket
class MockWebSocket {
	static OPEN = 1;
	readyState = 1;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;
	sent: string[] = [];

	constructor(public url: string) {
		// Simulate async open
		setTimeout(() => this.onopen?.(), 0);
	}

	send(data: string): void {
		this.sent.push(data);

		// Auto-respond to auth
		const msg = JSON.parse(data);
		if (msg.type === "auth") {
			setTimeout(() => {
				this.onmessage?.({
					data: JSON.stringify({
						type: "auth_ok",
						instanceId: "test-fox-42",
						session: {
							sessionId: "s1",
							isStreaming: false,
							model: null,
							thinkingLevel: "off",
						},
					}),
				});
			}, 0);
		}

		// Auto-respond to RPC commands
		if (msg.id && msg.type !== "auth") {
			setTimeout(() => {
				this.onmessage?.({
					data: JSON.stringify({
						type: "response",
						command: msg.type,
						success: true,
						data: {},
						id: msg.id,
					}),
				});
			}, 0);
		}
	}

	close(): void {
		this.readyState = 3;
		this.onclose?.();
	}
}

describe("PiWebClient", () => {
	it("connects and authenticates", async () => {
		const client = new PiWebClient({
			url: "ws://localhost:3100/ws",
			token: "test-token",
			autoReconnect: false,
			webSocket: MockWebSocket as unknown,
		});

		const info = await client.connect();
		expect(info.instanceId).toBe("test-fox-42");
		expect(info.sessionId).toBe("s1");
		expect(client.state).toBe("connected");
		expect(client.instanceId).toBe("test-fox-42");
	});

	it("sends prompt command", async () => {
		const client = new PiWebClient({
			url: "ws://localhost:3100/ws",
			token: "test-token",
			autoReconnect: false,
			webSocket: MockWebSocket as unknown,
		});

		await client.connect();
		await client.prompt("Hello");

		// Find the prompt message in sent data
		const ws = (client as unknown as { _ws: MockWebSocket })._ws;
		const promptMsg = ws.sent.find((s) => {
			const msg = JSON.parse(s);
			return msg.type === "prompt";
		});
		expect(promptMsg).toBeDefined();
		const parsed = JSON.parse(promptMsg!);
		expect(parsed.message).toBe("Hello");
	});

	it("subscribes to events", async () => {
		const client = new PiWebClient({
			url: "ws://localhost:3100/ws",
			token: "test-token",
			autoReconnect: false,
			webSocket: MockWebSocket as unknown,
		});

		await client.connect();

		const handler = vi.fn();
		const unsub = client.on("agent_start", handler);

		// Simulate server event
		const ws = (client as unknown as { _ws: MockWebSocket })._ws;
		ws.onmessage?.({ data: JSON.stringify({ type: "agent_start" }) });

		expect(handler).toHaveBeenCalledTimes(1);

		unsub();
		ws.onmessage?.({ data: JSON.stringify({ type: "agent_start" }) });
		expect(handler).toHaveBeenCalledTimes(1); // Not called again
	});

	it("disconnects cleanly", async () => {
		const client = new PiWebClient({
			url: "ws://localhost:3100/ws",
			token: "test-token",
			autoReconnect: false,
			webSocket: MockWebSocket as unknown,
		});

		await client.connect();
		client.disconnect();
		expect(client.state).toBe("disconnected");
	});
});
