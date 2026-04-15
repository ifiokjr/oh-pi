import type { OAuthCredentials, OAuthLoginCallbacks, OAuthProviderInterface } from "@mariozechner/pi-ai";
import { getCredentialModels, type ProviderCatalogCredentials, resolveProviderModels } from "./catalog.js";
import { getEnvApiKey, STATIC_CREDENTIAL_TTL_MS, type SupportedProviderDefinition } from "./config.js";

export async function loginProvider(
	provider: SupportedProviderDefinition,
	callbacks: OAuthLoginCallbacks,
): Promise<ProviderCatalogCredentials> {
	callbacks.onAuth({
		url: provider.authUrl,
		instructions: `Create or copy a ${provider.name} API key, then paste it back into pi.`,
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
	return enrichProviderCredentials(provider, createStaticCredential(apiKey), { signal: callbacks.signal });
}

export function refreshProviderCredential(
	provider: SupportedProviderDefinition,
	credentials: OAuthCredentials,
	options: { preserveModels?: boolean; signal?: AbortSignal } = {},
): Promise<ProviderCatalogCredentials> {
	return enrichProviderCredentials(provider, createStaticCredential(credentials.access), {
		signal: options.signal,
		previous: options.preserveModels === false ? undefined : (credentials as ProviderCatalogCredentials),
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
		signal: options.signal,
		previous: options.previous?.models,
	}).catch(() => (options.previous?.models ? getCredentialModels(options.previous) : []));

	return {
		...options.previous,
		...credentials,
		providerId: provider.id,
		models,
		lastModelRefresh: Date.now(),
	};
}

export function createApiKeyOAuthProvider(provider: SupportedProviderDefinition): Omit<OAuthProviderInterface, "id"> {
	return {
		name: `${provider.name} (experimental)`,
		login(callbacks) {
			return loginProvider(provider, callbacks);
		},
		refreshToken(credentials) {
			return refreshProviderCredential(provider, credentials);
		},
		getApiKey(credentials) {
			return credentials.access;
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
	};
}

function createStaticCredential(apiKey: string): OAuthCredentials {
	return {
		refresh: apiKey,
		access: apiKey,
		expires: Date.now() + STATIC_CREDENTIAL_TTL_MS,
	};
}
