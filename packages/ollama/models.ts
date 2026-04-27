import type { Api, Model, OAuthCredentials } from "@mariozechner/pi-ai";
import { getOllamaCloudRuntimeConfig, getOllamaLocalRuntimeConfig } from "./config.js";
import type { OllamaRuntimeConfig } from "./config.js";

export type OllamaModelSource = "local" | "cloud";
export type OllamaLocalAvailability = "installed" | "downloadable";

export interface OllamaProviderModel {
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
	source?: OllamaModelSource;
	localAvailability?: OllamaLocalAvailability;
	family?: string;
	parameterSize?: string;
	quantization?: string;
	capabilities?: string[];
}

export type OllamaCloudProviderModel = OllamaProviderModel;

export type OllamaCloudCredentials = OAuthCredentials & {
	models?: OllamaProviderModel[];
	lastModelRefresh?: number;
};

interface OllamaListedModel {
	id?: string;
	object?: string;
}

interface OllamaShowResponse {
	capabilities?: unknown;
	model_info?: Record<string, unknown>;
	details?: Record<string, unknown>;
}

const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;
const MAX_DISCOVERY_CONCURRENCY = 6;

const OLLAMA_CLOUD_ZAI_REASONING_MAX_TOKENS = 131_072;

const OLLAMA_OPENAI_COMPAT: NonNullable<OllamaProviderModel["compat"]> = {
	maxTokensField: "max_tokens",
	reasoningEffortMap: {
		high: "high",
		low: "low",
		medium: "medium",
		minimal: "low",
		xhigh: "high",
	},
	supportsDeveloperRole: false,
	supportsReasoningEffort: true,
};

const OLLAMA_CLOUD_ZAI_COMPAT: Partial<NonNullable<OllamaProviderModel["compat"]>> = {
	supportsReasoningEffort: false,
	thinkingFormat: "zai",
	zaiToolStream: true,
};

