import type { Api, Model, OAuthCredentials } from "@mariozechner/pi-ai";
import { MODELS_DEV_CACHE_TTL_MS, MODELS_DEV_CATALOG_URL, normalizeProviderBaseUrl } from "./config.js";
import type { SupportedProviderDefinition } from "./config.js";

export interface ProviderCatalogModel {
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
}

export type ProviderCatalogCredentials = OAuthCredentials & {
	providerId?: string;
	models?: ProviderCatalogModel[];
	lastModelRefresh?: number;
};

interface ModelsDevCatalogProvider {
	name?: string;
	models?: Record<string, ModelsDevCatalogModel>;
}

interface ModelsDevCatalogModel {
	id?: string;
	name?: string;
	reasoning?: boolean;
	attachment?: boolean;
	cost?: {
		input?: number;
		output?: number;
		// Biome-ignore lint/style/useNamingConvention: External API field name.
		cache_read?: number;
		// Biome-ignore lint/style/useNamingConvention: External API field name.
		cache_write?: number;
	};
	limit?: {
		context?: number;
		output?: number;
	};
	modalities?: {
		input?: string[];
		output?: string[];
	};
}

interface AnthropicModelResponseItem {
	id: string;
	// Biome-ignore lint/style/useNamingConvention: External API field name.
	thinking_enabled?: boolean;
	// Biome-ignore lint/style/useNamingConvention: External API field name.
	max_tokens?: number;
}

interface GoogleModelResponseItem {
	name: string;
	inputTokenLimit?: number;
	outputTokenLimit?: number;
}

interface OpenAIModelResponseItem {
	id: string;
	// Biome-ignore lint/style/useNamingConvention: External API field name.
	thinking_enabled?: boolean;
	// Biome-ignore lint/style/useNamingConvention: External API field name.
	context_window?: number;
	// Biome-ignore lint/style/useNamingConvention: External API field name.
	max_tokens?: number;
	// Biome-ignore lint/style/useNamingConvention: External API field name.
	max_output?: number;
}

type ModelsDevCatalog = Record<string, ModelsDevCatalogProvider>;

interface LiveDiscoveredModel {
	id: string;
	reasoning?: boolean;
	input?: ("text" | "image")[];
	contextWindow?: number;
	maxTokens?: number;
}

const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;
const NON_CHAT_MODEL_PATTERN =
	/(?:embed|embedding|rerank|moderat|transcrib|tts|speech|audio-to-text|text-to-speech|image-gen)/i;

let cachedCatalog: ModelsDevCatalog | null = null;
let cachedCatalogAt = 0;

export function clearModelsDevCatalogCache(): void {
	cachedCatalog = null;
	cachedCatalogAt = 0;
}

