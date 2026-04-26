import { createHash, randomUUID } from "node:crypto";
import { create, fromBinary, fromJson, toBinary, toJson } from '@bufbuild/protobuf';
import type { JsonValue } from '@bufbuild/protobuf';
import { ValueSchema } from "@bufbuild/protobuf/wkt";
import type { Context, Message, ToolResultMessage } from "@mariozechner/pi-ai";
import type {
	GetBlobArgs} from "./proto/agent_pb.js";
import {
	AgentClientMessageSchema,
	AgentConversationTurnStructureSchema,
	AgentRunRequestSchema,
	AssistantMessageSchema,
	ClientHeartbeatSchema,
	ConversationActionSchema,
	ConversationStateStructureSchema,
	ConversationTurnStructureSchema,
	ConversationStepSchema,
	ExecClientMessageSchema,
	GetBlobResultSchema,
	KvClientMessageSchema,
	type KvServerMessage,
	type McpToolDefinition,
	McpToolDefinitionSchema,
	ModelDetailsSchema,
	RequestContextResultSchema,
	RequestContextSchema,
	RequestContextSuccessSchema,
	SetBlobResultSchema,
	UserMessageActionSchema,
	UserMessageSchema,
} from "./proto/agent_pb.js";
import { frameConnectMessage } from "./transport.js";
import type { ConversationStateRecord } from "./runtime.js";

export interface ToolResultInfo {
	toolCallId: string;
	toolName: string;
	content: string;
	isError: boolean;
}

export interface PendingExec {
	execId: string;
	execMsgId: string;
	toolCallId: string;
	toolName: string;
	decodedArgs: string;
}

export interface ParsedCursorConversation {
	systemPrompt: string;
	userText: string;
	turns: { userText: string; assistantText: string }[];
	trailingToolResults: ToolResultInfo[];
	seed: string;
}

export interface CursorRequestPayload {
	requestBytes: Uint8Array;
	blobStore: Map<string, Uint8Array>;
	mcpTools: McpToolDefinition[];
}

export function parseCursorConversation(context: Context): ParsedCursorConversation {
	const {messages} = context;
	const trailingToolResults: ToolResultInfo[] = [];
	let cutoff = messages.length;
	while (cutoff > 0 && messages[cutoff - 1]?.role === "toolResult") {
		const toolMessage = messages[cutoff - 1] as ToolResultMessage;
		trailingToolResults.unshift({
			content: flattenBlocks(toolMessage.content),
			isError: toolMessage.isError,
			toolCallId: toolMessage.toolCallId,
			toolName: toolMessage.toolName,
		});
		cutoff -= 1;
	}

	const transcript = messages.slice(0, cutoff);
	const turns: { userText: string; assistantText: string }[] = [];
	let pendingUser = "";
	let pendingAssistant = "";

	for (const message of transcript) {
		if (message.role === "user") {
			if (pendingUser) {
				turns.push({ assistantText: pendingAssistant.trim(), userText: pendingUser });
				pendingAssistant = "";
			}
			pendingUser = flattenUserMessage(message);
			continue;
		}
		if (message.role === "assistant") {
			pendingAssistant = appendTranscriptSegment(pendingAssistant, flattenAssistantMessage(message));
			continue;
		}
		if (message.role === "toolResult") {
			pendingAssistant = appendTranscriptSegment(pendingAssistant, formatToolResult(message));
		}
	}

	let userText = "";
	if (pendingUser) {
		userText = pendingUser;
		if (pendingAssistant.trim()) {
			turns.push({ assistantText: pendingAssistant.trim(), userText: pendingUser });
			userText = "";
		}
	}

	const systemPrompt = context.systemPrompt?.trim() || "You are a helpful assistant.";
	const seed = `${systemPrompt}\n${turns.map((turn) => `${turn.userText}\n${turn.assistantText}`).join("\n")}\n${userText}`;
	return {
		seed,
		systemPrompt,
		trailingToolResults,
		turns,
		userText: userText.trim(),
	};
}

export function buildMcpToolDefinitions(tools: Context["tools"]): McpToolDefinition[] {
	if (!tools || tools.length === 0) {
		return [];
	}
	return tools.map((tool) => {
		const schema =
			tool.parameters && typeof tool.parameters === "object"
				? (tool.parameters as JsonValue)
				: ({ properties: {}, required: [], type: "object" } as JsonValue);
		const inputSchema = toBinary(ValueSchema, fromJson(ValueSchema, schema));
		return create(McpToolDefinitionSchema, {
			description: tool.description || "",
			inputSchema,
			name: tool.name,
			providerIdentifier: "pi",
			toolName: tool.name,
		});
	});
}

