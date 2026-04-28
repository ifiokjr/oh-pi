import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentSessionLike } from "../src/ws-handler.js";
import { handleWebSocketConnection } from "../src/ws-handler.js";

class MockWebSocket extends EventEmitter {
	static OPEN = 1;
	OPEN = 1;
	readyState = MockWebSocket.OPEN;
	sent: unknown[] = [];
	closeCalls: Array<{ code: number; reason: string }> = [];

	send(data: string): void {
		this.sent.push(JSON.parse(data));
	}

	close(code = 1000, reason = ""): void {
		this.readyState = 3;
		this.closeCalls.push({ code, reason });
		this.emit("close");
	}

	async emitMessage(data: unknown): Promise<void> {
		for (const listener of this.listeners("message")) {
			await listener(data);
		}
	}
}

function createSession(overrides: Partial<AgentSessionLike> = {}): AgentSessionLike {
	return {
		prompt: vi.fn(async () => {}),
		steer: vi.fn(async () => {}),
		followUp: vi.fn(async () => {}),
		abort: vi.fn(async () => {}),
		compact: vi.fn(async () => ({ compacted: true })),
		setModel: vi.fn(async () => true),
		setThinkingLevel: vi.fn(),
		subscribe: vi.fn(() => vi.fn()),
		isStreaming: false,
		messages: [{ role: "user", content: "hello" }],
		model: "openai/gpt-5-mini",
		thinkingLevel: "medium",
		sessionId: "session-1",
		sessionFile: "/tmp/session-1.jsonl",
		agent: { state: { systemPrompt: "You are helpful", tools: [] } },
		newSession: vi.fn(async () => ({ cancelled: false })),
		...overrides,
	};
}