export async function getModelsDevCatalog(force = false): Promise<ModelsDevCatalog> {
	if (!force && cachedCatalog && Date.now() - cachedCatalogAt < MODELS_DEV_CACHE_TTL_MS) {
		return cachedCatalog;
	}

	const response = await fetch(MODELS_DEV_CATALOG_URL, {
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) {
		throw new Error(`models.dev catalog request failed (${response.status}): ${await response.text()}`);
	}

	const catalog = (await response.json()) as ModelsDevCatalog;
	cachedCatalog = catalog;
	cachedCatalogAt = Date.now();
	return catalog;
}

export async function getCatalogModels(provider: SupportedProviderDefinition): Promise<ProviderCatalogModel[]> {
	const catalog = await getModelsDevCatalog().catch(() => ({}) as ModelsDevCatalog);
	const models = (catalog[provider.id]?.models ?? {}) as Record<string, ModelsDevCatalogModel>;
	return Object.values(models)
		.filter(isTextGenerationModel)
		.map((model) =>
			toProviderCatalogModel({
				contextWindow: positiveNumber(model.limit?.context) ?? DEFAULT_CONTEXT_WINDOW,
				cost: {
					cacheRead: positiveNumber(model.cost?.cache_read) ?? 0,
					cacheWrite: positiveNumber(model.cost?.cache_write) ?? 0,
					input: positiveNumber(model.cost?.input) ?? 0,
					output: positiveNumber(model.cost?.output) ?? 0,
				},
				id: model.id ?? "",
				input: model.modalities?.input?.includes("image") || model.attachment ? ["text", "image"] : ["text"],
				maxTokens:
					positiveNumber(model.limit?.output) ??
					inferMaxTokens(positiveNumber(model.limit?.context) ?? DEFAULT_CONTEXT_WINDOW),
				name: model.name,
				reasoning: model.reasoning,
			}),
		)
		.filter((model) => model.id.length > 0)
		.toSorted((left, right) => left.id.localeCompare(right.id));
}

export async function resolveProviderModels(
	provider: SupportedProviderDefinition,
	apiKey: string,
	options: {
		signal?: AbortSignal;
		previous?: readonly ProviderCatalogModel[];
	} = {},
): Promise<ProviderCatalogModel[]> {
	const catalogModels = await getCatalogModels(provider).catch(() => []);

	try {
		const discovered = await discoverProviderModels(provider, apiKey, {
			fallbackModels: catalogModels,
			signal: options.signal,
		});
		if (discovered.length > 0) {
			return discovered;
		}
	} catch {
		// Fall back below
	}

	if (options.previous && options.previous.length > 0) {
		return sanitizeStoredModels(options.previous);
	}

	return catalogModels;
}

export function getCredentialModels(credentials: ProviderCatalogCredentials): ProviderCatalogModel[] {
	const models = Array.isArray(credentials.models) ? credentials.models : [];
	return sanitizeStoredModels(models);
}

export function discoverProviderModels(
	provider: SupportedProviderDefinition,
	apiKey: string,
	options: {
		signal?: AbortSignal;
		fallbackModels?: readonly ProviderCatalogModel[];
	} = {},
): Promise<ProviderCatalogModel[]> {
	if (provider.api === "anthropic-messages") {
		return discoverAnthropicModels(provider, apiKey, options);
	}

	if (provider.api === "google-generative-ai") {
		return discoverGoogleModels(provider, apiKey, options);
	}

	return discoverOpenAICompatibleModels(provider, apiKey, options);
}

export function toProviderCatalogModel(
	model: Partial<ProviderCatalogModel> & Pick<ProviderCatalogModel, "id">,
): ProviderCatalogModel {
	const contextWindow = positiveNumber(model.contextWindow) ?? DEFAULT_CONTEXT_WINDOW;
	const maxTokens = positiveNumber(model.maxTokens) ?? inferMaxTokens(contextWindow);
	const input =
		Array.isArray(model.input) && model.input.includes("image") ? (["text", "image"] as const) : (["text"] as const);

	return {
		compat: model.compat ? { ...model.compat } : undefined,
		contextWindow,
		cost: model.cost
			? { ...model.cost }
			: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
				},
		id: model.id,
		input: [...input],
		maxTokens,
		name: model.name?.trim() || formatDisplayName(model.id),
		reasoning: Boolean(model.reasoning),
	};
}

function sanitizeStoredModels(models: readonly ProviderCatalogModel[]): ProviderCatalogModel[] {
	return models.map((model) => toProviderCatalogModel(model));
}

function isTextGenerationModel(model: ModelsDevCatalogModel): boolean {
	const id = model.id ?? "";
	if (!id || NON_CHAT_MODEL_PATTERN.test(id)) {
		return false;
	}

	const input = model.modalities?.input;
	const output = model.modalities?.output;
	const supportsTextInput = input ? input.includes("text") : true;
	const supportsTextOutput = output ? output.includes("text") : true;
	return supportsTextInput && supportsTextOutput;
}

async function discoverAnthropicModels(
	provider: SupportedProviderDefinition,
	apiKey: string,
	options: {
		signal?: AbortSignal;
		fallbackModels?: readonly ProviderCatalogModel[];
	},
): Promise<ProviderCatalogModel[]> {
	const response = (await fetchJsonFromCandidates<{ data?: AnthropicModelResponseItem[] }>(
		buildModelEndpointCandidates(provider.baseUrl),
		{
			headers: {
				"anthropic-version": "2023-06-01",
				"x-api-key": apiKey,
			},
			signal: options.signal,
		},
	)) ?? { data: [] };

	return mergeDiscoveredModels(
		(response.data ?? []).map((model) => ({
			contextWindow: undefined,
			id: model.id,
			input: ["text", "image"],
			maxTokens: positiveNumber(model.max_tokens),
			reasoning: model.thinking_enabled ?? guessReasoning(model.id),
		})),
		options.fallbackModels,
	);
}

