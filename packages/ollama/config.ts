const DEFAULT_OLLAMA_LOCAL_ORIGIN = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_CLOUD_ORIGIN = "https://ollama.com";
const DEFAULT_OLLAMA_API_PATH = "/v1";
const DEFAULT_OLLAMA_KEYS_PATH = "/settings/keys";
const DEFAULT_OLLAMA_SHOW_PATH = "/api/show";
const DEFAULT_OLLAMA_MODELS_PATH = "/models";

export interface OllamaRuntimeConfig {
	origin: string;
	apiUrl: string;
	showUrl: string;
	modelsUrl: string;
}

export interface OllamaCloudRuntimeConfig extends OllamaRuntimeConfig {
	keysUrl: string;
}

function getEnv(...names: string[]): string | undefined {
	for (const name of names) {
		const value = process.env[name];
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}
	return undefined;
}

function stripTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

function appendPath(base: string, path: string): string {
	return `${stripTrailingSlash(base)}${path}`;
}

function normalizeApiUrl(value: string, fallbackOrigin: string): string {
	try {
		const url = new URL(value);
		if (url.pathname === "" || url.pathname === "/") {
			url.pathname = DEFAULT_OLLAMA_API_PATH;
		}
		url.search = "";
		url.hash = "";
		return stripTrailingSlash(url.toString());
	} catch {
		return appendPath(fallbackOrigin, DEFAULT_OLLAMA_API_PATH);
	}
}

function deriveOriginFromApiUrl(apiUrl: string, fallbackOrigin: string): string {
	try {
		const url = new URL(apiUrl);
		url.pathname = "";
		url.search = "";
		url.hash = "";
		return stripTrailingSlash(url.toString());
	} catch {
		return fallbackOrigin;
	}
}

export function getOllamaLocalRuntimeConfig(): OllamaRuntimeConfig {
	const explicitApiUrl = getEnv("PI_OLLAMA_LOCAL_API_URL", "OLLAMA_LOCAL_API_URL");
	const explicitOrigin = getEnv("PI_OLLAMA_LOCAL_ORIGIN", "OLLAMA_LOCAL_ORIGIN", "OLLAMA_HOST");
	const origin = stripTrailingSlash(explicitOrigin ?? DEFAULT_OLLAMA_LOCAL_ORIGIN);
	const apiUrl = normalizeApiUrl(explicitApiUrl ?? origin, DEFAULT_OLLAMA_LOCAL_ORIGIN);
	const resolvedOrigin = deriveOriginFromApiUrl(apiUrl, DEFAULT_OLLAMA_LOCAL_ORIGIN);
	const showUrl = stripTrailingSlash(
		getEnv("PI_OLLAMA_LOCAL_SHOW_URL", "OLLAMA_LOCAL_SHOW_URL") ?? appendPath(resolvedOrigin, DEFAULT_OLLAMA_SHOW_PATH),
	);
	const modelsUrl = stripTrailingSlash(
		getEnv("PI_OLLAMA_LOCAL_MODELS_URL", "OLLAMA_LOCAL_MODELS_URL") ?? appendPath(apiUrl, DEFAULT_OLLAMA_MODELS_PATH),
	);
	return { apiUrl, modelsUrl, origin: resolvedOrigin, showUrl };
}

export function getOllamaCloudRuntimeConfig(): OllamaCloudRuntimeConfig {
	const explicitApiUrl = getEnv("PI_OLLAMA_CLOUD_API_URL", "OLLAMA_CLOUD_API_URL");
	const explicitOrigin = getEnv("PI_OLLAMA_CLOUD_ORIGIN", "OLLAMA_CLOUD_ORIGIN", "OLLAMA_HOST_CLOUD");
	const origin = stripTrailingSlash(explicitOrigin ?? DEFAULT_OLLAMA_CLOUD_ORIGIN);
	const apiUrl = normalizeApiUrl(explicitApiUrl ?? origin, DEFAULT_OLLAMA_CLOUD_ORIGIN);
	const resolvedOrigin = deriveOriginFromApiUrl(apiUrl, DEFAULT_OLLAMA_CLOUD_ORIGIN);
	const keysUrl = stripTrailingSlash(
		getEnv("PI_OLLAMA_CLOUD_KEYS_URL", "OLLAMA_CLOUD_KEYS_URL") ?? appendPath(resolvedOrigin, DEFAULT_OLLAMA_KEYS_PATH),
	);
	const showUrl = stripTrailingSlash(
		getEnv("PI_OLLAMA_CLOUD_SHOW_URL", "OLLAMA_CLOUD_SHOW_URL") ?? appendPath(resolvedOrigin, DEFAULT_OLLAMA_SHOW_PATH),
	);
	const modelsUrl = stripTrailingSlash(
		getEnv("PI_OLLAMA_CLOUD_MODELS_URL", "OLLAMA_CLOUD_MODELS_URL") ?? appendPath(apiUrl, DEFAULT_OLLAMA_MODELS_PATH),
	);
	return { apiUrl, keysUrl, modelsUrl, origin: resolvedOrigin, showUrl };
}

export const OLLAMA_LOCAL_PROVIDER = "ollama";
export const OLLAMA_CLOUD_PROVIDER = "ollama-cloud";
export const OLLAMA_API = "openai-completions" as const;
export const OLLAMA_LOCAL_API_KEY_LITERAL = "ollama";
export const OLLAMA_CLOUD_API_KEY_ENV = "OLLAMA_API_KEY";
export const OLLAMA_CLOUD_AUTH_DOCS_URL = "https://docs.ollama.com/api/authentication";
