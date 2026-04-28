import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const providerMocks = vi.hoisted(() => {
	const streams: any[] = [];
	const connections: any[] = [];

	class FakeConnection {
		public handlers: Record<string, (...args: any[]) => void> = {};
		public options: any;
		public writes: any[] = [];
		public startHeartbeat = vi.fn();
		public write = vi.fn((data: unknown) => {
			this.writes.push(data);
		});
		public setHandlers = vi.fn((handlers: Record<string, (...args: any[]) => void>) => {
			this.handlers = handlers;
		});
		public clearHandlers = vi.fn(() => {
			this.handlers = {};
		});
		public close = vi.fn();

		constructor(options: any) {
			this.options = options;
			connections.push(this);
		}
	}

	return {
		streams,
		connections,
		FakeConnection,
		create: vi.fn((_schema: unknown, value: unknown) => value),
		fromBinary: vi.fn((_schema: unknown, value: unknown) => value),
		toBinary: vi.fn((_schema: unknown, value: unknown) => value),
		calculateCost: vi.fn(),
		createAssistantMessageEventStream: vi.fn(() => {
			const stream = {
				events: [] as any[],
				push: vi.fn((event: any) => {
					stream.events.push(event);
				}),
				end: vi.fn(),
			};
			streams.push(stream);
			return stream;
		}),
		getEnvApiKey: vi.fn(() => "cursor-token"),
		buildCursorRequestPayload: vi.fn(() => ({
			requestBytes: { framed: true },
			blobStore: new Map([["blob", new Uint8Array([1])]]),
			mcpTools: [{ name: "echo" }],
		})),
		decodeMcpArgsMap: vi.fn((args: Record<string, unknown>) => args),
		makeHeartbeatFrame: vi.fn(() => new Uint8Array([1])),
		parseCursorConversation: vi.fn(() => ({
			seed: "seed-text",
			userText: "Do the thing",
			trailingToolResults: [],
		})),
		sendExecResult: vi.fn(
			(_execId: string, _msgId: string, _kind: string, _result: unknown, write: (data: unknown) => void) => {
				write({ ack: _kind, execId: _execId });
			},
		),
		sendKvBlobResponse: vi.fn(
			(_message: unknown, _blobStore: Map<string, Uint8Array>, write: (data: unknown) => void) => {
				write({ ack: "kv" });
			},
		),
		sendRequestContextResult: vi.fn(
			(_execId: string, _msgId: string, _tools: unknown[], write: (data: unknown) => void) => {
				write({ ack: "requestContext" });
			},
		),
		cleanupCursorRuntimeState: vi.fn(),
		deleteActiveRun: vi.fn(),
		deriveBridgeKey: vi.fn((conversationKey: string, modelId: string) => `${conversationKey}:${modelId}`),
		deriveConversationKey: vi.fn((sessionId: string | undefined, seed: string) =>
			sessionId ? `session:${sessionId}` : `seed:${seed}`,
		),
		deterministicConversationId: vi.fn((conversationKey: string) => `conv:${conversationKey}`),
		getActiveRun: vi.fn(() => undefined),
		getConversationState: vi.fn(() => undefined),
		setActiveRun: vi.fn(),
		upsertConversationState: vi.fn(),
		createConnectFrameParser: vi.fn(
			(onMessage: (payload: unknown) => void, onEnd: (payload: unknown) => void) =>
				(payload: { kind: "message" | "end"; value: unknown }) => {
					if (payload.kind === "end") {
						onEnd(payload.value);
						return;
					}
					onMessage(payload.value);
				},
		),
		frameConnectMessage: vi.fn((payload: unknown) => ({ framed: payload })),
		parseConnectEndStream: vi.fn(() => null),
	};
});

vi.mock("@bufbuild/protobuf", () => ({
	create: providerMocks.create,
	fromBinary: providerMocks.fromBinary,
	toBinary: providerMocks.toBinary,
}));

vi.mock("@mariozechner/pi-ai", () => ({
	calculateCost: providerMocks.calculateCost,
	createAssistantMessageEventStream: providerMocks.createAssistantMessageEventStream,
	getEnvApiKey: providerMocks.getEnvApiKey,
}));

vi.mock("../messages.js", () => ({
	buildCursorRequestPayload: providerMocks.buildCursorRequestPayload,
	decodeMcpArgsMap: providerMocks.decodeMcpArgsMap,
	makeHeartbeatFrame: providerMocks.makeHeartbeatFrame,
	parseCursorConversation: providerMocks.parseCursorConversation,
	sendExecResult: providerMocks.sendExecResult,
	sendKvBlobResponse: providerMocks.sendKvBlobResponse,
	sendRequestContextResult: providerMocks.sendRequestContextResult,
}));