const FALLBACK_OLLAMA_CLOUD_MODELS: OllamaProviderModel[] = [
	toOllamaModel({
		contextWindow: 163_840,
		id: "cogito-2.1:671b",
		input: ["text"],
		maxTokens: 20_480,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 163_840,
		id: "deepseek-v3.1:671b",
		input: ["text"],
		maxTokens: 20_480,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 163_840,
		id: "deepseek-v3.2",
		input: ["text"],
		maxTokens: 20_480,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 1_048_576,
		id: "deepseek-v4-flash",
		input: ["text"],
		maxTokens: 65_536,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "devstral-2:123b",
		input: ["text"],
		maxTokens: 32_768,
		reasoning: false,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "devstral-small-2:24b",
		input: ["text", "image"],
		maxTokens: 32_768,
		reasoning: false,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 1_048_576,
		id: "gemini-3-flash-preview",
		input: ["text"],
		maxTokens: 65_536,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 131_072,
		id: "gemma3:12b",
		input: ["text", "image"],
		maxTokens: 16_384,
		reasoning: false,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 131_072,
		id: "gemma3:27b",
		input: ["text", "image"],
		maxTokens: 16_384,
		reasoning: false,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 131_072,
		id: "gemma3:4b",
		input: ["text", "image"],
		maxTokens: 16_384,
		reasoning: false,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "gemma4:31b",
		input: ["text", "image"],
		maxTokens: 32_768,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 202_752,
		id: "glm-4.6",
		input: ["text"],
		maxTokens: 25_344,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 202_752,
		id: "glm-4.7",
		input: ["text"],
		maxTokens: 25_344,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 202_752,
		id: "glm-5",
		input: ["text"],
		maxTokens: 25_344,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 202_752,
		id: "glm-5.1",
		input: ["text"],
		maxTokens: 25_344,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 131_072,
		id: "gpt-oss:120b",
		input: ["text"],
		maxTokens: 16_384,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 131_072,
		id: "gpt-oss:20b",
		input: ["text"],
		maxTokens: 16_384,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "kimi-k2-thinking",
		input: ["text"],
		maxTokens: 32_768,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "kimi-k2.5",
		input: ["text", "image"],
		maxTokens: 32_768,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "kimi-k2.6",
		input: ["text", "image"],
		maxTokens: 32_768,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "kimi-k2:1t",
		input: ["text"],
		maxTokens: 32_768,
		reasoning: false,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 204_800,
		id: "minimax-m2",
		input: ["text"],
		maxTokens: 25_600,
		reasoning: false,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 204_800,
		id: "minimax-m2.1",
		input: ["text"],
		maxTokens: 25_600,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 204_800,
		id: "minimax-m2.5",
		input: ["text"],
		maxTokens: 25_600,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 204_800,
		id: "minimax-m2.7",
		input: ["text"],
		maxTokens: 25_600,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "ministral-3:14b",
		input: ["text", "image"],
		maxTokens: 32_768,
		reasoning: false,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "ministral-3:3b",
		input: ["text", "image"],
		maxTokens: 32_768,
		reasoning: false,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "ministral-3:8b",
		input: ["text", "image"],
		maxTokens: 32_768,
		reasoning: false,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "mistral-large-3:675b",
		input: ["text", "image"],
		maxTokens: 32_768,
		reasoning: false,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 1_048_576,
		id: "nemotron-3-nano:30b",
		input: ["text"],
		maxTokens: 65_536,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "nemotron-3-super",
		input: ["text"],
		maxTokens: 32_768,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "qwen3-coder-next",
		input: ["text"],
		maxTokens: 32_768,
		reasoning: false,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "qwen3-coder:480b",
		input: ["text"],
		maxTokens: 32_768,
		reasoning: false,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "qwen3-next:80b",
		input: ["text"],
		maxTokens: 32_768,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "qwen3-vl:235b",
		input: ["text", "image"],
		maxTokens: 32_768,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "qwen3-vl:235b-instruct",
		input: ["text", "image"],
		maxTokens: 32_768,
		reasoning: false,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 262_144,
		id: "qwen3.5:397b",
		input: ["text", "image"],
		maxTokens: 32_768,
		reasoning: true,
		source: "cloud",
	}),
	toOllamaModel({
		contextWindow: 32_768,
		id: "rnj-1:8b",
		input: ["text"],
		maxTokens: 16_384,
		reasoning: false,
		source: "cloud",
	}),
];

export function getFallbackOllamaCloudModels(): OllamaProviderModel[] {
	return FALLBACK_OLLAMA_CLOUD_MODELS.map(cloneModel);
}

export function getFallbackOllamaLocalModels(): OllamaProviderModel[] {
	return [];
}

export function getCredentialModels(credentials: OllamaCloudCredentials): OllamaProviderModel[] {
	const models = Array.isArray(credentials.models) ? credentials.models : [];
	return models.length > 0 ? sanitizeStoredModels(models) : getFallbackOllamaCloudModels();
}

export async function discoverOllamaLocalModels(
	options: { signal?: AbortSignal } = {},
): Promise<OllamaProviderModel[] | null> {
	return discoverOllamaModels(getOllamaLocalRuntimeConfig(), {
		signal: options.signal,
		source: "local",
	});
}

export async function discoverOllamaCloudModelList(
	apiKey?: string,
	options: { signal?: AbortSignal } = {},
): Promise<OllamaProviderModel[] | null> {
	const config = getOllamaCloudRuntimeConfig();
	const fallbackModels = getFallbackOllamaCloudModels();
	const modelIds = await discoverOllamaModelIds(config, { apiKey, signal: options.signal });
	if (modelIds.length === 0) return null;
	return modelIds
		.map((id) => normalizeDiscoveredModel(id, null, "cloud", fallbackModels))
		.filter((model) => model !== null);
}

