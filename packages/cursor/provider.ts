import { randomUUID } from "node:crypto";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { calculateCost, createAssistantMessageEventStream, getEnvApiKey } from "@mariozechner/pi-ai";
import type {
	AssistantMessage,
	AssistantMessageEventStream,
	Context,
	Model,
	SimpleStreamOptions,
	ToolCall,
} from "@mariozechner/pi-ai";
import {
	AgentServerMessageSchema,
	BackgroundShellSpawnResultSchema,
	ConversationStateStructureSchema,
	DeleteRejectedSchema,
	DeleteResultSchema,
	DiagnosticsResultSchema,
	FetchErrorSchema,
	FetchResultSchema,
	GrepErrorSchema,
	GrepResultSchema,
	McpErrorSchema,
	McpResultSchema,
	McpSuccessSchema,
	McpTextContentSchema,
	McpToolResultContentItemSchema,
	ReadRejectedSchema,
	ReadResultSchema,
	ShellRejectedSchema,
	ShellResultSchema,
	WriteRejectedSchema,
	WriteResultSchema,
	WriteShellStdinErrorSchema,
	WriteShellStdinResultSchema,
} from "./proto/agent_pb.js";
import {
	buildCursorRequestPayload,
	decodeMcpArgsMap,
	makeHeartbeatFrame,
	parseCursorConversation,
	sendExecResult,
	sendKvBlobResponse,
	sendRequestContextResult,
} from "./messages.js";
import type { PendingExec, ToolResultInfo } from "./messages.js";
import { CURSOR_RUN_PATH } from "./config.js";
import {
	cleanupCursorRuntimeState,
	deleteActiveRun,
	deriveBridgeKey,
	deriveConversationKey,
	deterministicConversationId,
	getActiveRun,
	getConversationState,
	setActiveRun,
	upsertConversationState,
} from "./runtime.js";
import type { ActiveCursorRun } from "./runtime.js";
import {
	CursorStreamingConnection,
	createConnectFrameParser,
	frameConnectMessage,
	parseConnectEndStream,
} from "./transport.js";

const REJECT_REASON = "Tool not available in this environment. Use the MCP tools provided by pi instead.";
const THINKING_TAG_NAMES = ["think", "thinking", "reasoning", "thought", "think_intent"];
const MAX_THINKING_TAG_LEN = 16;
// Pre-compiled thinking tag pattern — avoid new RegExp() per stream chunk.
const THINKING_TAG_PATTERN = new RegExp(`<(/?)(?:${THINKING_TAG_NAMES.join("|")})\\s*>`, "gi");

interface StreamState {
	outputTokens: number;
	totalTokens: number;
	pendingExecs: PendingExec[];
}

interface RuntimeOptions {
	bridgeKey: string;
	conversationKey: string;
	model: Model<string>;
	output: AssistantMessage;
	stream: AssistantMessageEventStream;
	signal?: AbortSignal;
}

