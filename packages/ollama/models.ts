import type { OAuthCredentials, Model, Api } from "@mariozechner/pi-ai";
import { getOllamaCloudRuntimeConfig } from "./config.js";

export type OllamaCloudProviderModel = {
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
	compat?: Model<Api>["compat"];
};

export type OllamaCloudCredentials = OAuthCredentials & {
	models?: OllamaCloudProviderModel[];
	lastModelRefresh?: number;
};

type OllamaCloudListedModel = {
	id?: string;
	object?: string;
};

type OllamaCloudShowResponse = {
	capabilities?: unknown;
	model_info?: Record<string, unknown>;
};

const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;
const MAX_DISCOVERY_CONCURRENCY = 6;

const OLLAMA_OPENAI_COMPAT: NonNullable<OllamaCloudProviderModel["compat"]> = {
	supportsDeveloperRole: false,
	supportsReasoningEffort: true,
	reasoningEffortMap: {
		minimal: "low",
		low: "low",
		medium: "medium",
		high: "high",
		xhigh: "high",
	},
	maxTokensField: "max_tokens",
};

const FALLBACK_OLLAMA_CLOUD_MODELS: OllamaCloudProviderModel[] = [
	toOllamaCloudModel({ id: "cogito-2.1:671b", reasoning: true, input: ["text"], contextWindow: 163_840, maxTokens: 20_480 }),
	toOllamaCloudModel({ id: "deepseek-v3.1:671b", reasoning: true, input: ["text"], contextWindow: 163_840, maxTokens: 20_480 }),
	toOllamaCloudModel({ id: "deepseek-v3.2", reasoning: true, input: ["text"], contextWindow: 163_840, maxTokens: 20_480 }),
	toOllamaCloudModel({ id: "devstral-2:123b", reasoning: false, input: ["text"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "devstral-small-2:24b", reasoning: false, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "gemini-3-flash-preview", reasoning: true, input: ["text"], contextWindow: 1_048_576, maxTokens: 65_536 }),
	toOllamaCloudModel({ id: "gemma3:12b", reasoning: false, input: ["text", "image"], contextWindow: 131_072, maxTokens: 16_384 }),
	toOllamaCloudModel({ id: "gemma3:27b", reasoning: false, input: ["text", "image"], contextWindow: 131_072, maxTokens: 16_384 }),
	toOllamaCloudModel({ id: "gemma3:4b", reasoning: false, input: ["text", "image"], contextWindow: 131_072, maxTokens: 16_384 }),
	toOllamaCloudModel({ id: "gemma4:31b", reasoning: true, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "glm-4.6", reasoning: true, input: ["text"], contextWindow: 202_752, maxTokens: 25_344 }),
	toOllamaCloudModel({ id: "glm-4.7", reasoning: true, input: ["text"], contextWindow: 202_752, maxTokens: 25_344 }),
	toOllamaCloudModel({ id: "glm-5", reasoning: true, input: ["text"], contextWindow: 202_752, maxTokens: 25_344 }),
	toOllamaCloudModel({ id: "gpt-oss:120b", reasoning: true, input: ["text"], contextWindow: 131_072, maxTokens: 16_384 }),
	toOllamaCloudModel({ id: "gpt-oss:20b", reasoning: true, input: ["text"], contextWindow: 131_072, maxTokens: 16_384 }),
	toOllamaCloudModel({ id: "kimi-k2-thinking", reasoning: true, input: ["text"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "kimi-k2.5", reasoning: true, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "kimi-k2:1t", reasoning: false, input: ["text"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "minimax-m2", reasoning: false, input: ["text"], contextWindow: 204_800, maxTokens: 25_600 }),
	toOllamaCloudModel({ id: "minimax-m2.1", reasoning: true, input: ["text"], contextWindow: 204_800, maxTokens: 25_600 }),
	toOllamaCloudModel({ id: "minimax-m2.5", reasoning: true, input: ["text"], contextWindow: 204_800, maxTokens: 25_600 }),
	toOllamaCloudModel({ id: "minimax-m2.7", reasoning: true, input: ["text"], contextWindow: 204_800, maxTokens: 25_600 }),
	toOllamaCloudModel({ id: "ministral-3:14b", reasoning: false, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "ministral-3:3b", reasoning: false, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "ministral-3:8b", reasoning: false, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "mistral-large-3:675b", reasoning: false, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "nemotron-3-nano:30b", reasoning: true, input: ["text"], contextWindow: 1_048_576, maxTokens: 65_536 }),
	toOllamaCloudModel({ id: "nemotron-3-super", reasoning: true, input: ["text"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "qwen3-coder-next", reasoning: false, input: ["text"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "qwen3-coder:480b", reasoning: false, input: ["text"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "qwen3-next:80b", reasoning: true, input: ["text"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "qwen3-vl:235b", reasoning: true, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "qwen3-vl:235b-instruct", reasoning: false, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "qwen3.5:397b", reasoning: true, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaCloudModel({ id: "rnj-1:8b", reasoning: false, input: ["text"], contextWindow: 32_768, maxTokens: 16_384 }),
];

export function getFallbackOllamaCloudModels(): OllamaCloudProviderModel[] {
	return FALLBACK_OLLAMA_CLOUD_MODELS.map(cloneModel);
}

export function getCredentialModels(credentials: OllamaCloudCredentials): OllamaCloudProviderModel[] {
	const models = Array.isArray(credentials.models) ? credentials.models : [];
	return models.length > 0 ? sanitizeStoredModels(models) : getFallbackOllamaCloudModels();
}

export async function discoverOllamaCloudModels(apiKey: string, options: { signal?: AbortSignal } = {}): Promise<OllamaCloudProviderModel[] | null> {
	const config = getOllamaCloudRuntimeConfig();
	const listed = await fetchJson<{ data?: OllamaCloudListedModel[] }>(config.modelsUrl, {
		headers: createDiscoveryHeaders(apiKey),
		signal: options.signal,
	});
	const modelIds = Array.isArray(listed.data)
		? listed.data
				.map((entry) => (typeof entry?.id === "string" ? entry.id.trim() : ""))
				.filter(Boolean)
				.sort((left, right) => left.localeCompare(right))
		: [];
	if (modelIds.length === 0) {
		return null;
	}

	const discovered = await mapConcurrent(modelIds, MAX_DISCOVERY_CONCURRENCY, async (id) => {
		const payload = await fetchJson<OllamaCloudShowResponse>(config.showUrl, {
			method: "POST",
			headers: createDiscoveryHeaders(apiKey),
			body: JSON.stringify({ model: id }),
			signal: options.signal,
		}).catch(() => null);
		return normalizeDiscoveredModel(id, payload);
	});
	const models = discovered.filter((model): model is OllamaCloudProviderModel => model !== null);
	return models.length > 0 ? models : null;
}

export async function enrichOllamaCloudCredentials(
	credentials: OAuthCredentials,
	options: { previous?: OllamaCloudCredentials; signal?: AbortSignal } = {},
): Promise<OllamaCloudCredentials> {
	let models: OllamaCloudProviderModel[] | undefined;
	try {
		models = (await discoverOllamaCloudModels(credentials.access, { signal: options.signal })) ?? undefined;
	} catch {
		models = undefined;
	}
	return {
		...options.previous,
		...credentials,
		models: models ?? options.previous?.models ?? getFallbackOllamaCloudModels(),
		lastModelRefresh: Date.now(),
	};
}

export function toProviderModels(models: OllamaCloudProviderModel[]): OllamaCloudProviderModel[] {
	return sanitizeStoredModels(models);
}

export function toOllamaCloudModel(
	model: Partial<OllamaCloudProviderModel> & Pick<OllamaCloudProviderModel, "id">,
): OllamaCloudProviderModel {
	const contextWindow = normalizePositiveInteger(model.contextWindow, DEFAULT_CONTEXT_WINDOW);
	const maxTokens = normalizePositiveInteger(model.maxTokens, inferMaxTokens(contextWindow));
	return {
		id: model.id,
		name: model.name?.trim() || formatDisplayName(model.id),
		reasoning: model.reasoning ?? false,
		input: sanitizeInput(model.input),
		cost: model.cost ? { ...model.cost } : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow,
		maxTokens,
		compat: { ...OLLAMA_OPENAI_COMPAT, ...(model.compat ?? {}) },
	};
}

function sanitizeStoredModels(models: readonly OllamaCloudProviderModel[]): OllamaCloudProviderModel[] {
	return models.map((model) => toOllamaCloudModel(model));
}

function cloneModel(model: OllamaCloudProviderModel): OllamaCloudProviderModel {
	return {
		...model,
		input: [...model.input],
		cost: { ...model.cost },
		compat: model.compat ? { ...model.compat } : undefined,
	};
}

function normalizeDiscoveredModel(id: string, payload: OllamaCloudShowResponse | null): OllamaCloudProviderModel | null {
	const fallback = findFallbackModel(id);
	if (!payload) {
		return fallback ? cloneModel(fallback) : toOllamaCloudModel({ id });
	}
	const capabilities = Array.isArray(payload.capabilities)
		? payload.capabilities.filter((capability): capability is string => typeof capability === "string")
		: [];
	const capabilitySet = new Set(capabilities.map((capability) => capability.toLowerCase()));
	const contextWindow = extractContextWindow(payload.model_info) ?? fallback?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
	return toOllamaCloudModel({
		id,
		reasoning: capabilitySet.has("thinking") || fallback?.reasoning,
		input: capabilitySet.has("vision") ? ["text", "image"] : (fallback?.input ?? ["text"]),
		contextWindow,
		maxTokens: inferMaxTokens(contextWindow),
	});
}

function extractContextWindow(modelInfo: Record<string, unknown> | undefined): number | null {
	if (!modelInfo) {
		return null;
	}
	for (const [key, value] of Object.entries(modelInfo)) {
		if (!key.endsWith(".context_length")) {
			continue;
		}
		const parsed = typeof value === "number" ? value : Number(value);
		if (Number.isFinite(parsed) && parsed > 0) {
			return Math.floor(parsed);
		}
	}
	return null;
}

function sanitizeInput(input: OllamaCloudProviderModel["input"] | undefined): ("text" | "image")[] {
	const next = Array.isArray(input) && input.includes("image") ? (["text", "image"] as const) : (["text"] as const);
	return [...next];
}

function inferMaxTokens(contextWindow: number): number {
	if (contextWindow >= 1_000_000) {
		return 65_536;
	}
	if (contextWindow >= 262_144) {
		return 32_768;
	}
	if (contextWindow >= 160_000) {
		return 20_480;
	}
	return DEFAULT_MAX_TOKENS;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function formatDisplayName(id: string): string {
	return id
		.replace(/[-_]/g, " ")
		.replace(/:/g, " ")
		.replace(/\bglm\b/gi, "GLM")
		.replace(/\bgpt\b/gi, "GPT")
		.replace(/\boss\b/gi, "OSS")
		.replace(/\bvl\b/gi, "VL")
		.replace(/\brnj\b/gi, "RNJ")
		.replace(/\b(\d+)b\b/gi, (_, size: string) => `${size.toUpperCase()}B`)
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => {
			if (/^[A-Z0-9.]+$/.test(part)) {
				return part;
			}
			return `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`;
		})
		.join(" ");
}

function findFallbackModel(id: string): OllamaCloudProviderModel | undefined {
	return FALLBACK_OLLAMA_CLOUD_MODELS.find((model) => model.id === id);
}

function createDiscoveryHeaders(apiKey: string): Record<string, string> {
	return {
		Authorization: `Bearer ${apiKey}`,
		"Content-Type": "application/json",
	};
}

async function fetchJson<T>(
	url: string,
	options: {
		method?: string;
		headers?: Record<string, string>;
		body?: string;
		signal?: AbortSignal;
	} = {},
): Promise<T> {
	const response = await fetch(url, {
		method: options.method ?? (options.body ? "POST" : "GET"),
		headers: options.headers,
		body: options.body,
		signal: options.signal,
	});
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Ollama Cloud request failed (${response.status}): ${body || response.statusText}`);
	}
	return (await response.json()) as T;
}

async function mapConcurrent<T, TResult>(
	items: readonly T[],
	limit: number,
	mapper: (item: T) => Promise<TResult>,
): Promise<TResult[]> {
	const results = new Array<TResult>(items.length);
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (nextIndex < items.length) {
			const current = nextIndex++;
			results[current] = await mapper(items[current]!);
		}
	});
	await Promise.all(workers);
	return results;
}

export { OLLAMA_OPENAI_COMPAT };
