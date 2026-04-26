// Self-contained types — no imports from pi packages.
// Mirrors pi's RPC protocol for use in browsers, React Native, and Node.js.

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type ConnectionState = "disconnected" | "connecting" | "authenticating" | "connected" | "reconnecting";

export interface InstanceInfo {
	instanceId: string;
	sessionId: string;
	isStreaming: boolean;
	model: unknown;
	thinkingLevel: ThinkingLevel;
}

export interface SessionState {
	model: unknown;
	thinkingLevel: ThinkingLevel;
	isStreaming: boolean;
	sessionId: string;
	sessionFile?: string;
	messageCount: number;
}

export interface SessionStats {
	sessionId: string;
	messageCount: number;
	isStreaming: boolean;
}

export interface CommandInfo {
	name: string;
	description?: string;
	source: "extension" | "prompt" | "skill";
	location?: "user" | "project" | "path";
	path?: string;
}

export interface CompactionResult {
	summary: string;
	firstKeptEntryId: string;
	tokensBefore: number;
	details: Record<string, unknown>;
}

// RPC Command Types

export interface PromptOptions {
	streamingBehavior?: "steer" | "followUp";
	images?: { type: "image"; data: string; mimeType: string }[];
}

export interface AuthCommand {
	type: "auth";
	token: string;
}

export interface PromptCommand {
	type: "prompt";
	id?: string;
	message: string;
	streamingBehavior?: "steer" | "followUp";
	images?: { type: "image"; data: string; mimeType: string }[];
}

export interface SteerCommand {
	type: "steer";
	id?: string;
	message: string;
}

export interface FollowUpCommand {
	type: "follow_up";
	id?: string;
	message: string;
}

export interface AbortCommand {
	type: "abort";
	id?: string;
}

export interface GetStateCommand {
	type: "get_state";
	id?: string;
}

export interface GetMessagesCommand {
	type: "get_messages";
	id?: string;
}

export interface SetModelCommand {
	type: "set_model";
	id?: string;
	provider: string;
	modelId: string;
}

export interface SetThinkingLevelCommand {
	type: "set_thinking_level";
	id?: string;
	level: ThinkingLevel;
}

export interface CompactCommand {
	type: "compact";
	id?: string;
	customInstructions?: string;
}

export interface NewSessionCommand {
	type: "new_session";
	id?: string;
}

export type RpcCommand =
	| AuthCommand
	| PromptCommand
	| SteerCommand
	| FollowUpCommand
	| AbortCommand
	| GetStateCommand
	| GetMessagesCommand
	| SetModelCommand
	| SetThinkingLevelCommand
	| CompactCommand
	| NewSessionCommand;

// RPC Response Types

export interface RpcResponse {
	type: "response";
	command: string;
	success: boolean;
	data?: unknown;
	error?: string;
	id?: string;
}

export interface AuthOkResponse {
	type: "auth_ok";
	instanceId: string;
	session: {
		sessionId: string;
		isStreaming: boolean;
		model: unknown;
		thinkingLevel: ThinkingLevel;
	} | null;
}

export interface AuthErrorResponse {
	type: "auth_error";
	reason: string;
}

// Event Types (server → client)

export interface AgentStartEvent {
	type: "agent_start";
}

export interface AgentEndEvent {
	type: "agent_end";
	messages: unknown[];
}

export interface TurnStartEvent {
	type: "turn_start";
}

export interface TurnEndEvent {
	type: "turn_end";
	message: unknown;
	toolResults: unknown[];
}

export interface MessageStartEvent {
	type: "message_start";
	message: unknown;
}

export interface MessageUpdateEvent {
	type: "message_update";
	message: unknown;
	assistantMessageEvent: {
		type: string;
		contentIndex?: number;
		delta?: string;
		content?: string;
		partial?: unknown;
		toolCall?: unknown;
	};
}

export interface MessageEndEvent {
	type: "message_end";
	message: unknown;
}

export interface ToolExecutionStartEvent {
	type: "tool_execution_start";
	toolCallId: string;
	toolName: string;
	args: unknown;
}

export interface ToolExecutionUpdateEvent {
	type: "tool_execution_update";
	toolCallId: string;
	toolName: string;
	args: unknown;
	partialResult: unknown;
}

export interface ToolExecutionEndEvent {
	type: "tool_execution_end";
	toolCallId: string;
	toolName: string;
	result: unknown;
	isError: boolean;
}

export interface ExtensionUIRequest {
	type: "extension_ui_request";
	id: string;
	method: string;
	title?: string;
	options?: string[];
	message?: string;
	placeholder?: string;
	prefill?: string;
	notifyType?: "info" | "warning" | "error";
	statusKey?: string;
	statusText?: string;
	widgetKey?: string;
	widgetLines?: string[];
	text?: string;
	timeout?: number;
}

export interface ExtensionUIResponse {
	type: "extension_ui_response";
	id: string;
	value?: string;
	confirmed?: boolean;
	cancelled?: boolean;
}

export type ServerEvent =
	| AgentStartEvent
	| AgentEndEvent
	| TurnStartEvent
	| TurnEndEvent
	| MessageStartEvent
	| MessageUpdateEvent
	| MessageEndEvent
	| ToolExecutionStartEvent
	| ToolExecutionUpdateEvent
	| ToolExecutionEndEvent
	| ExtensionUIRequest;

// Client Options

export interface PiWebClientOptions {
	url: string;
	token: string;
	autoReconnect?: boolean;
	reconnectInterval?: number;
	webSocket?: unknown; // Constructor for environments without native WebSocket
}