export async function discoverOllamaCloudModels(
	apiKey?: string,
	options: { signal?: AbortSignal } = {},
): Promise<OllamaProviderModel[] | null> {
	const config = getOllamaCloudRuntimeConfig();
	const fallbackModels = getFallbackOllamaCloudModels();
	const publicModels = await discoverOllamaModels(config, {
		fallbackModels,
		signal: options.signal,
		source: "cloud",
	});
	if (!apiKey) {
		return publicModels;
	}
	const authenticatedModels = await discoverOllamaModels(config, {
		apiKey,
		fallbackModels,
		signal: options.signal,
		source: "cloud",
	}).catch(() => null);
	return mergeDiscoveredModels(publicModels, authenticatedModels);
}

export async function enrichOllamaCloudCredentials(
	credentials: OAuthCredentials,
	options: { previous?: OllamaCloudCredentials; signal?: AbortSignal } = {},
): Promise<OllamaCloudCredentials> {
	let models: OllamaProviderModel[] | undefined;
	try {
		models = (await discoverOllamaCloudModels(credentials.access, { signal: options.signal })) ?? undefined;
	} catch {
		models = undefined;
	}
	return {
		...options.previous,
		...credentials,
		lastModelRefresh: Date.now(),
		models: models ?? options.previous?.models ?? getFallbackOllamaCloudModels(),
	};
}

export function toProviderModels(models: OllamaProviderModel[]): OllamaProviderModel[] {
	return sanitizeStoredModels(models);
}

export function toDownloadableOllamaLocalModel(model: OllamaProviderModel): OllamaProviderModel {
	return toOllamaModel({
		...model,
		localAvailability: "downloadable",
		name: `${stripSourceSuffix(model.name)} (Local download)`,
		source: "local",
	});
}

export function mergeOllamaLocalCatalog(
	installedModels: readonly OllamaProviderModel[],
	downloadableModels: readonly OllamaProviderModel[],
): OllamaProviderModel[] {
	const merged = new Map<string, OllamaProviderModel>();
	for (const model of downloadableModels) {
		merged.set(model.id, toDownloadableOllamaLocalModel(model));
	}
	for (const model of installedModels) {
		merged.set(
			model.id,
			toOllamaModel({
				...model,
				localAvailability: "installed",
				name: `${stripSourceSuffix(model.name)} (Local)`,
				source: "local",
			}),
		);
	}
	return [...merged.values()].toSorted((left, right) => left.id.localeCompare(right.id));
}

export function toOllamaModel(
	model: Partial<OllamaProviderModel> & Pick<OllamaProviderModel, "id">,
): OllamaProviderModel {
	const contextWindow = normalizePositiveInteger(model.contextWindow, DEFAULT_CONTEXT_WINDOW);
	const maxTokens = normalizeModelMaxTokens(model, contextWindow);
	const compatDefaults = getOllamaCompatDefaults(model);
	return {
		capabilities: sanitizeCapabilities(model.capabilities),
		compat: { ...OLLAMA_OPENAI_COMPAT, ...compatDefaults, ...(model.compat ?? {}) },
		contextWindow,
		cost: model.cost ? { ...model.cost } : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		family: sanitizeOptionalString(model.family),
		id: model.id,
		input: sanitizeInput(model.input),
		localAvailability: sanitizeLocalAvailability(model.localAvailability),
		maxTokens,
		name: applySourceSuffix(model.name?.trim() || formatDisplayName(model.id), model.source),
		parameterSize: sanitizeOptionalString(model.parameterSize),
		quantization: sanitizeOptionalString(model.quantization),
		reasoning: model.reasoning ?? false,
		source: model.source,
	};
}

export const toOllamaCloudModel = toOllamaModel;

async function discoverOllamaModelIds(
	config: OllamaRuntimeConfig,
	options: { apiKey?: string; signal?: AbortSignal },
): Promise<string[]> {
	const listed = await fetchJson<{ data?: OllamaListedModel[] }>(config.modelsUrl, {
		headers: createDiscoveryHeaders(options.apiKey),
		signal: options.signal,
	});
	return Array.isArray(listed.data)
		? listed.data
				.map((entry) => (typeof entry?.id === "string" ? entry.id.trim() : ""))
				.filter(Boolean)
				.toSorted((left, right) => left.localeCompare(right))
		: [];
}

