import type { OAuthCredentials, OAuthLoginCallbacks, OAuthProviderInterface } from "@mariozechner/pi-ai";
import {
	getOllamaCloudRuntimeConfig,
	OLLAMA_API,
	OLLAMA_CLOUD_API_KEY_ENV,
	OLLAMA_CLOUD_AUTH_DOCS_URL,
	OLLAMA_CLOUD_PROVIDER,
} from "./config.js";
import { enrichOllamaCloudCredentials, getCredentialModels } from "./models.js";
import type { OllamaCloudCredentials, OllamaProviderModel } from "./models.js";

const STATIC_CREDENTIAL_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export async function loginOllamaCloud(callbacks: OAuthLoginCallbacks): Promise<OllamaCloudCredentials> {
	const config = getOllamaCloudRuntimeConfig();
	callbacks.onAuth({
		instructions:
			"Create an Ollama API key, then paste it back into pi. Ollama documents API keys for third-party cloud access; pi uses that flow for Ollama Cloud login.",
		url: config.keysUrl,
	});
	callbacks.onProgress?.("Waiting for Ollama Cloud API key...");
	const envApiKey = getEnvApiKey();
	const promptMessage = envApiKey
		? `Paste your Ollama API key (leave blank to use ${OLLAMA_CLOUD_API_KEY_ENV} from the environment):`
		: `Paste your Ollama API key (see ${OLLAMA_CLOUD_AUTH_DOCS_URL}):`;
	const input = (await callbacks.onPrompt({ message: promptMessage })).trim();
	const apiKey = input || envApiKey;
	if (!apiKey) {
		throw new Error(
			`No Ollama API key provided. Set ${OLLAMA_CLOUD_API_KEY_ENV} or paste a key from ${config.keysUrl}.`,
		);
	}
	callbacks.onProgress?.("Validating Ollama Cloud API key and discovering models...");
	return enrichOllamaCloudCredentials(createStaticCredential(apiKey), {
		signal: callbacks.signal,
	});
}

export async function refreshOllamaCloudCredential(
	credentials: OAuthCredentials,
	options: { preserveModels?: boolean } = {},
): Promise<OllamaCloudCredentials> {
	return enrichOllamaCloudCredentials(createStaticCredential(credentials.access), {
		previous: options.preserveModels === false ? undefined : (credentials as OllamaCloudCredentials),
	});
}

export async function refreshOllamaCloudCredentialModels(
	credentials: OllamaCloudCredentials,
): Promise<OllamaCloudCredentials> {
	return enrichOllamaCloudCredentials(createStaticCredential(credentials.access), { previous: credentials });
}

export type CloudModelsGetter = () => OllamaProviderModel[];

export function createOllamaCloudOAuthProvider(
	getActiveCloudModels: CloudModelsGetter,
): Omit<OAuthProviderInterface, "id"> {
	return {
		getApiKey(credentials) {
			return credentials.access;
		},
		async login(callbacks) {
			return loginOllamaCloud(callbacks);
		},
		modifyModels(models, credentials) {
			const config = getOllamaCloudRuntimeConfig();
			const runtimeModels = getActiveCloudModels();
			const current =
				runtimeModels.length > 0 ? runtimeModels : getCredentialModels(credentials as OllamaCloudCredentials);
			return [
				...models.filter((model) => model.provider !== OLLAMA_CLOUD_PROVIDER),
				...current.map((model) => ({
					...model,
					provider: OLLAMA_CLOUD_PROVIDER,
					api: OLLAMA_API,
					baseUrl: config.apiUrl,
				})),
			];
		},
		name: "Ollama Cloud",
		async refreshToken(credentials) {
			return refreshOllamaCloudCredential(credentials);
		},
	};
}

function createStaticCredential(apiKey: string): OAuthCredentials {
	return {
		access: apiKey,
		expires: Date.now() + STATIC_CREDENTIAL_TTL_MS,
		refresh: apiKey,
	};
}

function getEnvApiKey(): string | undefined {
	const value = process.env[OLLAMA_CLOUD_API_KEY_ENV];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