export function buildCursorRequestPayload(options: {
	modelId: string;
	conversationId: string;
	parsed: ParsedCursorConversation;
	tools: Context["tools"];
	conversationState?: ConversationStateRecord;
}): CursorRequestPayload {
	const blobStore = new Map<string, Uint8Array>(options.conversationState?.blobStore ?? []);
	const systemJson = JSON.stringify({ content: options.parsed.systemPrompt, role: "system" });
	const systemBytes = new TextEncoder().encode(systemJson);
	const systemBlobId = new Uint8Array(createHash("sha256").update(systemBytes).digest());
	blobStore.set(Buffer.from(systemBlobId).toString("hex"), systemBytes);

	const conversationState = options.conversationState?.checkpoint
		? fromBinary(ConversationStateStructureSchema, options.conversationState.checkpoint)
		: createConversationState(options.parsed.turns, systemBlobId);

	const userMessage = create(UserMessageSchema, {
		messageId: randomUUID(),
		text: options.parsed.userText,
	});
	const action = create(ConversationActionSchema, {
		action: {
			case: "userMessageAction",
			value: create(UserMessageActionSchema, { userMessage }),
		},
	});
	const modelDetails = create(ModelDetailsSchema, {
		displayModelId: options.modelId,
		displayName: options.modelId,
		modelId: options.modelId,
	});
	const runRequest = create(AgentRunRequestSchema, {
		action,
		conversationId: options.conversationId,
		conversationState,
		modelDetails,
	});
	const clientMessage = create(AgentClientMessageSchema, {
		message: { case: "runRequest", value: runRequest },
	});
	return {
		blobStore,
		mcpTools: buildMcpToolDefinitions(options.tools),
		requestBytes: toBinary(AgentClientMessageSchema, clientMessage),
	};
}

export function makeHeartbeatFrame(): Uint8Array {
	const heartbeat = create(AgentClientMessageSchema, {
		message: {
			case: "clientHeartbeat",
			value: create(ClientHeartbeatSchema, {}),
		},
	});
	return frameConnectMessage(toBinary(AgentClientMessageSchema, heartbeat));
}

export function sendRequestContextResult(
	execId: string | number,
	messageId: string | number,
	mcpTools: McpToolDefinition[],
	sendFrame: (data: Uint8Array) => void,
): void {
	const requestContext = create(RequestContextSchema, {
		customSubagents: [],
		fileContents: {},
		gitRepos: [],
		mcpInstructions: [],
		projectLayouts: [],
		repositoryInfo: [],
		rules: [],
		tools: mcpTools,
	});
	const result = create(RequestContextResultSchema, {
		result: {
			case: "success",
			value: create(RequestContextSuccessSchema, { requestContext }),
		},
	});
	sendExecResult(execId, messageId, "requestContextResult", result, sendFrame);
}

export function sendKvBlobResponse(
	kvMessage: KvServerMessage,
	blobStore: Map<string, Uint8Array>,
	sendFrame: (data: Uint8Array) => void,
): void {
	const messageCase = kvMessage.message.case;
	if (messageCase === "getBlobArgs") {
		const args = kvMessage.message.value as GetBlobArgs;
		const blobData = blobStore.get(Buffer.from(args.blobId).toString("hex"));
		sendKvResponse(kvMessage.id, "getBlobResult", create(GetBlobResultSchema, blobData ? { blobData } : {}), sendFrame);
		return;
	}
	if (messageCase === "setBlobArgs") {
		const args = kvMessage.message.value as { blobId: Uint8Array; blobData: Uint8Array };
		blobStore.set(Buffer.from(args.blobId).toString("hex"), args.blobData);
		sendKvResponse(kvMessage.id, "setBlobResult", create(SetBlobResultSchema, {}), sendFrame);
	}
}