async function discoverOllamaModels(
	config: OllamaRuntimeConfig,
	options: {
		source: OllamaModelSource;
		apiKey?: string;
		fallbackModels?: readonly OllamaProviderModel[];
		signal?: AbortSignal;
	},
): Promise<OllamaProviderModel[] | null> {
	const modelIds = await discoverOllamaModelIds(config, options);
	if (modelIds.length === 0) {
		return null;
	}

	const discovered = await mapConcurrent(modelIds, MAX_DISCOVERY_CONCURRENCY, async (id) => {
		const payload = await fetchJson<OllamaShowResponse>(config.showUrl, {
			body: JSON.stringify({ model: id, verbose: true }),
			headers: createDiscoveryHeaders(options.apiKey),
			method: "POST",
			signal: options.signal,
		}).catch(() => null);
		return normalizeDiscoveredModel(id, payload, options.source, options.fallbackModels ?? []);
	});
	const models = discovered.filter((model): model is OllamaProviderModel => model !== null);
	return models.length > 0 ? models : null;
}

function sanitizeStoredModels(models: readonly OllamaProviderModel[]): OllamaProviderModel[] {
	return models.map((model) => toOllamaModel(model));
}

function cloneModel(model: OllamaProviderModel): OllamaProviderModel {
	return {
		...model,
		capabilities: model.capabilities ? [...model.capabilities] : undefined,
		compat: model.compat ? { ...model.compat } : undefined,
		cost: { ...model.cost },
		input: [...model.input],
		localAvailability: model.localAvailability,
	};
}

