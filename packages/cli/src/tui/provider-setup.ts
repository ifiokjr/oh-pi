import * as p from "@clack/prompts";
import type { DiscoveredModel, ProviderConfig, ProviderSetupStrategy } from "@ifi/oh-pi-core";
import { PROVIDERS, t } from "@ifi/oh-pi-core";
import chalk from "chalk";
import type { EnvInfo } from "../utils/detect.js";

/** Provider API base URLs for dynamic model fetching */
const PROVIDER_API_URLS: Record<string, string> = {
	anthropic: "https://api.anthropic.com",
	google: "https://generativelanguage.googleapis.com",
	groq: "https://api.groq.com",
	mistral: "https://api.mistral.ai",
	openai: "https://api.openai.com",
	openrouter: "https://openrouter.ai",
	xai: "https://api.x.ai",
};

/**
 * Normalize user-entered base URL for model discovery probes.
 * Discovery always calls `${base}/v1/models`, so strip trailing `/v1` to avoid `/v1/v1/models`.
 */
export function normalizeDiscoveryBaseUrl(baseUrl: string): string {
	const trimmed = baseUrl.trim().replace(/\/+$/, "");
	return trimmed.replace(/\/v1$/i, "");
}

/** Block internal/private IPs to prevent SSRF */
export function isUnsafeUrl(urlStr: string): boolean {
	try {
		const u = new URL(urlStr);
		const host = u.hostname;

		// Allow localhost for local dev servers (Ollama, vLLM, etc.)
		if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
			return false;
		}

		// Block private IP ranges
		if (host.startsWith("10.")) {
			return true;
		}

		if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
			return true;
		}

		if (host.startsWith("192.168.")) {
			return true;
		}

		if (host.startsWith("0.") || host === "0.0.0.0") {
			return true;
		}

		if (host.includes(":") || host.startsWith("[")) {
			return true;
		}

		if (host.startsWith("169.254.")) {
			return true;
		}

		// Block non-https for remote hosts
		if (u.protocol !== "https:") {
			return true;
		}

		return false;
	} catch {
		return true;
	}
}

interface FetchResult {
	models: DiscoveredModel[];
	api?: string;
}

