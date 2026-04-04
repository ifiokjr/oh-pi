import { createHash } from "node:crypto";
import type { McpToolDefinition } from "./proto/agent_pb.js";
import { CURSOR_ACTIVE_RUN_TTL_MS, CURSOR_CHECKPOINT_TTL_MS, CURSOR_MAX_CHECKPOINTS } from "./config.js";
import type { PendingExec } from "./messages.js";
import type { CursorStreamingConnection } from "./transport.js";

export interface ConversationStateRecord {
	conversationId: string;
	checkpoint?: Uint8Array;
	blobStore: Map<string, Uint8Array>;
	lastAccessMs: number;
}

export interface ActiveCursorRun {
	connection: CursorStreamingConnection;
	blobStore: Map<string, Uint8Array>;
	mcpTools: McpToolDefinition[];
	pendingExecs: PendingExec[];
	lastAccessMs: number;
}

const conversationStates = new Map<string, ConversationStateRecord>();
const activeRuns = new Map<string, ActiveCursorRun>();

export function deriveConversationKey(sessionId: string | undefined, seed: string): string {
	if (sessionId && sessionId.trim()) {
		return `session:${sessionId.trim()}`;
	}
	return `seed:${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}

export function deriveBridgeKey(conversationKey: string, modelId: string): string {
	return `${conversationKey}:${modelId}`;
}

export function deterministicConversationId(conversationKey: string): string {
	const hex = createHash("sha256").update(`cursor-conversation:${conversationKey}`).digest("hex").slice(0, 32);
	return [
		hex.slice(0, 8),
		hex.slice(8, 12),
		`4${hex.slice(13, 16)}`,
		`${(0x8 | (Number.parseInt(hex[16] ?? "0", 16) & 0x3)).toString(16)}${hex.slice(17, 20)}`,
		hex.slice(20, 32),
	].join("-");
}

export function getConversationState(conversationKey: string): ConversationStateRecord | undefined {
	const state = conversationStates.get(conversationKey);
	if (state) {
		state.lastAccessMs = Date.now();
	}
	return state;
}

export function upsertConversationState(
	conversationKey: string,
	updater: (current: ConversationStateRecord | undefined) => ConversationStateRecord,
): ConversationStateRecord {
	const next = updater(conversationStates.get(conversationKey));
	next.lastAccessMs = Date.now();
	conversationStates.set(conversationKey, next);
	trimConversationStates();
	return next;
}

export function deleteConversationState(conversationKey: string): void {
	conversationStates.delete(conversationKey);
}

export function getActiveRun(bridgeKey: string): ActiveCursorRun | undefined {
	const active = activeRuns.get(bridgeKey);
	if (active) {
		active.lastAccessMs = Date.now();
	}
	return active;
}

export function setActiveRun(bridgeKey: string, run: ActiveCursorRun): void {
	run.lastAccessMs = Date.now();
	activeRuns.set(bridgeKey, run);
}

export function deleteActiveRun(bridgeKey: string): void {
	const active = activeRuns.get(bridgeKey);
	if (active) {
		active.connection.close();
	}
	activeRuns.delete(bridgeKey);
}

export function clearCursorRuntimeState(): void {
	for (const active of activeRuns.values()) {
		active.connection.close();
	}
	activeRuns.clear();
	conversationStates.clear();
}

export function getCursorRuntimeStateSummary(): { activeRuns: number; checkpoints: number } {
	cleanupCursorRuntimeState();
	return {
		activeRuns: activeRuns.size,
		checkpoints: conversationStates.size,
	};
}

export function cleanupCursorRuntimeState(): void {
	const now = Date.now();
	for (const [bridgeKey, active] of activeRuns.entries()) {
		if (!active.connection.isAlive() || now - active.lastAccessMs > CURSOR_ACTIVE_RUN_TTL_MS) {
			active.connection.close();
			activeRuns.delete(bridgeKey);
		}
	}
	for (const [conversationKey, state] of conversationStates.entries()) {
		if (now - state.lastAccessMs > CURSOR_CHECKPOINT_TTL_MS) {
			conversationStates.delete(conversationKey);
		}
	}
	trimConversationStates();
}

function trimConversationStates(): void {
	if (conversationStates.size <= CURSOR_MAX_CHECKPOINTS) {
		return;
	}
	const sorted = [...conversationStates.entries()].sort((left, right) => left[1].lastAccessMs - right[1].lastAccessMs);
	for (const [conversationKey] of sorted.slice(0, conversationStates.size - CURSOR_MAX_CHECKPOINTS)) {
		conversationStates.delete(conversationKey);
	}
}
