import type { OAuthCredentials, OAuthLoginCallbacks, OAuthProviderInterface } from "@mariozechner/pi-ai";
import { getCredentialModels, resolveProviderModels } from "./catalog.js";
import type { ProviderCatalogCredentials } from "./catalog.js";
import { getEnvApiKey, STATIC_CREDENTIAL_TTL_MS } from "./config.js";
import type { SupportedProviderDefinition } from "./config.js";

export async function loginProvider(
	provider: SupportedProviderDefinition,
	callbacks: OAuthLoginCallbacks,
): Promise<ProviderCatalogCredentials> {
	callbacks.onAuth({
		instructions: `Create or copy a ${provider.name} API key, then paste it back into pi.`,
		url: provider.authUrl,
	});
	callbacks.onProgress?.(`Waiting for a ${provider.name} API key...`);

	const envApiKey = getEnvApiKey(provider);
	const envLabel = provider.env.join(" or ");
	const promptMessage = envApiKey
		? `Paste your ${provider.name} API key (leave blank to use ${envLabel} from the environment):`
		: `Paste your ${provider.name} API key:`;
	const input = (await callbacks.onPrompt({ message: promptMessage })).trim();
	const apiKey = input || envApiKey;
	if (!apiKey) {
		throw new Error(`No ${provider.name} API key provided. Set ${envLabel} or paste a key from ${provider.authUrl}.`);
	}

	callbacks.onProgress?.(`Refreshing the ${provider.name} model catalog...`);
	return enrichProviderCredentials(provider, createStaticCredential(apiKey), {
		signal: callbacks.signal,
	});
}

export function refreshProviderCredential(
	provider: SupportedProviderDefinition,
	credentials: OAuthCredentials,
	options: { preserveModels?: boolean; signal?: AbortSignal } = {},
): Promise<ProviderCatalogCredentials> {
	return enrichProviderCredentials(provider, createStaticCredential(credentials.access), {
		previous: options.preserveModels === false ? undefined : (credentials as ProviderCatalogCredentials),
		signal: options.signal,
	});
}

export function refreshProviderCredentialModels(
	provider: SupportedProviderDefinition,
	credentials: ProviderCatalogCredentials,
): Promise<ProviderCatalogCredentials> {
	return enrichProviderCredentials(provider, createStaticCredential(credentials.access), {
		previous: credentials,
	});
}

export async function enrichProviderCredentials(
	provider: SupportedProviderDefinition,
	credentials: OAuthCredentials,
	options: { previous?: ProviderCatalogCredentials; signal?: AbortSignal } = {},
): Promise<ProviderCatalogCredentials> {
	const models = await resolveProviderModels(provider, credentials.access, {
		previous: options.previous?.models,
		signal: options.signal,
	}).catch(() => (options.previous?.models ? getCredentialModels(options.previous) : []));

	return {
		...options.previous,
		...credentials,
		lastModelRefresh: Date.now(),
		models,
		providerId: provider.id,
	};
}

export function createApiKeyOAuthProvider(provider: SupportedProviderDefinition): Omit<OAuthProviderInterface, "id"> {
	return {
		getApiKey(credentials) {
			return credentials.access;
		},
		login(callbacks) {
			return loginProvider(provider, callbacks);
		},
		modifyModels(models, credentials) {
			const current = getCredentialModels(credentials as ProviderCatalogCredentials);
			return [
				...models.filter((model) => model.provider !== provider.id),
				...current.map((model) => ({
					...model,
					provider: provider.id,
					api: provider.api,
					baseUrl: provider.baseUrl,
				})),
			];
		},
		name: `${provider.name} (experimental)`,
		refreshToken(credentials) {
			return refreshProviderCredential(provider, credentials);
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