interface AnthropicModelResponseItem {
	id: string;
	// Biome-ignore lint/style/useNamingConvention: External API field name.
	owned_by?: string;
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

type OpenAIApiMode = "auto" | "openai-responses" | "openai-completions";

export interface ProviderSetupResult {
	providers: ProviderConfig[];
	providerStrategy: ProviderSetupStrategy;
}

export function resolveOpenAIApiMode(mode: OpenAIApiMode, modelId: string): "openai-responses" | "openai-completions" {
	if (mode !== "auto") {
		return mode;
	}
	const model = modelId.toLowerCase();
	if (/^(o\d|gpt-5|gpt-4\.1|gpt-4\.5)/.test(model)) {
		return "openai-responses";
	}
	return "openai-completions";
}

export function isOpenAICompatibleApi(api?: string): boolean {
	return !api || api === "openai-completions" || api === "openai-responses";
}

/**
 * Dynamically fetch model list, trying Anthropic, Google, and OpenAI-compatible API styles.
 * @param provider - Provider name
 * @param baseUrl - API base URL
 * @param apiKey - API key or environment variable name
 * @returns discovered model list and detected API type
 */
async function fetchModels(provider: string, baseUrl: string, apiKey: string): Promise<FetchResult> {
	const base = normalizeDiscoveryBaseUrl(baseUrl);
	const resolvedKey = process.env[apiKey] ?? apiKey;

	// Try Anthropic-style first (for known anthropic or any provider)
	try {
		const res = await fetch(`${base}/v1/models`, {
			headers: { "anthropic-version": "2023-06-01", "x-api-key": resolvedKey },
			signal: AbortSignal.timeout(8000),
		});
		if (res.ok) {
			const json = (await res.json()) as { data?: AnthropicModelResponseItem[] };
			const data = json.data ?? [];
			if (data.length > 0 && data[0].owned_by === "anthropic") {
				return {
					api: "anthropic-messages",
					models: data
						.map((m) => ({
							contextWindow: m.max_tokens ?? 200000,
							id: m.id,
							input: ["text", "image"] as ("text" | "image")[],
							maxTokens: m.thinking_enabled
								? Math.min(m.max_tokens ?? 128000, 128000)
								: Math.min(m.max_tokens ?? 8192, 16384),
							reasoning: m.thinking_enabled ?? false,
						}))
						.toSorted((a: DiscoveredModel, b: DiscoveredModel) => a.id.localeCompare(b.id)),
				};
			}
		}
	} catch {
		/* Fall through */
	}

	// Try Google-style
	if (provider === "google") {
		try {
			const res = await fetch(`${base}/v1beta/models?key=${resolvedKey}`, {
				signal: AbortSignal.timeout(8000),
			});
			if (res.ok) {
				const json = (await res.json()) as { models?: GoogleModelResponseItem[] };
				const data = (json.models ?? []).filter((m) => m.name?.includes("gemini"));
				if (data.length > 0) {
					return {
						api: "google-generative-ai",
						models: data
							.map((m) => ({
								contextWindow: m.inputTokenLimit ?? 1048576,
								id: m.name.replace("models/", ""),
								input: ["text", "image"] as ("text" | "image")[],
								maxTokens: m.outputTokenLimit ?? 65536,
								reasoning: m.name.includes("thinking") || m.name.includes("2.5"),
							}))
							.toSorted((a: DiscoveredModel, b: DiscoveredModel) => a.id.localeCompare(b.id)),
					};
				}
			}
		} catch {
			/* Fall through */
		}
	}

	// Try OpenAI-compatible
	try {
		const res = await fetch(`${base}/v1/models`, {
			headers: { authorization: `Bearer ${resolvedKey}` },
			signal: AbortSignal.timeout(8000),
		});
		if (res.ok) {
			const json = (await res.json()) as { data?: OpenAIModelResponseItem[] };
			const data = json.data ?? [];
			if (data.length > 0) {
				return {
					api: "openai-completions",
					models: data
						.map((m) => ({
							contextWindow: m.context_window ?? m.max_tokens ?? 128000,
							id: m.id,
							input: ["text", "image"] as ("text" | "image")[],
							maxTokens: m.max_output ?? 16384,
							reasoning: m.thinking_enabled ?? m.id.includes("o3"),
						}))
						.toSorted((a: DiscoveredModel, b: DiscoveredModel) => a.id.localeCompare(b.id)),
				};
			}
		}
	} catch {
		/* Fall through */
	}

	return { models: [] };
}

/**
 * Interactively configure API providers with an explicit strategy.
 * Default flow: one primary provider. Advanced flow: optional fallback providers.
 * @param env - Current environment info with detected providers
 * @returns Provider setup result with strategy and selected providers
 */
// Biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Interactive setup flow needs explicit branching per provider strategy.
export async function setupProviders(env?: EnvInfo): Promise<ProviderSetupResult> {
	const entries = Object.entries(PROVIDERS);
	let providerStrategy: ProviderSetupStrategy = "replace";

	// Detect existing providers — offer keep / replace / add
	const detected = env?.existingProviders ?? [];
	if (detected.length > 0) {
		const action = await p.select({
			message: t("provider.detected", { list: detected.join(", ") }),
			options: [
				{ hint: t("provider.detectedKeepHint"), label: t("provider.detectedKeep"), value: "keep" },
				{ hint: t("provider.detectedReplaceHint"), label: t("provider.detectedReplace"), value: "replace" },
				{ hint: t("provider.detectedAddHint"), label: t("provider.detectedAdd"), value: "add" },
			],
		});
		if (p.isCancel(action)) {
			p.cancel(t("cancelled"));
			process.exit(0);
		}

		if (action === "keep") {
			return { providerStrategy: "keep", providers: [] };
		}

		providerStrategy = action;
	}

	const selected = new Set<string>(providerStrategy === "add" ? detected : []);
	const configs: ProviderConfig[] = [];

	if (providerStrategy === "add") {
		let pickedAny = false;
		while (true) {
			const options = [
				...entries
					.filter(([key]) => !selected.has(key))
					.map(([key, info]) => ({ hint: info.env, label: info.label, value: key })),
				...(selected.has("_custom")
					? []
					: [{ hint: t("provider.customHint"), label: t("provider.custom"), value: "_custom" }]),
			];
			if (options.length === 0) {
				break;
			}

			if (pickedAny) {
				const addMore = await p.confirm({
					initialValue: false,
					message: t("provider.addFallback"),
				});
				if (p.isCancel(addMore)) {
					p.cancel(t("cancelled"));
					process.exit(0);
				}
				if (!addMore) {
					break;
				}
			}

			const next = await p.select({
				message: pickedAny ? t("provider.selectFallback") : t("provider.selectAdditional"),
				options,
			});
			if (p.isCancel(next)) {
				p.cancel(t("cancelled"));
				process.exit(0);
			}
			selected.add(next);

			const added = await setupProviderChoice(next);
			if (added) {
				configs.push(added);
			}
			pickedAny = true;
		}
		return { providerStrategy: "add", providers: configs };
	}

	const firstChoice = await p.select({
		message: t("provider.selectPrimary"),
		options: [
			...entries.map(([key, info]) => ({ hint: info.env, label: info.label, value: key })),
			{ hint: t("provider.customHint"), label: t("provider.custom"), value: "_custom" },
		],
	});
	if (p.isCancel(firstChoice)) {
		p.cancel(t("cancelled"));
		process.exit(0);
	}

	selected.add(firstChoice);
	const primary = await setupProviderChoice(firstChoice);
	if (primary) {
		configs.push(primary);
	}

	// Advanced: optional fallback providers
	while (true) {
		const options = [
			...entries
				.filter(([key]) => !selected.has(key))
				.map(([key, info]) => ({ hint: info.env, label: info.label, value: key })),
			...(selected.has("_custom")
				? []
				: [{ hint: t("provider.customHint"), label: t("provider.custom"), value: "_custom" }]),
		];
		if (options.length === 0) {
			break;
		}

		const addFallback = await p.confirm({
			initialValue: false,
			message: t("provider.addFallback"),
		});
		if (p.isCancel(addFallback)) {
			p.cancel(t("cancelled"));
			process.exit(0);
		}
		if (!addFallback) {
			break;
		}

		const next = await p.select({
			message: t("provider.selectFallback"),
			options,
		});
		if (p.isCancel(next)) {
			p.cancel(t("cancelled"));
			process.exit(0);
		}
		selected.add(next);

		const fallback = await setupProviderChoice(next);
		if (fallback) {
			configs.push(fallback);
		}
	}

	return { providerStrategy: "replace", providers: configs };
}

async function setupProviderChoice(choice: string): Promise<ProviderConfig | null> {
	if (choice === "_custom") {
		return await setupCustomProvider();
	}

	const name = choice;
	const info = PROVIDERS[name];
	if (!info) {
		p.log.error(`Unknown provider: ${name}`);
		return null;
	}

	const envVal = process.env[info.env];

	const useCustomUrl = await p.confirm({
		initialValue: false,
		message: t("provider.useCustomUrl", { label: info.label }),
	});
	if (p.isCancel(useCustomUrl)) {
		p.cancel(t("cancelled"));
		process.exit(0);
	}

	let baseUrl: string | undefined;
	if (useCustomUrl) {
		const url = await p.text({
			message: t("provider.baseUrl", { label: info.label }),
			placeholder: t("provider.baseUrlPlaceholder"),
			validate: (v) =>
				v?.startsWith("http")
					? isUnsafeUrl(v)
						? "URL must use HTTPS for remote hosts (private IPs blocked)"
						: undefined
					: t("provider.baseUrlValidation"),
		});
		if (p.isCancel(url)) {
			p.cancel(t("cancelled"));
			process.exit(0);
		}
		baseUrl = url;
	}

	let apiKey: string;
	if (envVal && !baseUrl) {
		const useEnv = await p.confirm({ message: t("provider.foundEnv", { env: chalk.cyan(info.env) }) });
		if (p.isCancel(useEnv)) {
			p.cancel(t("cancelled"));
			process.exit(0);
		}
		apiKey = useEnv ? info.env : await promptKey(info.label);
	} else {
		apiKey = await promptKey(info.label);
	}

	const fetchUrl = baseUrl || PROVIDER_API_URLS[name];
	const { defaultModel, discoveredModels, api } = await selectModelWithMeta(
		name,
		info.label,
		info.models,
		fetchUrl,
		apiKey,
	);

	let finalApi = api;
	if (name === "openai") {
		finalApi = await selectOpenAIApiModeWithHint(info.label, defaultModel);
	}

	p.log.success(t("provider.configured", { label: info.label }));
	return { api: finalApi, apiKey, baseUrl, defaultModel, discoveredModels, name };
}

async function selectOpenAIApiMode(
	label: string,
	defaultModel: string,
): Promise<"openai-responses" | "openai-completions"> {
	const selected = await p.select({
		message: t("provider.apiMode", { label }),
		options: [
			{ hint: t("provider.apiModeAutoHint", { model: defaultModel }), label: t("provider.apiModeAuto"), value: "auto" },
			{ hint: t("provider.apiModeResponsesHint"), label: t("provider.apiModeResponses"), value: "openai-responses" },
			{
				hint: t("provider.apiModeCompletionsHint"),
				label: t("provider.apiModeCompletions"),
				value: "openai-completions",
			},
		],
	});
	if (p.isCancel(selected)) {
		p.cancel(t("cancelled"));
		process.exit(0);
	}
	return resolveOpenAIApiMode(selected, defaultModel);
}

function selectOpenAIApiModeWithHint(
	label: string,
	defaultModel: string,
): Promise<"openai-responses" | "openai-completions"> {
	p.note(t("provider.apiModeIntro"), t("provider.apiModeNext"));
	return selectOpenAIApiMode(label, defaultModel);
}

/**
 * Interactively configure a custom provider (Ollama, vLLM, or other OpenAI-compatible endpoints).
 * @returns Custom provider config, or null if cancelled
 */
async function setupCustomProvider(): Promise<ProviderConfig | null> {
	const name = await p.text({
		message: t("provider.name"),
		placeholder: t("provider.namePlaceholder"),
		validate: (v) => (!v || v.trim().length === 0 ? t("provider.nameRequired") : undefined),
	});
	if (p.isCancel(name)) {
		p.cancel(t("cancelled"));
		process.exit(0);
	}

	const baseUrl = await p.text({
		message: t("provider.baseUrlCustom"),
		placeholder: t("provider.baseUrlCustomPlaceholder"),
		validate: (v) =>
			v?.startsWith("http")
				? isUnsafeUrl(v)
					? "URL must use HTTPS for remote hosts (private IPs blocked)"
					: undefined
				: t("provider.baseUrlValidation"),
	});
	if (p.isCancel(baseUrl)) {
		p.cancel(t("cancelled"));
		process.exit(0);
	}

	const needsKey = await p.confirm({ initialValue: false, message: t("provider.needsKey") });
	if (p.isCancel(needsKey)) {
		p.cancel(t("cancelled"));
		process.exit(0);
	}

	let apiKey = "none";
	if (needsKey) {
		apiKey = await promptKey(name);
	}

	const { defaultModel, discoveredModels, api } = await selectModelWithMeta(name, name, [], baseUrl, apiKey);
	const finalApi = isOpenAICompatibleApi(api) ? await selectOpenAIApiModeWithHint(name, defaultModel) : api;

	p.log.success(t("provider.customConfigured", { name, url: baseUrl }));

	return { api: finalApi, apiKey, baseUrl, defaultModel, discoveredModels, name };
}

interface SelectResult {
	defaultModel: string;
	discoveredModels?: DiscoveredModel[];
	api?: string;
}

export function buildModelSelectionOptions(modelIds: readonly string[]) {
	return modelIds.map((modelId) => ({ label: modelId, value: modelId }));
}

/**
 * Select a default model by dynamically fetching available models, falling back to a static list or manual input.
 * @param provider - Provider name
 * @param label - Provider display label
 * @param staticModels - Static model list fallback
 * @param baseUrl - API base URL
 * @param apiKey - API key
 * @returns Selected model and discovered model metadata
 */
async function selectModelWithMeta(
	provider: string,
	label: string,
	staticModels: string[],
	baseUrl?: string,
	apiKey?: string,
): Promise<SelectResult> {
	let modelIds = staticModels;
	let discoveredModels: DiscoveredModel[] | undefined;
	let api: string | undefined;

	if (baseUrl && apiKey) {
		const s = p.spinner();
		s.start(t("provider.fetchingModels", { source: label }));
		const result = await fetchModels(provider, baseUrl, apiKey);
		s.stop(
			result.models.length > 0
				? t("provider.foundModels", { count: result.models.length })
				: t("provider.defaultModelList"),
		);
		if (result.models.length > 0) {
			discoveredModels = result.models;
			({ api } = result);
			modelIds = result.models.map((m) => m.id);
		}
	}

	if (modelIds.length === 0) {
		const model = await p.text({
			message: t("provider.modelName", { label }),
			placeholder: t("provider.modelNamePlaceholder"),
			validate: (v) => (!v || v.trim().length === 0 ? t("provider.modelNameRequired") : undefined),
		});
		if (p.isCancel(model)) {
			p.cancel(t("cancelled"));
			process.exit(0);
		}

		return { api, defaultModel: model, discoveredModels };
	}

	if (modelIds.length === 1) {
		return { api, defaultModel: modelIds[0], discoveredModels };
	}

	const model = await p.select({
		message: t("provider.selectModel", { label }),
		options: buildModelSelectionOptions(modelIds),
	});
	if (p.isCancel(model)) {
		p.cancel(t("cancelled"));
		process.exit(0);
	}
	return { api, defaultModel: model, discoveredModels };
}

/**
 * Prompt the user to enter an API key.
 * @param label - Provider display label
 * @returns The entered API key
 */
async function promptKey(label: string): Promise<string> {
	const key = await p.password({
		message: t("provider.apiKey", { label }),
		validate: (v) => (!v || v.trim().length === 0 ? t("provider.apiKeyRequired") : undefined),
	});
	if (p.isCancel(key)) {
		p.cancel(t("cancelled"));
		process.exit(0);
	}
	return key;
}
