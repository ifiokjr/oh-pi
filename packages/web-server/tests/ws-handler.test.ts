import { EventEmitter } from "node:events";

import type { AgentSessionLike } from "../src/ws-handler.js";
import { handleWebSocketConnection } from "../src/ws-handler.js";

class MockWebSocket extends EventEmitter {
	static OPEN = 1;
	OPEN = 1;
	readyState = MockWebSocket.OPEN;
	sent: unknown[] = [];
	closeCalls: { code: number; reason: string }[] = [];

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
		subscribe: vi.fn(() => vi.fn()),
		thinkingLevel: "medium",
		...overrides,
	};
}

async function authenticateSocket(ws: MockWebSocket, token = "test-token") {
	await ws.emitMessage(JSON.stringify({ token, type: "auth" }));
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe(handleWebSocketConnection, () => {
	it("rejects invalid JSON before authentication", async () => {
		const ws = new MockWebSocket();
		handleWebSocketConnection(ws as never, {
			getSession: () => undefined,
			instanceId: "instance-1",
			token: "test-token",
		});

		await ws.emitMessage("not-json");

		expect(ws.sent).toStrictEqual([{ error: "Invalid JSON", type: "error" }]);
		expect(ws.closeCalls).toStrictEqual([]);
	});

	it("requires an auth handshake before processing commands", async () => {
		const ws = new MockWebSocket();
		handleWebSocketConnection(ws as never, {
			getSession: () => undefined,
			instanceId: "instance-1",
			token: "test-token",
		});

		await ws.emitMessage(JSON.stringify({ message: "hello", type: "prompt" }));

		expect(ws.sent).toStrictEqual([{ reason: "auth_required", type: "auth_error" }]);
		expect(ws.closeCalls).toStrictEqual([{ code: 4001, reason: "Auth required" }]);
	});

	it("rejects invalid tokens", async () => {
		const ws = new MockWebSocket();
		handleWebSocketConnection(ws as never, {
			getSession: () => undefined,
			instanceId: "instance-1",
			token: "test-token",
		});

		await authenticateSocket(ws, "wrong-token");

		expect(ws.sent).toStrictEqual([{ reason: "invalid_token", type: "auth_error" }]);
		expect(ws.closeCalls).toStrictEqual([{ code: 4001, reason: "Invalid token" }]);
	});

	it("authenticates, forwards session events, and disconnects cleanly", async () => {
		const ws = new MockWebSocket();
		const sessionEventListeners: ((event: unknown) => void)[] = [];
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
			getSession: () => session,
			instanceId: "instance-1",
			onClientConnect,
			onClientDisconnect,
			token: "test-token",
		});

		await authenticateSocket(ws);
		expect(ws.sent[0]).toStrictEqual({
			instanceId: "instance-1",
			session: {
				isStreaming: false,
				model: "openai/gpt-5-mini",
				sessionId: "session-1",
				thinkingLevel: "medium",
			},
			type: "auth_ok",
		});
		expect(onClientConnect).toHaveBeenCalledOnce();
		const clientId = onClientConnect.mock.calls[0]?.[0];
		expect(clientId).toStrictEqual(expect.any(String));

		sessionEventListeners[0]?.({ detail: "tick", type: "agent_event" });
		expect(ws.sent.at(-1)).toStrictEqual({ detail: "tick", type: "agent_event" });

		ws.close(1000, "done");
		expect(unsubscribe).toHaveBeenCalledOnce();
		expect(onClientDisconnect).toHaveBeenCalledWith(clientId);
	});

	it("returns a structured error when authenticated but no session is attached", async () => {
		const ws = new MockWebSocket();
		handleWebSocketConnection(ws as never, {
			getSession: () => undefined,
			instanceId: "instance-1",
			token: "test-token",
		});

		await authenticateSocket(ws);
		await ws.emitMessage(JSON.stringify({ id: "cmd-1", type: "get_state" }));

		expect(ws.sent.at(-1)).toStrictEqual({
			command: "get_state",
			error: "No session attached",
			id: "cmd-1",
			success: false,
			type: "response",
		});
	});

	it("dispatches the supported command set once authenticated", async () => {
		const ws = new MockWebSocket();
		const session = createSession({ isStreaming: true });

		handleWebSocketConnection(ws as never, {
			getSession: () => session,
			instanceId: "instance-1",
			token: "test-token",
		});

		await authenticateSocket(ws);
		await ws.emitMessage(
			JSON.stringify({ id: "cmd-1", message: "stream me", streamingBehavior: "steer", type: "prompt" }),
		);
		await ws.emitMessage(JSON.stringify({ id: "cmd-2", message: "faster", type: "steer" }));
		await ws.emitMessage(JSON.stringify({ id: "cmd-3", message: "more detail", type: "follow_up" }));
		await ws.emitMessage(JSON.stringify({ id: "cmd-4", type: "abort" }));
		await ws.emitMessage(JSON.stringify({ id: "cmd-5", type: "get_state" }));
		await ws.emitMessage(JSON.stringify({ id: "cmd-6", type: "get_messages" }));
		await ws.emitMessage(JSON.stringify({ id: "cmd-7", level: "high", type: "set_thinking_level" }));
		await ws.emitMessage(JSON.stringify({ customInstructions: "trim", id: "cmd-8", type: "compact" }));
		await ws.emitMessage(JSON.stringify({ id: "cmd-9", type: "new_session" }));
		await ws.emitMessage(JSON.stringify({ id: "cmd-10", type: "extension_ui_response" }));
		await ws.emitMessage(JSON.stringify({ id: "cmd-11", type: "unknown_command" }));

		expect(session.prompt).toHaveBeenCalledWith("stream me", { streamingBehavior: "steer" });
		expect(session.steer).toHaveBeenCalledWith("faster");
		expect(session.followUp).toHaveBeenCalledWith("more detail");
		expect(session.abort).toHaveBeenCalledOnce();
		expect(session.setThinkingLevel).toHaveBeenCalledWith("high");
		expect(session.compact).toHaveBeenCalledWith("trim");
		expect(session.newSession).toHaveBeenCalledOnce();

		expect(ws.sent).toContainEqual({ command: "prompt", id: "cmd-1", success: true, type: "response" });
		expect(ws.sent).toContainEqual({
			command: "get_state",
			data: {
				isStreaming: true,
				messageCount: 1,
				model: "openai/gpt-5-mini",
				sessionFile: "/tmp/session-1.jsonl",
				sessionId: "session-1",
				thinkingLevel: "medium",
			},
			id: "cmd-5",
			success: true,
			type: "response",
		});
		expect(ws.sent).toContainEqual({
			command: "get_messages",
			data: { messages: session.messages },
			id: "cmd-6",
			success: true,
			type: "response",
		});
		expect(ws.sent).toContainEqual({
			command: "compact",
			data: { compacted: true },
			id: "cmd-8",
			success: true,
			type: "response",
		});
		expect(ws.sent).toContainEqual({
			command: "new_session",
			data: { cancelled: false },
			id: "cmd-9",
			success: true,
			type: "response",
		});
		expect(ws.sent).toContainEqual({
			command: "unknown_command",
			error: "Unknown command: unknown_command",
			id: "cmd-11",
			success: false,
			type: "response",
		});
	});

	it("returns structured command errors when the session throws", async () => {
		const ws = new MockWebSocket();
		const session = createSession({
			compact: vi.fn(() => Promise.reject(new Error("compact failed"))),
		});

		handleWebSocketConnection(ws as never, {
			getSession: () => session,
			instanceId: "instance-1",
			token: "test-token",
		});

		await authenticateSocket(ws);
		await ws.emitMessage(JSON.stringify({ id: "cmd-1", type: "compact" }));
		expect(ws.sent.at(-1)).toStrictEqual({
			command: "compact",
			error: "compact failed",
			id: "cmd-1",
			success: false,
			type: "response",
		});

		ws.emit("error", new Error("socket error"));
		expect((session.subscribe as ReturnType<typeof vi.fn>).mock.results[0]?.value).toHaveBeenCalledOnce();
	});
});
