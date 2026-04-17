import { SUPPORTED_PROVIDER_DATA } from "./supported-providers.generated.js";

export type ProviderApiKind =
	| "anthropic-messages"
	| "google-generative-ai"
	| "openai-completions"
	| "openai-responses"
	| "mistral-conversations";

export interface SupportedProviderDefinition {
	id: string;
	name: string;
	env: string[];
	baseUrl: string;
	npm: string;
	api: ProviderApiKind;
	authUrl: string;
}

const AUTH_URLS: Record<string, string> = {
	anthropic: "https://console.anthropic.com/settings/keys",
	google: "https://aistudio.google.com/app/apikey",
	groq: "https://console.groq.com/keys",
	mistral: "https://console.mistral.ai/api-keys/",
	moonshotai: "https://platform.moonshot.ai/console/api-keys",
	opencode: "https://opencode.ai/zen",
	"opencode-go": "https://opencode.ai/zen/go",
	openai: "https://platform.openai.com/api-keys",
	openrouter: "https://openrouter.ai/keys",
	xai: "https://console.x.ai/team/default/api-keys",
	zenmux: "https://zenmux.ai",
};

export const MODELS_DEV_CATALOG_URL = process.env.PI_PROVIDER_CATALOG_URL?.trim() || "https://models.dev/api.json";
export const MODELS_DEV_CACHE_TTL_MS = 5 * 60 * 1000;
export const STATIC_CREDENTIAL_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export const SUPPORTED_PROVIDERS: SupportedProviderDefinition[] = SUPPORTED_PROVIDER_DATA.map((provider) => ({
	id: provider.id,
	name: provider.name,
	env: [...provider.env],
	baseUrl: normalizeProviderBaseUrl(provider.baseUrl),
	npm: provider.npm,
	api: resolveProviderApi(provider.id, provider.npm),
	authUrl: resolveProviderAuthUrl(provider.id, provider.baseUrl),
}));

export const SUPPORTED_PROVIDERS_BY_ID = new Map(SUPPORTED_PROVIDERS.map((provider) => [provider.id, provider]));

export function getSupportedProvider(providerId: string): SupportedProviderDefinition {
	const provider = SUPPORTED_PROVIDERS_BY_ID.get(providerId);
	if (!provider) {
		throw new Error(`Unsupported provider: ${providerId}`);
	}
	return provider;
}

export function getEnvApiKey(provider: SupportedProviderDefinition): string | undefined {
	for (const envName of provider.env) {
		const value = process.env[envName];
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}
	return undefined;
}

export function resolveApiKeyConfig(provider: SupportedProviderDefinition): string {
	return getEnvApiKey(provider) ?? provider.env[0] ?? "API_KEY";
}

export function normalizeProviderBaseUrl(baseUrl: string): string {
	return baseUrl
		.trim()
		.replace(/\/+$/, "")
		.replace(/\/(?:chat\/completions|responses|messages|completions|models)$/i, "");
}

function resolveProviderApi(providerId: string, npm: string): ProviderApiKind {
	if (providerId === "openai") {
		return "openai-responses";
	}

	if (providerId === "mistral") {
		return "mistral-conversations";
	}

	if (npm === "@ai-sdk/google") {
		return "google-generative-ai";
	}

	if (npm === "@ai-sdk/anthropic") {
		return "anthropic-messages";
	}

	return "openai-completions";
}

function resolveProviderAuthUrl(providerId: string, baseUrl: string): string {
	const configured = AUTH_URLS[providerId];
	if (configured) {
		return configured;
	}

	const url = new URL(baseUrl);
	if (url.hostname.startsWith("api.")) {
		return `https://${url.hostname.slice(4)}`;
	}
	return url.origin;
}