async function authenticateSocket(ws: MockWebSocket, token = "test-token") {
	await ws.emitMessage(JSON.stringify({ type: "auth", token }));
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("handleWebSocketConnection", () => {
	it("rejects invalid JSON before authentication", async () => {
		const ws = new MockWebSocket();
		handleWebSocketConnection(ws as never, {
			token: "test-token",
			instanceId: "instance-1",
			getSession: () => undefined,
		});

		await ws.emitMessage("not-json");

		expect(ws.sent).toEqual([{ type: "error", error: "Invalid JSON" }]);
		expect(ws.closeCalls).toEqual([]);
	});

	it("requires an auth handshake before processing commands", async () => {
		const ws = new MockWebSocket();
		handleWebSocketConnection(ws as never, {
			token: "test-token",
			instanceId: "instance-1",
			getSession: () => undefined,
		});

		await ws.emitMessage(JSON.stringify({ type: "prompt", message: "hello" }));

		expect(ws.sent).toEqual([{ type: "auth_error", reason: "auth_required" }]);
		expect(ws.closeCalls).toEqual([{ code: 4001, reason: "Auth required" }]);
	});

	it("rejects invalid tokens", async () => {
		const ws = new MockWebSocket();
		handleWebSocketConnection(ws as never, {
			token: "test-token",
			instanceId: "instance-1",
			getSession: () => undefined,
		});

		await authenticateSocket(ws, "wrong-token");

		expect(ws.sent).toEqual([{ type: "auth_error", reason: "invalid_token" }]);
		expect(ws.closeCalls).toEqual([{ code: 4001, reason: "Invalid token" }]);
	});

	it("authenticates, forwards session events, and disconnects cleanly", async () => {
		const ws = new MockWebSocket();
		const sessionEventListeners: Array<(event: unknown) => void> = [];
		const unsubscribe = vi.fn();
		const session = createSession({
			subscribe: vi.fn((listener) => {
				sessionEventListeners.push(listener);
				return unsubscribe;
			}),
		});
		const onClientConnect = vi.fn();
		const onClientDisconnect = vi.fn();

		handleWebSocketConnection(ws as never, {
			token: "test-token",
			instanceId: "instance-1",
			getSession: () => session,
			onClientConnect,
			onClientDisconnect,
		});

		await authenticateSocket(ws);
		expect(ws.sent[0]).toEqual({
			type: "auth_ok",
			instanceId: "instance-1",
			session: {
				sessionId: "session-1",
				isStreaming: false,
				model: "openai/gpt-5-mini",
				thinkingLevel: "medium",
			},
		});
		expect(onClientConnect).toHaveBeenCalledTimes(1);
		const clientId = onClientConnect.mock.calls[0]?.[0];
		expect(clientId).toEqual(expect.any(String));

		sessionEventListeners[0]?.({ type: "agent_event", detail: "tick" });
		expect(ws.sent.at(-1)).toEqual({ type: "agent_event", detail: "tick" });

		ws.close(1000, "done");
		expect(unsubscribe).toHaveBeenCalledTimes(1);
		expect(onClientDisconnect).toHaveBeenCalledWith(clientId);
	});

	it("returns a structured error when authenticated but no session is attached", async () => {
		const ws = new MockWebSocket();
		handleWebSocketConnection(ws as never, {
			token: "test-token",
			instanceId: "instance-1",
			getSession: () => undefined,
		});

		await authenticateSocket(ws);
		await ws.emitMessage(JSON.stringify({ id: "cmd-1", type: "get_state" }));

		expect(ws.sent.at(-1)).toEqual({
			type: "response",
			command: "get_state",
			success: false,
			error: "No session attached",
			id: "cmd-1",
		});
	});

	it("dispatches the supported command set once authenticated", async () => {
		const ws = new MockWebSocket();
		const session = createSession({ isStreaming: true });

		handleWebSocketConnection(ws as never, {
			token: "test-token",
			instanceId: "instance-1",
			getSession: () => session,
		});

		await authenticateSocket(ws);
		await ws.emitMessage(
			JSON.stringify({
				id: "cmd-1",
				type: "prompt",
				message: "stream me",
				streamingBehavior: "steer",
			}),
		);
		await ws.emitMessage(JSON.stringify({ id: "cmd-2", type: "steer", message: "faster" }));
		await ws.emitMessage(
			JSON.stringify({
				id: "cmd-3",
				type: "follow_up",
				message: "more detail",
			}),
		);
		await ws.emitMessage(JSON.stringify({ id: "cmd-4", type: "abort" }));
		await ws.emitMessage(JSON.stringify({ id: "cmd-5", type: "get_state" }));
		await ws.emitMessage(JSON.stringify({ id: "cmd-6", type: "get_messages" }));
		await ws.emitMessage(
			JSON.stringify({
				id: "cmd-7",
				type: "set_thinking_level",
				level: "high",
			}),
		);
		await ws.emitMessage(
			JSON.stringify({
				id: "cmd-8",
				type: "compact",
				customInstructions: "trim",
			}),
		);
		await ws.emitMessage(JSON.stringify({ id: "cmd-9", type: "new_session" }));
		await ws.emitMessage(JSON.stringify({ id: "cmd-10", type: "extension_ui_response" }));
		await ws.emitMessage(JSON.stringify({ id: "cmd-11", type: "unknown_command" }));

		expect(session.prompt).toHaveBeenCalledWith("stream me", {
			streamingBehavior: "steer",
		});
		expect(session.steer).toHaveBeenCalledWith("faster");
		expect(session.followUp).toHaveBeenCalledWith("more detail");
		expect(session.abort).toHaveBeenCalledTimes(1);
		expect(session.setThinkingLevel).toHaveBeenCalledWith("high");
		expect(session.compact).toHaveBeenCalledWith("trim");
		expect(session.newSession).toHaveBeenCalledTimes(1);

		expect(ws.sent).toContainEqual({
			type: "response",
			command: "prompt",
			success: true,
			id: "cmd-1",
		});
		expect(ws.sent).toContainEqual({
			type: "response",
			command: "get_state",
			success: true,
			data: {
				model: "openai/gpt-5-mini",
				thinkingLevel: "medium",
				isStreaming: true,
				sessionId: "session-1",
				sessionFile: "/tmp/session-1.jsonl",
				messageCount: 1,
			},
			id: "cmd-5",
		});
		expect(ws.sent).toContainEqual({
			type: "response",
			command: "get_messages",
			success: true,
			data: { messages: session.messages },
			id: "cmd-6",
		});
		expect(ws.sent).toContainEqual({
			type: "response",
			command: "compact",
			success: true,
			data: { compacted: true },
			id: "cmd-8",
		});
		expect(ws.sent).toContainEqual({
			type: "response",
			command: "new_session",
			success: true,
			data: { cancelled: false },
			id: "cmd-9",
		});
		expect(ws.sent).toContainEqual({
			type: "response",
			command: "unknown_command",
			success: false,
			error: "Unknown command: unknown_command",
			id: "cmd-11",
		});
	});

	it("returns structured command errors when the session throws", async () => {
		const ws = new MockWebSocket();
		const session = createSession({
			compact: vi.fn(() => Promise.reject(new Error("compact failed"))),
		});

		handleWebSocketConnection(ws as never, {
			token: "test-token",
			instanceId: "instance-1",
			getSession: () => session,
		});

		await authenticateSocket(ws);
		await ws.emitMessage(JSON.stringify({ id: "cmd-1", type: "compact" }));
		expect(ws.sent.at(-1)).toEqual({
			type: "response",
			command: "compact",
			success: false,
			error: "compact failed",
			id: "cmd-1",
		});

		ws.emit("error", new Error("socket error"));
		expect((session.subscribe as ReturnType<typeof vi.fn>).mock.results[0]?.value).toHaveBeenCalledTimes(1);
	});
});