async function discoverGoogleModels(
	provider: SupportedProviderDefinition,
	apiKey: string,
	options: {
		signal?: AbortSignal;
		fallbackModels?: readonly ProviderCatalogModel[];
	},
): Promise<ProviderCatalogModel[]> {
	const response = (await fetchJsonFromCandidates<{ models?: GoogleModelResponseItem[] }>(
		[`${normalizeProviderBaseUrl(provider.baseUrl)}/v1beta/models?key=${encodeURIComponent(apiKey)}`],
		{
			signal: options.signal,
		},
	)) ?? { models: [] };

	return mergeDiscoveredModels(
		(response.models ?? [])
			.filter((model) => model.name.includes("gemini"))
			.map((model) => ({
				contextWindow: positiveNumber(model.inputTokenLimit),
				id: model.name.replace(/^models\//, ""),
				input: ["text", "image"],
				maxTokens: positiveNumber(model.outputTokenLimit),
				reasoning: guessReasoning(model.name),
			})),
		options.fallbackModels,
	);
}

async function discoverOpenAICompatibleModels(
	provider: SupportedProviderDefinition,
	apiKey: string,
	options: {
		signal?: AbortSignal;
		fallbackModels?: readonly ProviderCatalogModel[];
	},
): Promise<ProviderCatalogModel[]> {
	const response = (await fetchJsonFromCandidates<{ data?: OpenAIModelResponseItem[] }>(
		buildModelEndpointCandidates(provider.baseUrl),
		{
			headers: {
				authorization: `Bearer ${apiKey}`,
			},
			signal: options.signal,
		},
	)) ?? { data: [] };

	return mergeDiscoveredModels(
		(response.data ?? []).map((model) => ({
			contextWindow: positiveNumber(model.context_window) ?? positiveNumber(model.max_tokens),
			id: model.id,
			input: guessInput(model.id),
			maxTokens: positiveNumber(model.max_output),
			reasoning: model.thinking_enabled ?? guessReasoning(model.id),
		})),
		options.fallbackModels,
	);
}

function mergeDiscoveredModels(
	discovered: readonly LiveDiscoveredModel[],
	fallbackModels: readonly ProviderCatalogModel[] = [],
): ProviderCatalogModel[] {
	const fallbackById = new Map(fallbackModels.map((model) => [model.id, model]));
	const next = new Map<string, ProviderCatalogModel>();

	for (const model of discovered) {
		const fallback = fallbackById.get(model.id);
		if (!fallback && NON_CHAT_MODEL_PATTERN.test(model.id)) {
			continue;
		}

		next.set(
			model.id,
			toProviderCatalogModel({
				compat: fallback?.compat,
				contextWindow: model.contextWindow ?? fallback?.contextWindow,
				cost: fallback?.cost,
				id: model.id,
				input: model.input ?? fallback?.input ?? guessInput(model.id),
				maxTokens: model.maxTokens ?? fallback?.maxTokens,
				name: fallback?.name ?? formatDisplayName(model.id),
				reasoning: model.reasoning ?? fallback?.reasoning ?? guessReasoning(model.id),
			}),
		);
	}

	return [...next.values()].toSorted((left, right) => left.id.localeCompare(right.id));
}

async function fetchJsonFromCandidates<T>(
	urls: readonly string[],
	options: { headers?: Record<string, string>; signal?: AbortSignal },
): Promise<T | null> {
	let lastError: string | null = null;

	for (const url of urls) {
		const response = await fetch(url, {
			headers: options.headers,
			signal: options.signal ?? AbortSignal.timeout(8000),
		}).catch((error) => {
			lastError = error instanceof Error ? error.message : String(error);
			return null;
		});
		if (!response) {
			continue;
		}
		if (!response.ok) {
			lastError = `${response.status} ${response.statusText}`;
			continue;
		}
		return (await response.json()) as T;
	}

	if (lastError) {
		throw new Error(lastError);
	}

	return null;
}

function buildModelEndpointCandidates(baseUrl: string): string[] {
	const normalized = normalizeProviderBaseUrl(baseUrl);
	if (/\/v\d+(?:beta)?$/i.test(normalized)) {
		return [`${normalized}/models`];
	}
	return [`${normalized}/v1/models`, `${normalized}/models`];
}

function inferMaxTokens(contextWindow: number): number {
	if (contextWindow >= 1_000_000) {
		return 65_536;
	}
	if (contextWindow >= 256_000) {
		return 32_768;
	}
	return DEFAULT_MAX_TOKENS;
}

function positiveNumber(value: number | undefined): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return undefined;
	}
	return Math.floor(value);
}

function guessReasoning(id: string): boolean {
	return /(?:reason|think|o1|o3|o4|gpt-5|claude|sonnet|opus|gemini-2\.5|gemini-3|grok|kimi|deepseek-r1|minimax-m2\.[157]|glm-5)/i.test(
		id,
	);
}

function guessInput(id: string): ("text" | "image")[] {
	return /(?:vision|vl|image|multimodal)/i.test(id) ? ["text", "image"] : ["text"];
}

function formatDisplayName(id: string): string {
	return id
		.replaceAll(/[/:_-]+/g, " ")
		.replaceAll(/\bglm\b/gi, "GLM")
		.replaceAll(/\bgpt\b/gi, "GPT")
		.replaceAll(/\bvl\b/gi, "VL")
		.replaceAll(/\bai\b/gi, "AI")
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