function normalizeDiscoveredModel(
	id: string,
	payload: OllamaShowResponse | null,
	source: OllamaModelSource,
	fallbackModels: readonly OllamaProviderModel[],
): OllamaProviderModel | null {
	const fallback = fallbackModels.find((model) => model.id === id);
	if (!payload) {
		return fallback
			? cloneModel(fallback)
			: toOllamaModel({ id, localAvailability: source === "local" ? "installed" : undefined, source });
	}
	const capabilities = Array.isArray(payload.capabilities)
		? payload.capabilities.filter((capability): capability is string => typeof capability === "string")
		: [];
	const capabilitySet = new Set(capabilities.map((capability) => capability.toLowerCase()));
	const contextWindow = extractContextWindow(payload.model_info) ?? fallback?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
	return toOllamaModel({
		capabilities,
		contextWindow,
		family: extractDetailField(payload.details, "family") ?? fallback?.family,
		id,
		input: capabilitySet.has("vision") ? ["text", "image"] : (fallback?.input ?? ["text"]),
		localAvailability: source === "local" ? "installed" : undefined,
		maxTokens: fallback?.maxTokens ?? inferMaxTokens(contextWindow),
		parameterSize: extractDetailField(payload.details, "parameter_size") ?? fallback?.parameterSize,
		quantization: extractDetailField(payload.details, "quantization_level") ?? fallback?.quantization,
		reasoning: capabilitySet.has("thinking") || fallback?.reasoning,
		source,
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

function sanitizeInput(input: OllamaProviderModel["input"] | undefined): ("text" | "image")[] {
	const next = Array.isArray(input) && input.includes("image") ? (["text", "image"] as const) : (["text"] as const);
	return [...next];
}

function inferMaxTokens(
	contextWindow: number,
	model: Partial<Pick<OllamaProviderModel, "id" | "source">> = {},
): number {
	if (isOllamaCloudZaiModel(model)) {
		return OLLAMA_CLOUD_ZAI_REASONING_MAX_TOKENS;
	}

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

function normalizeModelMaxTokens(
	model: Partial<OllamaProviderModel> & Pick<OllamaProviderModel, "id">,
	contextWindow: number,
): number {
	const inferred = inferMaxTokens(contextWindow, model);
	const normalized = normalizePositiveInteger(model.maxTokens, inferred);

	if (!isOllamaCloudZaiModel(model)) {
		return normalized;
	}

	return Math.max(normalized, OLLAMA_CLOUD_ZAI_REASONING_MAX_TOKENS);
}

function getOllamaCompatDefaults(
	model: Partial<Pick<OllamaProviderModel, "id" | "source">>,
): Partial<NonNullable<OllamaProviderModel["compat"]>> {
	if (isOllamaCloudZaiModel(model)) {
		return OLLAMA_CLOUD_ZAI_COMPAT;
	}

	return {};
}

function isOllamaCloudZaiModel(model: Partial<Pick<OllamaProviderModel, "id" | "source">>): boolean {
	return model.source === "cloud" && typeof model.id === "string" && model.id.trim().toLowerCase().startsWith("glm-");
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function formatDisplayName(id: string): string {
	return id
		.replaceAll(/[-_]/g, " ")
		.replaceAll(/:/g, " ")
		.replaceAll(/\bglm\b/gi, "GLM")
		.replaceAll(/\bgpt\b/gi, "GPT")
		.replaceAll(/\boss\b/gi, "OSS")
		.replaceAll(/\bvl\b/gi, "VL")
		.replaceAll(/\brnj\b/gi, "RNJ")
		.replaceAll(/\b(\d+)b\b/gi, (_, size: string) => `${size.toUpperCase()}B`)
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

function applySourceSuffix(name: string, source: OllamaModelSource | undefined): string {
	if (!source) {
		return name;
	}
	if (/\((local|cloud|local download)\)$/i.test(name)) {
		return name;
	}
	return `${name} (${source === "local" ? "Local" : "Cloud"})`;
}

function stripSourceSuffix(name: string): string {
	return name.replace(/\s*\((local|cloud|local download)\)$/i, "").trim();
}

function sanitizeOptionalString(value: string | undefined): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function sanitizeLocalAvailability(
	value: OllamaProviderModel["localAvailability"] | undefined,
): OllamaLocalAvailability | undefined {
	return value === "installed" || value === "downloadable" ? value : undefined;
}

function sanitizeCapabilities(capabilities: string[] | undefined): string[] | undefined {
	if (!Array.isArray(capabilities) || capabilities.length === 0) {
		return undefined;
	}
	return [...new Set(capabilities.map((capability) => capability.trim()).filter(Boolean))];
}

function extractDetailField(details: Record<string, unknown> | undefined, key: string): string | undefined {
	const value = details?.[key];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function createDiscoveryHeaders(apiKey?: string): Record<string, string> {
	return apiKey
		? {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			}
		: {
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
		body: options.body,
		headers: options.headers,
		method: options.method ?? (options.body ? "POST" : "GET"),
		signal: options.signal,
	});
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Ollama request failed (${response.status}): ${body || response.statusText}`);
	}
	return (await response.json()) as T;
}

function mergeDiscoveredModels(
	publicModels: OllamaProviderModel[] | null,
	authenticatedModels: OllamaProviderModel[] | null,
): OllamaProviderModel[] | null {
	const merged = new Map<string, OllamaProviderModel>();
	for (const model of publicModels ?? []) {
		merged.set(model.id, cloneModel(model));
	}
	for (const model of authenticatedModels ?? []) {
		const existing = merged.get(model.id);
		merged.set(model.id, {
			...cloneModel(existing ?? model),
			...cloneModel(model),
			capabilities: sanitizeCapabilities([...(existing?.capabilities ?? []), ...(model.capabilities ?? [])]),
			input: [...new Set([...(existing?.input ?? []), ...model.input])] as ("text" | "image")[],
		});
	}
	if (merged.size > 0) {
		return [...merged.values()].toSorted((left, right) => left.id.localeCompare(right.id));
	}
	return null;
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
