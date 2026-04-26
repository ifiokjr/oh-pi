/* C8 ignore file */
/**
 * Pi Analytics Extension
 *
 * Enhanced usage tracker that persists analytics to SQLite database.
 */

import {
	createSession,
	endSession,
	formatDateBucket,
	formatHourBucket,
	formatMonthBucket,
	formatWeekBucket,
	recordTurn,
	runMigrations,
	upsertCodebase,
	upsertModel,
	upsertProvider,
} from "@ifi/pi-analytics-db";
import type { NewCodebase, NewSession, NewTurn } from "@ifi/pi-analytics-db";
import { createHash } from "node:crypto";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface ActiveSessionInfo {
	id: string;
	startedAt: Date;
	currentCodebaseId?: string;
}

let _activeSession: ActiveSessionInfo | null = null;
let _lastCodebaseId: string | undefined;

function generateSessionId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function generateTurnId(): string {
	return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getCodebaseHash(path: string): string {
	return createHash("sha256").update(path).digest("hex").slice(0, 16);
}

function normalizeModelId(modelId: string): string {
	return modelId
		.replace(/-\d{4}-\d{2}-\d{2}$/, "")
		.replace(/-latest$/, "")
		.trim();
}

function inferProviderId(modelId: string): string {
	const lower = modelId.toLowerCase();
	if (lower.includes("claude") || lower.includes("sonnet") || lower.includes("opus") || lower.includes("haiku")) {
		return "anthropic";
	}
	if (
		lower.includes("gpt") ||
		lower.includes("o1") ||
		lower.includes("o3") ||
		lower.includes("o4") ||
		lower.includes("codex")
	) {
		return "openai";
	}
	if (lower.includes("gemini") || lower.includes("flash") || lower.includes("antigravity")) {
		return "google";
	}
	if (lower.includes("ollama")) {
		return "ollama";
	}
	return "unknown";
}

function getProviderDisplayName(providerId: string): string {
	const names: Record<string, string> = {
		anthropic: "Anthropic",
		google: "Google",
		ollama: "Ollama",
		openai: "OpenAI",
	};
	return names[providerId] ?? providerId;
}

let migrationsDone = false;

function ensureDatabase(): void {
	if (migrationsDone) {
		return;
	}
	runMigrations();
	migrationsDone = true;
}

function startAnalyticsSession(_ctx: { cwd?: string }): void {
	ensureDatabase();

	const sessionId = generateSessionId();
	const now = new Date();

	const sessionData: NewSession = {
		id: sessionId,
		startedAt: now,
	};

	_activeSession = {
		id: sessionId,
		startedAt: now,
	};

	createSession(sessionData);
}

function endAnalyticsSession(): void {
	if (_activeSession) {
		endSession(_activeSession.id);
		_activeSession = null;
	}
}

function updateCodebase(cwd: string | undefined): string | undefined {
	if (!cwd) {
		return undefined;
	}

	const codebaseId = getCodebaseHash(cwd);

	if (codebaseId !== _lastCodebaseId) {
		const pathParts = cwd.split("/");
		const name = pathParts.at(-1) || "unknown";

		const codebaseData: NewCodebase = {
			absolutePath: cwd,
			firstSeenAt: new Date(),
			id: codebaseId,
			lastSeenAt: new Date(),
			name,
		};

		upsertCodebase(codebaseData);
		_lastCodebaseId = codebaseId;

		if (_activeSession) {
			_activeSession.currentCodebaseId = codebaseId;
		}
	}

	return codebaseId;
}

function updateModel(modelId: string): void {
	const normalizedId = normalizeModelId(modelId);
	const providerId = inferProviderId(normalizedId);
	const now = new Date();

	upsertProvider({
		displayName: getProviderDisplayName(providerId),
		firstUsedAt: now,
		id: providerId,
		lastUsedAt: now,
	});

	upsertModel({
		displayName: modelId.split("/").pop() ?? modelId,
		firstUsedAt: now,
		id: normalizedId,
		lastUsedAt: now,
		providerId,
	});
}

function recordAnalyticsTurn(
	ctx: { cwd?: string },
	message: {
		model: string;
		provider?: string;
		usage: {
			input: number;
			output: number;
			cacheRead?: number;
			cacheWrite?: number;
			cost: { total: number };
		};
	},
): void {
	if (!_activeSession) {
		startAnalyticsSession(ctx);
	}

	const now = new Date();
	const dayBucket = formatDateBucket(now);
	const hourBucket = formatHourBucket(now);
	const weekBucket = formatWeekBucket(now);
	const monthBucket = formatMonthBucket(now);

	const codebaseId = updateCodebase(ctx.cwd);

	updateModel(message.model);
	const modelId = normalizeModelId(message.model);
	const providerId = inferProviderId(message.model);

	const turnData: NewTurn = {
		cacheReadTokens: message.usage.cacheRead ?? 0,
		cacheWriteTokens: message.usage.cacheWrite ?? 0,
		codebaseId,
		costTotal: message.usage.cost?.total ?? 0,
		dayBucket,
		endTime: now,
		hasToolCalls: false,
		hourBucket,
		id: generateTurnId(),
		inputTokens: message.usage.input ?? 0,
		messageRole: "assistant",
		modelId,
		monthBucket,
		outputTokens: message.usage.output ?? 0,
		providerId,
		sessionId: _activeSession!.id,
		source: "session",
		startTime: now,
		toolCallCount: 0,
		weekBucket,
	};

	recordTurn(turnData);
}

export default function piAnalytics(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		try {
			startAnalyticsSession(ctx);
		} catch (error) {
			console.error("[analytics] Failed to start session:", error);
		}
	});

	pi.on("turn_end", (event, ctx) => {
		if (event.message.role !== "assistant") {
			return;
		}

		const msg = event.message as {
			model: string;
			provider?: string;
			usage: {
				input: number;
				output: number;
				cacheRead?: number;
				cacheWrite?: number;
				cost: { total: number };
			};
		};

		try {
			recordAnalyticsTurn(ctx, msg);
		} catch (error) {
			console.error("[analytics] Failed to record turn:", error);
		}
	});

	pi.on("session_end", () => {
		try {
			endAnalyticsSession();
		} catch (error) {
			console.error("[analytics] Failed to end session:", error);
		}
	});

	pi.on("shutdown", () => {
		try {
			endAnalyticsSession();
		} catch (error) {
			console.error("[analytics] Failed to shutdown cleanly:", error);
		}
	});
}