vi.mock("../runtime.js", () => ({
	cleanupCursorRuntimeState: providerMocks.cleanupCursorRuntimeState,
	deleteActiveRun: providerMocks.deleteActiveRun,
	deriveBridgeKey: providerMocks.deriveBridgeKey,
	deriveConversationKey: providerMocks.deriveConversationKey,
	deterministicConversationId: providerMocks.deterministicConversationId,
	getActiveRun: providerMocks.getActiveRun,
	getConversationState: providerMocks.getConversationState,
	setActiveRun: providerMocks.setActiveRun,
	upsertConversationState: providerMocks.upsertConversationState,
}));

vi.mock("../transport.js", () => ({
	createConnectFrameParser: providerMocks.createConnectFrameParser,
	CursorStreamingConnection: providerMocks.FakeConnection,
	frameConnectMessage: providerMocks.frameConnectMessage,
	parseConnectEndStream: providerMocks.parseConnectEndStream,
}));

import { streamSimpleCursor } from "../provider.js";

function createModel() {
	return {
		provider: "cursor",
		id: "composer-2",
		api: "cursor-agent",
		baseUrl: "https://cursor.test",
	};
}

function createContext() {
	return {
		systemPrompt: "You are helpful.",
		messages: [],
		tools: [
			{
				name: "echo",
				description: "Echo text",
				parameters: { type: "object" },
			},
		],
	};
}