export function sendExecResult(
	execId: string | number,
	messageId: string | number,
	messageCase: string,
	value: unknown,
	sendFrame: (data: Uint8Array) => void,
): void {
	const execClientMessage = create(ExecClientMessageSchema, {
		execId: String(execId),
		id: Number(messageId),
		message: { case: messageCase as never, value: value as never },
	});
	const clientMessage = create(AgentClientMessageSchema, {
		message: { case: "execClientMessage", value: execClientMessage },
	});
	sendFrame(frameConnectMessage(toBinary(AgentClientMessageSchema, clientMessage)));
}

export function decodeMcpArgsMap(args: Record<string, Uint8Array>): Record<string, unknown> {
	const decoded: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(args)) {
		decoded[key] = decodeMcpArgValue(value);
	}
	return decoded;
}

function createConversationState(turns: { userText: string; assistantText: string }[], systemBlobId: Uint8Array) {
	const turnBytes: Uint8Array[] = [];
	for (const turn of turns) {
		const userMessage = create(UserMessageSchema, {
			messageId: randomUUID(),
			text: turn.userText,
		});
		const userMessageBytes = toBinary(UserMessageSchema, userMessage);
		const steps: Uint8Array[] = [];
		if (turn.assistantText.trim()) {
			const step = create(ConversationStepSchema, {
				message: {
					case: "assistantMessage",
					value: create(AssistantMessageSchema, { text: turn.assistantText }),
				},
			});
			steps.push(toBinary(ConversationStepSchema, step));
		}
		const agentTurn = create(AgentConversationTurnStructureSchema, {
			steps,
			userMessage: userMessageBytes,
		});
		const turnStructure = create(ConversationTurnStructureSchema, {
			turn: { case: "agentConversationTurn", value: agentTurn },
		});
		turnBytes.push(toBinary(ConversationTurnStructureSchema, turnStructure));
	}
	return create(ConversationStateStructureSchema, {
		fileStates: {},
		fileStatesV2: {},
		pendingToolCalls: [],
		previousWorkspaceUris: [],
		readPaths: [],
		rootPromptMessagesJson: [systemBlobId],
		selfSummaryCount: 0,
		subagentStates: {},
		summaryArchives: [],
		todos: [],
		turnTimings: [],
		turns: turnBytes,
	});
}

function sendKvResponse(
	id: string | number,
	messageCase: string,
	value: unknown,
	sendFrame: (data: Uint8Array) => void,
): void {
	const response = create(KvClientMessageSchema, {
		id: Number(id),
		message: { case: messageCase as never, value: value as never },
	});
	const clientMessage = create(AgentClientMessageSchema, {
		message: { case: "kvClientMessage", value: response },
	});
	sendFrame(frameConnectMessage(toBinary(AgentClientMessageSchema, clientMessage)));
}

function flattenUserMessage(message: Extract<Message, { role: "user" }>): string {
	if (typeof message.content === "string") {
		return message.content.trim();
	}
	return flattenBlocks(message.content);
}

function flattenAssistantMessage(message: Extract<Message, { role: "assistant" }>): string {
	const parts: string[] = [];
	for (const block of message.content) {
		if (block.type === "text" && block.text.trim()) {
			parts.push(block.text.trim());
		}
		if (block.type === "thinking" && block.thinking.trim()) {
			parts.push(`<thinking>\n${block.thinking.trim()}\n</thinking>`);
		}
		if (block.type === "toolCall") {
			parts.push(`[tool call:${block.name}]\n${JSON.stringify(block.arguments ?? {}, null, 2)}`);
		}
	}
	return parts.join("\n\n").trim();
}

function formatToolResult(message: ToolResultMessage): string {
	const header = message.isError ? `[tool error:${message.toolName}]` : `[tool result:${message.toolName}]`;
	const body = flattenBlocks(message.content) || "(empty)";
	return `${header}\n${body}`;
}

function flattenBlocks(content: readonly { type: string; text?: string }[]): string {
	return content
		.filter((block) => block.type === "text" && typeof block.text === "string")
		.map((block) => block.text?.trim() || "")
		.filter(Boolean)
		.join("\n");
}

function appendTranscriptSegment(current: string, next: string): string {
	if (!next.trim()) {
		return current;
	}
	return current.trim() ? `${current.trim()}\n\n${next.trim()}` : next.trim();
}

function decodeMcpArgValue(value: Uint8Array): unknown {
	try {
		return toJson(ValueSchema, fromBinary(ValueSchema, value));
	} catch {
		try {
			return new TextDecoder().decode(value);
		} catch {
			return undefined;
		}
	}
}
