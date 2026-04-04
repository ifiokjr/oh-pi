import { create, fromBinary, type JsonValue, toBinary } from "@bufbuild/protobuf";
import type { OAuthCredentials } from "@mariozechner/pi-ai";
import { CURSOR_GET_MODELS_PATH } from "./config.js";
import { GetUsableModelsRequestSchema, GetUsableModelsResponseSchema } from "./proto/agent_pb.js";
import { callCursorUnaryRpc, decodeConnectUnaryBody } from "./transport.js";

export type CursorProviderModel = {
	id: string;
	name: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
	contextWindow: number;
	maxTokens: number;
};

export type CursorCredentials = OAuthCredentials & {
	models?: CursorProviderModel[];
	lastModelRefresh?: number;
};

const DEFAULT_CONTEXT_WINDOW = 200_000;
const DEFAULT_MAX_TOKENS = 64_000;

const MODEL_COST_TABLE: Record<string, CursorProviderModel["cost"]> = {
	"claude-4-sonnet": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
	"claude-4-sonnet-1m": { input: 6, output: 22.5, cacheRead: 0.6, cacheWrite: 7.5 },
	"claude-4.5-haiku": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
	"claude-4.5-opus": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
	"claude-4.5-sonnet": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
	"claude-4.6-opus": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
	"claude-4.6-opus-fast": { input: 30, output: 150, cacheRead: 3, cacheWrite: 37.5 },
	"claude-4.6-sonnet": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
	"composer-1": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
	"composer-1.5": { input: 3.5, output: 17.5, cacheRead: 0.35, cacheWrite: 0 },
	"composer-2": { input: 0.5, output: 2.5, cacheRead: 0.2, cacheWrite: 0 },
	"composer-2-fast": { input: 1.5, output: 7.5, cacheRead: 0.2, cacheWrite: 0 },
	"gemini-3-flash": { input: 0.5, output: 3, cacheRead: 0.05, cacheWrite: 0 },
	"gemini-3-pro": { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 },
	"gemini-3.1-pro": { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 },
	"gpt-5": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
	"gpt-5-fast": { input: 2.5, output: 20, cacheRead: 0.25, cacheWrite: 0 },
	"gpt-5-mini": { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0 },
	"gpt-5-codex": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
	"gpt-5.1-codex": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
	"gpt-5.1-codex-max": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
	"gpt-5.1-codex-mini": { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0 },
	"gpt-5.2": { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
	"gpt-5.2-codex": { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
	"gpt-5.3-codex": { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
	"gpt-5.4": { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
	"gpt-5.4-mini": { input: 0.75, output: 4.5, cacheRead: 0.075, cacheWrite: 0 },
	"gpt-5.4-nano": { input: 0.2, output: 1.25, cacheRead: 0.02, cacheWrite: 0 },
	"grok-4.20": { input: 2, output: 6, cacheRead: 0.2, cacheWrite: 0 },
	"kimi-k2.5": { input: 0.6, output: 3, cacheRead: 0.1, cacheWrite: 0 },
};

const FALLBACK_CURSOR_MODELS: CursorProviderModel[] = [
	toCursorProviderModel({ id: "composer-2", name: "Composer 2", reasoning: true }),
	toCursorProviderModel({ id: "composer-2-fast", name: "Composer 2 Fast", reasoning: true }),
	toCursorProviderModel({ id: "claude-4.6-sonnet-medium", name: "Claude 4.6 Sonnet", reasoning: true }),
	toCursorProviderModel({ id: "claude-4.6-opus-high", name: "Claude 4.6 Opus", reasoning: true }),
	toCursorProviderModel({ id: "gpt-5.2", name: "GPT-5.2", reasoning: true, contextWindow: 400_000, maxTokens: 128_000 }),
	toCursorProviderModel({ id: "gpt-5.2-codex", name: "GPT-5.2 Codex", reasoning: true, contextWindow: 400_000, maxTokens: 128_000 }),
	toCursorProviderModel({ id: "gpt-5.3-codex", name: "GPT-5.3 Codex", reasoning: true, contextWindow: 400_000, maxTokens: 128_000 }),
	toCursorProviderModel({ id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", reasoning: true, contextWindow: 1_000_000 }),
];

export function getFallbackCursorModels(): CursorProviderModel[] {
	return FALLBACK_CURSOR_MODELS.map((model) => ({ ...model, cost: { ...model.cost }, input: [...model.input] }));
}

export function getCredentialModels(credentials: CursorCredentials): CursorProviderModel[] {
	const models = Array.isArray(credentials.models) ? credentials.models : [];
	return models.length > 0 ? sanitizeStoredModels(models) : getFallbackCursorModels();
}

export async function discoverCursorModels(accessToken: string, url?: string): Promise<CursorProviderModel[] | null> {
	const requestPayload = create(GetUsableModelsRequestSchema, {});
	const response = await callCursorUnaryRpc({
		accessToken,
		rpcPath: CURSOR_GET_MODELS_PATH,
		requestBody: toBinary(GetUsableModelsRequestSchema, requestPayload),
		url,
		timeoutMs: 5_000,
	});
	const decoded = decodeGetUsableModelsResponse(response);
	if (!decoded) {
		return null;
	}
	const models = normalizeCursorModels(decoded.models ?? []);
	return models.length > 0 ? models : null;
}

export async function enrichCursorCredentials(
	credentials: OAuthCredentials,
	options: { previous?: CursorCredentials; url?: string } = {},
): Promise<CursorCredentials> {
	let models: CursorProviderModel[] | undefined;
	try {
		models = (await discoverCursorModels(credentials.access, options.url)) ?? undefined;
	} catch {
		models = undefined;
	}
	return {
		...options.previous,
		...credentials,
		models: models ?? options.previous?.models ?? getFallbackCursorModels(),
		lastModelRefresh: Date.now(),
	};
}

export function toProviderModels(models: CursorProviderModel[]): CursorProviderModel[] {
	return sanitizeStoredModels(models);
}

export function decodeGetUsableModelsResponse(payload: Uint8Array): { models?: readonly unknown[] } | null {
	try {
		return fromBinary(GetUsableModelsResponseSchema, payload) as { models?: readonly unknown[] };
	} catch {
		const body = decodeConnectUnaryBody(payload);
		if (!body) {
			return null;
		}
		try {
			return fromBinary(GetUsableModelsResponseSchema, body) as { models?: readonly unknown[] };
		} catch {
			return null;
		}
	}
}

export function normalizeCursorModels(models: readonly unknown[]): CursorProviderModel[] {
	const byId = new Map<string, CursorProviderModel>();
	for (const model of models) {
		const normalized = normalizeSingleCursorModel(model);
		if (normalized) {
			byId.set(normalized.id, normalized);
		}
	}
	return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeSingleCursorModel(model: unknown): CursorProviderModel | null {
	if (!model || typeof model !== "object") {
		return null;
	}
	const data = model as Record<string, JsonValue>;
	const id = typeof data.modelId === "string" ? data.modelId.trim() : "";
	if (!id) {
		return null;
	}
	const name = pickDisplayName(data, id);
	const reasoning = Boolean(data.thinkingDetails) || /(?:reason|think|sonnet|opus|composer|gpt-5|gemini-3|claude)/i.test(id);
	return toCursorProviderModel({
		id,
		name,
		reasoning,
		contextWindow: inferContextWindow(id),
		maxTokens: inferMaxTokens(id),
	});
}

function pickDisplayName(data: Record<string, JsonValue>, fallback: string): string {
	const aliases = Array.isArray(data.aliases) ? data.aliases : [];
	const candidates = [data.displayName, data.displayNameShort, data.displayModelId, ...aliases, fallback];
	for (const candidate of candidates) {
		if (typeof candidate !== "string") {
			continue;
		}
		const trimmed = candidate.trim();
		if (trimmed) {
			return trimmed;
		}
	}
	return fallback;
}

function inferCost(id: string): CursorProviderModel["cost"] {
	const lower = id.toLowerCase();
	const entries: Array<[RegExp, CursorProviderModel["cost"]]> = [
		[/claude.*opus.*fast/i, MODEL_COST_TABLE["claude-4.6-opus-fast"]],
		[/claude.*opus/i, MODEL_COST_TABLE["claude-4.6-opus"]],
		[/claude.*haiku/i, MODEL_COST_TABLE["claude-4.5-haiku"]],
		[/claude.*sonnet/i, MODEL_COST_TABLE["claude-4.6-sonnet"]],
		[/composer-?2-fast/i, MODEL_COST_TABLE["composer-2-fast"]],
		[/composer-?2/i, MODEL_COST_TABLE["composer-2"]],
		[/composer-?1\.5/i, MODEL_COST_TABLE["composer-1.5"]],
		[/composer/i, MODEL_COST_TABLE["composer-1"]],
		[/gpt-5\.4.*nano/i, MODEL_COST_TABLE["gpt-5.4-nano"]],
		[/gpt-5\.4.*mini/i, MODEL_COST_TABLE["gpt-5.4-mini"]],
		[/gpt-5\.4/i, MODEL_COST_TABLE["gpt-5.4"]],
		[/gpt-5\.3.*codex/i, MODEL_COST_TABLE["gpt-5.3-codex"]],
		[/gpt-5\.2.*codex/i, MODEL_COST_TABLE["gpt-5.2-codex"]],
		[/gpt-5\.2/i, MODEL_COST_TABLE["gpt-5.2"]],
		[/gpt-5\.1.*mini/i, MODEL_COST_TABLE["gpt-5.1-codex-mini"]],
		[/gpt-5\.1.*codex/i, MODEL_COST_TABLE["gpt-5.1-codex"]],
		[/gpt-5.*codex/i, MODEL_COST_TABLE["gpt-5-codex"]],
		[/gpt-5.*mini/i, MODEL_COST_TABLE["gpt-5-mini"]],
		[/gpt-5.*fast/i, MODEL_COST_TABLE["gpt-5-fast"]],
		[/gpt-5/i, MODEL_COST_TABLE["gpt-5"]],
		[/gemini-3\.1-pro/i, MODEL_COST_TABLE["gemini-3.1-pro"]],
		[/gemini-3-pro/i, MODEL_COST_TABLE["gemini-3-pro"]],
		[/gemini-3-flash/i, MODEL_COST_TABLE["gemini-3-flash"]],
		[/grok/i, MODEL_COST_TABLE["grok-4.20"]],
		[/kimi/i, MODEL_COST_TABLE["kimi-k2.5"]],
	];
	for (const [pattern, cost] of entries) {
		if (pattern.test(lower)) {
			return { ...cost };
		}
	}
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

function inferContextWindow(id: string): number {
	if (/gemini-3\.1-pro/i.test(id)) {
		return 1_000_000;
	}
	if (/gpt-5\.(?:2|3)/i.test(id)) {
		return 400_000;
	}
	if (/gpt-5\.4/i.test(id)) {
		return 272_000;
	}
	return DEFAULT_CONTEXT_WINDOW;
}

function inferMaxTokens(id: string): number {
	if (/claude.*opus/i.test(id)) {
		return 128_000;
	}
	if (/gpt-5\.(?:2|3|4)/i.test(id)) {
		return 128_000;
	}
	return DEFAULT_MAX_TOKENS;
}

export function toCursorProviderModel(model: Partial<CursorProviderModel> & Pick<CursorProviderModel, "id" | "name">): CursorProviderModel {
	return {
		id: model.id,
		name: model.name,
		reasoning: model.reasoning ?? false,
		input: model.input ?? ["text"],
		cost: model.cost ? { ...model.cost } : inferCost(model.id),
		contextWindow: model.contextWindow ?? inferContextWindow(model.id),
		maxTokens: model.maxTokens ?? inferMaxTokens(model.id),
	};
}

function sanitizeStoredModels(models: readonly CursorProviderModel[]): CursorProviderModel[] {
	return models.map((model) =>
		toCursorProviderModel({
			id: model.id,
			name: model.name,
			reasoning: model.reasoning,
			input: model.input,
			cost: model.cost,
			contextWindow: model.contextWindow,
			maxTokens: model.maxTokens,
		}),
	);
}