async function flushMicrotasks() {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

beforeEach(() => {
	providerMocks.streams.length = 0;
	providerMocks.connections.length = 0;
	for (const mock of Object.values(providerMocks)) {
		if (typeof mock === "function" && "mockReset" in mock) {
			(mock as ReturnType<typeof vi.fn>).mockReset();
		}
	}

	providerMocks.create.mockImplementation((_schema: unknown, value: unknown) => value);
	providerMocks.fromBinary.mockImplementation((_schema: unknown, value: unknown) => value);
	providerMocks.toBinary.mockImplementation((_schema: unknown, value: unknown) => value);
	providerMocks.getEnvApiKey.mockReturnValue("cursor-token");
	providerMocks.createAssistantMessageEventStream.mockImplementation(() => {
		const stream = {
			events: [] as any[],
			push: vi.fn((event: any) => {
				stream.events.push(event);
			}),
			end: vi.fn(),
		};
		providerMocks.streams.push(stream);
		return stream;
	});
	providerMocks.buildCursorRequestPayload.mockReturnValue({
		requestBytes: new Uint8Array([1, 2, 3]),
		blobStore: new Map([["blob", new Uint8Array([1, 2, 3])]]),
		mcpTools: [{ name: "echo" }],
	} as never);
	providerMocks.decodeMcpArgsMap.mockImplementation((args: Record<string, unknown>) => args);
	providerMocks.parseCursorConversation.mockReturnValue({
		seed: "seed-text",
		userText: "Do the thing",
		trailingToolResults: [],
	});
	providerMocks.sendExecResult.mockImplementation(
		(_execId: string, _msgId: string, kind: string, _result: unknown, write: (data: unknown) => void) => {
			write({ ack: kind, execId: _execId });
		},
	);
	providerMocks.sendKvBlobResponse.mockImplementation(
		(_message: unknown, _blobStore: Map<string, Uint8Array>, write: (data: unknown) => void) => {
			write({ ack: "kv" });
		},
	);
	providerMocks.sendRequestContextResult.mockImplementation(
		(_execId: string, _msgId: string, _tools: unknown[], write: (data: unknown) => void) => {
			write({ ack: "requestContext" });
		},
	);
	providerMocks.deriveBridgeKey.mockImplementation(
		(conversationKey: string, modelId: string) => `${conversationKey}:${modelId}`,
	);
	providerMocks.deriveConversationKey.mockImplementation((sessionId: string | undefined, seed: string) =>
		sessionId ? `session:${sessionId}` : `seed:${seed}`,
	);
	providerMocks.deterministicConversationId.mockImplementation((conversationKey: string) => `conv:${conversationKey}`);
	providerMocks.getActiveRun.mockReturnValue(undefined);
	providerMocks.getConversationState.mockReturnValue(undefined);
	providerMocks.createConnectFrameParser.mockImplementation(
		(onMessage: (payload: unknown) => void, onEnd: (payload: unknown) => void) =>
			(payload: { kind: "message" | "end"; value: unknown }) => {
				if (payload.kind === "end") {
					onEnd(payload.value);
					return;
				}
				onMessage(payload.value);
			},
	);
	providerMocks.frameConnectMessage.mockImplementation((payload: unknown) => ({
		framed: payload,
	}));
	providerMocks.parseConnectEndStream.mockReturnValue(null);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("streamSimpleCursor", () => {
	it("throws when no Cursor API key is available", () => {
		providerMocks.getEnvApiKey.mockReturnValueOnce(undefined as never);
		expect(() => streamSimpleCursor(createModel() as never, createContext() as never)).toThrow(
			"No API key for provider: cursor",
		);
	});

	it("emits an error when no prompt or resumable tool results are available", async () => {
		providerMocks.parseCursorConversation.mockReturnValueOnce({
			seed: "seed-text",
			userText: "   ",
			trailingToolResults: [],
		});

		const stream = streamSimpleCursor(
			createModel() as never,
			createContext() as never,
			{ sessionId: "session-1" } as never,
		) as any;
		await flushMicrotasks();

		expect(providerMocks.cleanupCursorRuntimeState).toHaveBeenCalledTimes(1);
		expect(stream.events[0]).toMatchObject({ type: "start" });
		expect(stream.events.at(-1)).toMatchObject({
			type: "error",
			reason: "error",
			error: expect.objectContaining({
				errorMessage: "Cursor provider requires a user prompt or resumable tool results.",
			}),
		});
		expect(stream.end).toHaveBeenCalledTimes(1);
	});

	it("resumes active runs, sends pending tool results, and completes on close", async () => {
		const activeConnection = new providerMocks.FakeConnection({
			url: "https://cursor.test",
		});
		const activeRun = {
			connection: activeConnection,
			blobStore: new Map(),
			mcpTools: [{ name: "echo" }],
			pendingExecs: [
				{
					execId: "exec-1",
					execMsgId: "msg-1",
					toolCallId: "call-1",
					toolName: "echo",
					decodedArgs: "{}",
				},
				{
					execId: "exec-2",
					execMsgId: "msg-2",
					toolCallId: "call-2",
					toolName: "echo",
					decodedArgs: "{}",
				},
			],
			lastAccessMs: Date.now(),
		};
		providerMocks.parseCursorConversation.mockReturnValueOnce({
			seed: "seed-text",
			userText: "",
			trailingToolResults: [
				{
					toolCallId: "call-1",
					toolName: "echo",
					content: "pong",
					isError: false,
				},
			],
		} as never);
		providerMocks.getActiveRun.mockReturnValueOnce(activeRun as never);

		const stream = streamSimpleCursor(
			createModel() as never,
			createContext() as never,
			{ sessionId: "session-1" } as never,
		) as any;
		await flushMicrotasks();

		expect(providerMocks.sendExecResult).toHaveBeenCalledTimes(2);
		expect(activeRun.pendingExecs).toEqual([]);

		activeConnection.handlers.onClose?.();
		await flushMicrotasks();

		expect(providerMocks.deleteActiveRun).toHaveBeenCalledWith("session:session-1:composer-2");
		expect(providerMocks.calculateCost).toHaveBeenCalledTimes(1);
		expect(stream.events.at(-1)).toMatchObject({
			type: "done",
			reason: "stop",
			message: expect.objectContaining({ stopReason: "stop" }),
		});
		expect(stream.end).toHaveBeenCalledTimes(1);
	});

	it("streams new runs, handles server messages, and switches to tool-use mode on MCP execution", async () => {
		const onPayload = vi.fn();
		providerMocks.getConversationState.mockReturnValueOnce({
			conversationId: "saved-conv",
			blobStore: new Map(),
			lastAccessMs: 0,
		} as never);

		const stream = streamSimpleCursor(
			createModel() as never,
			createContext() as never,
			{
				sessionId: "session-1",
				onPayload,
			} as never,
		) as any;
		await flushMicrotasks();

		const connection = providerMocks.connections[0];
		expect(connection.options).toMatchObject({
			accessToken: "cursor-token",
			rpcPath: expect.anything(),
			url: "https://cursor.test",
		});
		expect(connection.startHeartbeat).toHaveBeenCalledWith(providerMocks.makeHeartbeatFrame);
		expect(connection.write).toHaveBeenCalledWith({
			framed: new Uint8Array([1, 2, 3]),
		});
		expect(onPayload).toHaveBeenCalledWith({
			model: "composer-2",
			conversationId: "saved-conv",
			toolCount: 1,
		});

		connection.handlers.onData?.({
			kind: "message",
			value: {
				message: {
					case: "interactionUpdate",
					value: {
						message: {
							case: "textDelta",
							value: { text: "Hello <think>secret" },
						},
					},
				},
			},
		});
		connection.handlers.onData?.({
			kind: "message",
			value: {
				message: {
					case: "interactionUpdate",
					value: {
						message: {
							case: "textDelta",
							value: { text: " plan</think> world" },
						},
					},
				},
			},
		});
		connection.handlers.onData?.({
			kind: "message",
			value: {
				message: {
					case: "interactionUpdate",
					value: {
						message: { case: "thinkingDelta", value: { text: "deep thought" } },
					},
				},
			},
		});
		connection.handlers.onData?.({
			kind: "message",
			value: {
				message: {
					case: "interactionUpdate",
					value: { message: { case: "tokenDelta", value: { tokens: 7 } } },
				},
			},
		});
		connection.handlers.onData?.({
			kind: "message",
			value: {
				message: { case: "kvServerMessage", value: { blobId: "blob-1" } },
			},
		});
		connection.handlers.onData?.({
			kind: "message",
			value: {
				message: {
					case: "conversationCheckpointUpdate",
					value: { tokenDetails: { usedTokens: 25 }, checkpoint: true },
				},
			},
		});
		connection.handlers.onData?.({
			kind: "message",
			value: {
				message: {
					case: "execServerMessage",
					value: {
						execId: "1",
						id: "a",
						message: { case: "requestContextArgs", value: {} },
					},
				},
			},
		});
		for (const execCase of [
			["readArgs", { path: "/tmp/readme.md" }],
			["writeArgs", { path: "/tmp/out.md" }],
			["deleteArgs", { path: "/tmp/old.md" }],
			["grepArgs", {}],
			["fetchArgs", { url: "https://example.com" }],
			["shellArgs", { command: "ls", workingDirectory: "/repo" }],
			[
				"backgroundShellSpawnArgs",
				{
					command: "npm test",
					workingDirectory: "/repo",
				},
			],
			["writeShellStdinArgs", {}],
			["diagnosticsArgs", {}],
		] as const) {
			connection.handlers.onData?.({
				kind: "message",
				value: {
					message: {
						case: "execServerMessage",
						value: {
							execId: `${execCase[0]}`,
							id: `msg-${execCase[0]}`,
							message: { case: execCase[0], value: execCase[1] },
						},
					},
				},
			});
		}
		connection.handlers.onData?.({
			kind: "message",
			value: {
				message: {
					case: "execServerMessage",
					value: {
						execId: "mcp-1",
						id: "mcp-msg-1",
						message: {
							case: "mcpArgs",
							value: {
								toolCallId: "tool-1",
								toolName: "echo",
								name: "echo",
								args: { text: "ping" },
							},
						},
					},
				},
			},
		});
		await flushMicrotasks();

		expect(providerMocks.sendKvBlobResponse).toHaveBeenCalledTimes(1);
		expect(providerMocks.sendRequestContextResult).toHaveBeenCalledTimes(1);
		expect(providerMocks.sendExecResult).toHaveBeenCalledTimes(9);
		expect(providerMocks.upsertConversationState).toHaveBeenCalledTimes(1);
		expect(providerMocks.setActiveRun).toHaveBeenCalledWith(
			"session:session-1:composer-2",
			expect.objectContaining({
				pendingExecs: expect.arrayContaining([expect.objectContaining({ toolCallId: "tool-1" })]),
			}),
		);
		expect(connection.clearHandlers).toHaveBeenCalledTimes(1);
		expect(stream.events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "start" }),
				expect.objectContaining({ type: "text_start" }),
				expect.objectContaining({ type: "text_delta", delta: "Hello " }),
				expect.objectContaining({ type: "text_delta", delta: " world" }),
				expect.objectContaining({ type: "thinking_start" }),
				expect.objectContaining({ type: "thinking_delta", delta: "secret" }),
				expect.objectContaining({ type: "thinking_delta", delta: " plan" }),
				expect.objectContaining({
					type: "thinking_delta",
					delta: "deep thought",
				}),
				expect.objectContaining({ type: "toolcall_start" }),
				expect.objectContaining({
					type: "toolcall_delta",
					delta: '{"text":"ping"}',
				}),
				expect.objectContaining({
					type: "toolcall_end",
					toolCall: expect.objectContaining({ id: "tool-1", name: "echo" }),
				}),
				expect.objectContaining({
					type: "done",
					reason: "toolUse",
					message: expect.objectContaining({ stopReason: "toolUse" }),
				}),
			]),
		);
		expect(stream.end).toHaveBeenCalledTimes(1);
	});

	it("emits an aborted error when the caller signal aborts an in-flight run", async () => {
		const controller = new AbortController();
		const stream = streamSimpleCursor(
			createModel() as never,
			createContext() as never,
			{
				signal: controller.signal,
			} as never,
		) as any;
		await flushMicrotasks();

		const connection = providerMocks.connections[0];
		controller.abort();
		await flushMicrotasks();

		expect(connection.close).toHaveBeenCalledTimes(1);
		expect(stream.events.at(-1)).toMatchObject({
			type: "error",
			reason: "aborted",
			error: expect.objectContaining({
				stopReason: "aborted",
				errorMessage: "Request was aborted",
			}),
		});
		expect(stream.end).toHaveBeenCalledTimes(1);
	});
});