export const streamSimpleCursor = (
	model: Model<string>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream => {
	const apiKey = options?.apiKey || getEnvApiKey(model.provider);
	if (!apiKey) {
		throw new Error(`No API key for provider: ${model.provider}`);
	}

	const stream = createAssistantMessageEventStream();
	const output = createOutput(model);

	(async () => {
		try {
			cleanupCursorRuntimeState();
			const parsed = parseCursorConversation(context);
			const conversationKey = deriveConversationKey(options?.sessionId, parsed.seed);
			const bridgeKey = deriveBridgeKey(conversationKey, model.id);

			stream.push({ partial: output, type: "start" });

			const activeRun = parsed.trailingToolResults.length > 0 ? getActiveRun(bridgeKey) : undefined;
			if (activeRun) {
				await resumeActiveRun(
					{ bridgeKey, conversationKey, model, output, signal: options?.signal, stream },
					activeRun,
					parsed.trailingToolResults,
				);
				return;
			}

			if (!parsed.userText.trim()) {
				throw new Error("Cursor provider requires a user prompt or resumable tool results.");
			}

			const stateRecord = getConversationState(conversationKey);
			const conversationId = stateRecord?.conversationId ?? deterministicConversationId(conversationKey);
			const payload = buildCursorRequestPayload({
				conversationId,
				conversationState: stateRecord,
				modelId: model.id,
				parsed,
				tools: context.tools,
			});
			options?.onPayload?.({ conversationId, model: model.id, toolCount: payload.mcpTools.length });
			const connection = new CursorStreamingConnection({
				accessToken: apiKey,
				rpcPath: CURSOR_RUN_PATH,
				url: model.baseUrl,
			});
			connection.startHeartbeat(makeHeartbeatFrame);
			connection.write(toFrame(payload.requestBytes));

			await streamConnection(
				{ bridgeKey, conversationKey, model, output, signal: options?.signal, stream },
				{
					blobStore: payload.blobStore,
					connection,
					lastAccessMs: Date.now(),
					mcpTools: payload.mcpTools,
					pendingExecs: [],
				},
			);
		} catch (error) {
			output.stopReason = options?.signal?.aborted ? "aborted" : "error";
			output.errorMessage = error instanceof Error ? error.message : String(error);
			stream.push({ error: output, reason: output.stopReason, type: "error" });
			stream.end();
		}
	})();

	return stream;
};

function createOutput(model: Model<string>): AssistantMessage {
	return {
		api: model.api,
		content: [],
		model: model.id,
		provider: model.provider,
		role: "assistant",
		stopReason: "stop",
		timestamp: Date.now(),
		usage: {
			cacheRead: 0,
			cacheWrite: 0,
			cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
			input: 0,
			output: 0,
			totalTokens: 0,
		},
	};
}

async function resumeActiveRun(
	runtime: RuntimeOptions,
	activeRun: ActiveCursorRun,
	toolResults: ToolResultInfo[],
): Promise<void> {
	for (const pendingExec of activeRun.pendingExecs) {
		const toolResult = toolResults.find((candidate) => candidate.toolCallId === pendingExec.toolCallId);
		const result = toolResult
			? toolResult.isError
				? create(McpResultSchema, {
						result: {
							case: "error",
							value: create(McpErrorSchema, { error: toolResult.content || "Tool execution failed" }),
						},
					})
				: create(McpResultSchema, {
						result: {
							case: "success",
							value: create(McpSuccessSchema, {
								content: [
									create(McpToolResultContentItemSchema, {
										content: { case: "text", value: create(McpTextContentSchema, { text: toolResult.content }) },
									}),
								],
								isError: false,
							}),
						},
					})
			: create(McpResultSchema, {
					result: { case: "error", value: create(McpErrorSchema, { error: "Tool result not provided" }) },
				});
		sendExecResult(pendingExec.execId, pendingExec.execMsgId, "mcpResult", result, (data) =>
			activeRun.connection.write(data),
		);
	}
	activeRun.pendingExecs.length = 0;
	await streamConnection(runtime, activeRun);
}

async function streamConnection(runtime: RuntimeOptions, run: ActiveCursorRun): Promise<void> {
	const state: StreamState = { outputTokens: 0, pendingExecs: run.pendingExecs, totalTokens: 0 };
	const emitter = new CursorOutputEmitter(runtime.output, runtime.stream);
	const thinkingFilter = createThinkingTagFilter();

	await new Promise<void>((resolve, reject) => {
		let settled = false;
		let yieldedToolUse = false;
		const settle = (fn: () => void) => {
			if (settled) {
				return;
			}
			settled = true;
			fn();
		};

		const parser = createConnectFrameParser(
			(messageBytes) => {
				try {
					handleServerMessage({
						emitter,
						messageBytes,
						onToolExec: (pendingExec) => {
							state.pendingExecs.push(pendingExec);
							run.pendingExecs = state.pendingExecs;
							setActiveRun(runtime.bridgeKey, run);
							emitter.emitToolCall(
								{
									type: "toolCall",
									id: pendingExec.toolCallId,
									name: pendingExec.toolName,
									arguments: parseToolArguments(pendingExec.decodedArgs),
								},
								pendingExec.decodedArgs,
							);
							yieldedToolUse = true;
							emitter.finishToolUse();
							run.connection.clearHandlers();
							settle(resolve);
						},
						run,
						runtime,
						state,
						thinkingFilter,
					});
				} catch (error) {
					settle(() => reject(error instanceof Error ? error : new Error(String(error))));
				}
			},
			(endStreamBytes) => {
				try {
					const error = parseConnectEndStream(endStreamBytes);
					if (error) {
						throw error;
					}
					const flushed = thinkingFilter.flush();
					if (flushed.reasoning) {
						emitter.appendThinking(flushed.reasoning);
					}
					if (flushed.content) {
						emitter.appendText(flushed.content);
					}
				} catch (error) {
					settle(() => reject(error instanceof Error ? error : new Error(String(error))));
				}
			},
		);

		run.connection.setHandlers({
			onClose: () => {
				if (yieldedToolUse) {
					return;
				}
				deleteActiveRun(runtime.bridgeKey);
				emitter.finishStop();
				finalizeUsage(runtime.model, runtime.output, state);
				runtime.stream.push({ type: "done", reason: "stop", message: runtime.output });
				runtime.stream.end();
				settle(resolve);
			},
			onData: parser,
			onError: (error) => settle(() => reject(error)),
		});

		runtime.signal?.addEventListener(
			"abort",
			() => {
				run.connection.close();
				settle(() => reject(new Error("Request was aborted")));
			},
			{ once: true },
		);
	});
}

function handleServerMessage(options: {
	messageBytes: Uint8Array;
	run: ActiveCursorRun;
	state: StreamState;
	emitter: CursorOutputEmitter;
	thinkingFilter: ReturnType<typeof createThinkingTagFilter>;
	runtime: RuntimeOptions;
	onToolExec: (pendingExec: PendingExec) => void;
}): void {
	const serverMessage = fromBinary(AgentServerMessageSchema, options.messageBytes);
	const messageCase = serverMessage.message.case;
	if (messageCase === "interactionUpdate") {
		const updateCase = serverMessage.message.value.message?.case;
		if (updateCase === "textDelta") {
			const delta = serverMessage.message.value.message.value.text || "";
			const split = options.thinkingFilter.process(delta);
			if (split.reasoning) {
				options.emitter.appendThinking(split.reasoning);
			}
			if (split.content) {
				options.emitter.appendText(split.content);
			}
			return;
		}
		if (updateCase === "thinkingDelta") {
			const delta = serverMessage.message.value.message.value.text || "";
			options.emitter.appendThinking(delta);
			return;
		}
		if (updateCase === "tokenDelta") {
			options.state.outputTokens += serverMessage.message.value.message.value.tokens ?? 0;
		}
		return;
	}
	if (messageCase === "kvServerMessage") {
		sendKvBlobResponse(serverMessage.message.value, options.run.blobStore, (data) =>
			options.run.connection.write(data),
		);
		return;
	}
	if (messageCase === "execServerMessage") {
		handleExecServerMessage(serverMessage.message.value, options.run, options.onToolExec);
		return;
	}
	if (messageCase === "conversationCheckpointUpdate") {
		if (serverMessage.message.value.tokenDetails) {
			options.state.totalTokens = serverMessage.message.value.tokenDetails.usedTokens;
		}
		const checkpoint = toBinary(ConversationStateStructureSchema, serverMessage.message.value);
		upsertConversationState(options.runtime.conversationKey, (current) => ({
			blobStore: current?.blobStore ?? new Map(options.run.blobStore),
			checkpoint,
			conversationId: current?.conversationId ?? deterministicConversationId(options.runtime.conversationKey),
			lastAccessMs: Date.now(),
		}));
	}
}

function handleExecServerMessage(
	execMessage: unknown,
	run: ActiveCursorRun,
	onToolExec: (pendingExec: PendingExec) => void,
): void {
	const execCase = execMessage.message.case;
	if (execCase === "requestContextArgs") {
		sendRequestContextResult(execMessage.execId, execMessage.id, run.mcpTools, (data) => run.connection.write(data));
		return;
	}
	if (execCase === "mcpArgs") {
		const mcpArgs = execMessage.message.value;
		onToolExec({
			decodedArgs: JSON.stringify(decodeMcpArgsMap(mcpArgs.args ?? {})),
			execId: execMessage.execId,
			execMsgId: execMessage.id,
			toolCallId: mcpArgs.toolCallId || randomUUID(),
			toolName: mcpArgs.toolName || mcpArgs.name,
		});
		return;
	}
	if (execCase === "readArgs") {
		sendExecResult(
			execMessage.execId,
			execMessage.id,
			"readResult",
			create(ReadResultSchema, {
				result: {
					case: "rejected",
					value: create(ReadRejectedSchema, { path: execMessage.message.value.path, reason: REJECT_REASON }),
				},
			}),
			(data) => run.connection.write(data),
		);
		return;
	}
	if (execCase === "writeArgs") {
		sendExecResult(
			execMessage.execId,
			execMessage.id,
			"writeResult",
			create(WriteResultSchema, {
				result: {
					case: "rejected",
					value: create(WriteRejectedSchema, { path: execMessage.message.value.path, reason: REJECT_REASON }),
				},
			}),
			(data) => run.connection.write(data),
		);
		return;
	}
	if (execCase === "deleteArgs") {
		sendExecResult(
			execMessage.execId,
			execMessage.id,
			"deleteResult",
			create(DeleteResultSchema, {
				result: {
					case: "rejected",
					value: create(DeleteRejectedSchema, { path: execMessage.message.value.path, reason: REJECT_REASON }),
				},
			}),
			(data) => run.connection.write(data),
		);
		return;
	}
	if (execCase === "grepArgs") {
		sendExecResult(
			execMessage.execId,
			execMessage.id,
			"grepResult",
			create(GrepResultSchema, { result: { case: "error", value: create(GrepErrorSchema, { error: REJECT_REASON }) } }),
			(data) => run.connection.write(data),
		);
		return;
	}
	if (execCase === "fetchArgs") {
		sendExecResult(
			execMessage.execId,
			execMessage.id,
			"fetchResult",
			create(FetchResultSchema, {
				result: {
					case: "error",
					value: create(FetchErrorSchema, { error: REJECT_REASON, url: execMessage.message.value.url ?? "" }),
				},
			}),
			(data) => run.connection.write(data),
		);
		return;
	}
	if (execCase === "shellArgs" || execCase === "shellStreamArgs") {
		sendExecResult(
			execMessage.execId,
			execMessage.id,
			"shellResult",
			create(ShellResultSchema, {
				result: {
					case: "rejected",
					value: create(ShellRejectedSchema, {
						command: execMessage.message.value.command ?? "",
						isReadonly: false,
						reason: REJECT_REASON,
						workingDirectory: execMessage.message.value.workingDirectory ?? "",
					}),
				},
			}),
			(data) => run.connection.write(data),
		);
		return;
	}
	if (execCase === "backgroundShellSpawnArgs") {
		sendExecResult(
			execMessage.execId,
			execMessage.id,
			"backgroundShellSpawnResult",
			create(BackgroundShellSpawnResultSchema, {
				result: {
					case: "rejected",
					value: create(ShellRejectedSchema, {
						command: execMessage.message.value.command ?? "",
						isReadonly: false,
						reason: REJECT_REASON,
						workingDirectory: execMessage.message.value.workingDirectory ?? "",
					}),
				},
			}),
			(data) => run.connection.write(data),
		);
		return;
	}
	if (execCase === "writeShellStdinArgs") {
		sendExecResult(
			execMessage.execId,
			execMessage.id,
			"writeShellStdinResult",
			create(WriteShellStdinResultSchema, {
				result: { case: "error", value: create(WriteShellStdinErrorSchema, { error: REJECT_REASON }) },
			}),
			(data) => run.connection.write(data),
		);
		return;
	}
	if (execCase === "diagnosticsArgs") {
		sendExecResult(
			execMessage.execId,
			execMessage.id,
			"diagnosticsResult",
			create(DiagnosticsResultSchema, {}),
			(data) => run.connection.write(data),
		);
	}
}

function finalizeUsage(model: Model<string>, output: AssistantMessage, state: StreamState): void {
	output.usage.output = state.outputTokens;
	output.usage.totalTokens = state.totalTokens || state.outputTokens;
	output.usage.input = Math.max(0, output.usage.totalTokens - output.usage.output);
	calculateCost(model, output.usage);
}

function toFrame(payload: Uint8Array): Uint8Array {
	return frameConnectMessage(payload);
}

function parseToolArguments(rawArguments: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(rawArguments) as Record<string, unknown>;
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

class CursorOutputEmitter {
	private textIndex: number | undefined;
	private thinkingIndex: number | undefined;

	constructor(
		private readonly output: AssistantMessage,
		private readonly stream: AssistantMessageEventStream,
	) {}

	appendText(text: string): void {
		if (!text) {
			return;
		}
		if (this.textIndex === undefined) {
			this.closeThinking();
			this.output.content.push({ text: "", type: "text" });
			this.textIndex = this.output.content.length - 1;
			this.stream.push({ contentIndex: this.textIndex, partial: this.output, type: "text_start" });
		}
		const block = this.output.content[this.textIndex];
		if (block?.type !== "text") {
			return;
		}
		block.text += text;
		this.stream.push({ contentIndex: this.textIndex, delta: text, partial: this.output, type: "text_delta" });
	}

	appendThinking(thinking: string): void {
		if (!thinking) {
			return;
		}
		if (this.thinkingIndex === undefined) {
			this.closeText();
			this.output.content.push({ thinking: "", type: "thinking" });
			this.thinkingIndex = this.output.content.length - 1;
			this.stream.push({ contentIndex: this.thinkingIndex, partial: this.output, type: "thinking_start" });
		}
		const block = this.output.content[this.thinkingIndex];
		if (block?.type !== "thinking") {
			return;
		}
		block.thinking += thinking;
		this.stream.push({
			contentIndex: this.thinkingIndex,
			delta: thinking,
			partial: this.output,
			type: "thinking_delta",
		});
	}

	emitToolCall(toolCall: ToolCall, rawArguments: string): void {
		this.closeText();
		this.closeThinking();
		this.output.content.push(toolCall);
		const index = this.output.content.length - 1;
		this.stream.push({ contentIndex: index, partial: this.output, type: "toolcall_start" });
		if (rawArguments) {
			this.stream.push({ contentIndex: index, delta: rawArguments, partial: this.output, type: "toolcall_delta" });
		}
		this.stream.push({ contentIndex: index, partial: this.output, toolCall, type: "toolcall_end" });
	}

	finishToolUse(): void {
		this.closeText();
		this.closeThinking();
		this.output.stopReason = "toolUse";
		this.stream.push({ message: this.output, reason: "toolUse", type: "done" });
		this.stream.end();
	}

	finishStop(): void {
		this.closeText();
		this.closeThinking();
		this.output.stopReason = "stop";
	}

	private closeText(): void {
		if (this.textIndex === undefined) {
			return;
		}
		const block = this.output.content[this.textIndex];
		if (block?.type === "text") {
			this.stream.push({ content: block.text, contentIndex: this.textIndex, partial: this.output, type: "text_end" });
		}
		this.textIndex = undefined;
	}

	private closeThinking(): void {
		if (this.thinkingIndex === undefined) {
			return;
		}
		const block = this.output.content[this.thinkingIndex];
		if (block?.type === "thinking") {
			this.stream.push({
				content: block.thinking,
				contentIndex: this.thinkingIndex,
				partial: this.output,
				type: "thinking_end",
			});
		}
		this.thinkingIndex = undefined;
	}
}

function createThinkingTagFilter(): {
	process(text: string): { content: string; reasoning: string };
	flush(): { content: string; reasoning: string };
} {
	let buffer = "";
	let inThinking = false;
	return {
		flush() {
			const remainder = buffer;
			buffer = "";
			if (!remainder) {
				return { content: "", reasoning: "" };
			}
			return inThinking ? { content: "", reasoning: remainder } : { content: remainder, reasoning: "" };
		},
		process(text: string) {
			const input = buffer + text;
			buffer = "";
			let content = "";
			let reasoning = "";
			let lastIndex = 0;
			// Reuse the pre-compiled THINKING_TAG_PATTERN; reset lastIndex for fresh scan.
			const pattern = THINKING_TAG_PATTERN;
			pattern.lastIndex = 0;
			let match: RegExpExecArray | null;
			while ((match = pattern.exec(input)) !== null) {
				const before = input.slice(lastIndex, match.index);
				if (inThinking) {
					reasoning += before;
				} else {
					content += before;
				}
				inThinking = match[1] !== "/";
				lastIndex = pattern.lastIndex;
			}
			const rest = input.slice(lastIndex);
			const tagStart = rest.lastIndexOf("<");
			if (
				tagStart >= 0 &&
				rest.length - tagStart < MAX_THINKING_TAG_LEN &&
				/^<\/?[a-z_]*$/i.test(rest.slice(tagStart))
			) {
				buffer = rest.slice(tagStart);
				const visible = rest.slice(0, tagStart);
				if (inThinking) {
					reasoning += visible;
				} else {
					content += visible;
				}
			} else if (inThinking) {
				reasoning += rest;
			} else {
				content += rest;
			}
			return { content, reasoning };
		},
	};
}
