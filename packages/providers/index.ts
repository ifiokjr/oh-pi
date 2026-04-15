import type { AuthCredential, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createApiKeyOAuthProvider, refreshProviderCredential, refreshProviderCredentialModels } from "./auth.js";
import {
	getCatalogModels,
	getCredentialModels,
	type ProviderCatalogCredentials,
	type ProviderCatalogModel,
	resolveProviderModels,
} from "./catalog.js";
import { getEnvApiKey, resolveApiKeyConfig, SUPPORTED_PROVIDERS, type SupportedProviderDefinition } from "./config.js";

type RuntimeProviderState = {
	models: Map<string, ProviderCatalogModel[]>;
	lastRefresh: Map<string, number>;
	lastError: Map<string, string | null>;
};

const runtimeState: RuntimeProviderState = {
	models: new Map(),
	lastRefresh: new Map(),
	lastError: new Map(),
};

function registerProvider(pi: ExtensionAPI, provider: SupportedProviderDefinition): void {
	pi.registerProvider(provider.id, {
		api: provider.api,
		apiKey: resolveApiKeyConfig(provider),
		baseUrl: provider.baseUrl,
		oauth: createApiKeyOAuthProvider(provider),
		models: toProviderModels(runtimeState.models.get(provider.id) ?? []),
	});
}

function registerProvidersCommand(pi: ExtensionAPI): void {
	pi.registerCommand("providers", {
		description:
			"Inspect or refresh the OpenCode-backed multi-provider catalog: /providers [status|list [query]|info <provider>|models <provider>|refresh-models [provider|all]]",
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This explicit command router keeps each provider subcommand readable.
		async handler(args, ctx) {
			const trimmed = args.trim();
			const [rawAction = "status", ...rest] = trimmed ? trimmed.split(/\s+/) : ["status"];
			const action = rawAction.toLowerCase();
			const query = rest.join(" ").trim();

			if (action === "refresh-models") {
				const providers = query && query.toLowerCase() !== "all" ? findProviders(query) : SUPPORTED_PROVIDERS;
				if (providers.length === 0) {
					ctx.ui.notify(`No provider matched "${query}". Run /providers list first.`, "warning");
					return;
				}
				const refreshed = await refreshProviders(pi, ctx, providers);
				ctx.modelRegistry.refresh?.();
				ctx.ui.notify(renderRefreshSummary(refreshed, providers.length), "info");
				return;
			}

			if (action === "list") {
				ctx.ui.notify(renderProviderList(query), "info");
				return;
			}

			if (action === "info") {
				if (!query) {
					ctx.ui.notify("Usage: /providers info <provider>", "warning");
					return;
				}
				const provider = findProviders(query)[0];
				if (!provider) {
					ctx.ui.notify(`No provider matched "${query}". Run /providers list first.`, "warning");
					return;
				}
				ctx.ui.notify(await renderProviderInfo(provider, ctx), "info");
				return;
			}

			if (action === "models") {
				if (!query) {
					ctx.ui.notify("Usage: /providers models <provider>", "warning");
					return;
				}
				const provider = findProviders(query)[0];
				if (!provider) {
					ctx.ui.notify(`No provider matched "${query}". Run /providers list first.`, "warning");
					return;
				}
				ctx.ui.notify(await renderProviderModels(provider, ctx), "info");
				return;
			}

			ctx.ui.notify(renderStatus(ctx), "info");
		},
	});
}

async function refreshProviders(
	pi: ExtensionAPI,
	ctx: {
		modelRegistry: {
			authStorage: {
				get: (provider: string) => AuthCredential | undefined;
				set: (provider: string, credential: AuthCredential) => void;
			};
			refresh?: () => void;
		};
	},
	providers: readonly SupportedProviderDefinition[],
): Promise<
	Array<{
		provider: SupportedProviderDefinition;
		status: "refreshed" | "skipped" | "failed";
		models: number;
		error?: string;
	}>
> {
	const results: Array<{
		provider: SupportedProviderDefinition;
		status: "refreshed" | "skipped" | "failed";
		models: number;
		error?: string;
	}> = [];

	for (const provider of providers) {
		const credential = getStoredCredential(ctx, provider.id);
		if (credential) {
			try {
				const refreshed =
					credential.expires <= Date.now()
						? await refreshProviderCredential(provider, credential)
						: await refreshProviderCredentialModels(provider, credential);
				ctx.modelRegistry.authStorage.set(provider.id, { type: "oauth", ...refreshed });
				results.push({ provider, status: "refreshed", models: getCredentialModels(refreshed).length });
				continue;
			} catch (error) {
				results.push({
					provider,
					status: "failed",
					models: getCredentialModels(credential).length,
					error: error instanceof Error ? error.message : String(error),
				});
				continue;
			}
		}

		const apiKey = getEnvApiKey(provider);
		if (!apiKey) {
			results.push({ provider, status: "skipped", models: runtimeState.models.get(provider.id)?.length ?? 0 });
			continue;
		}

		try {
			const models = await resolveProviderModels(provider, apiKey, {
				previous: runtimeState.models.get(provider.id),
			});
			runtimeState.models.set(provider.id, models);
			runtimeState.lastRefresh.set(provider.id, Date.now());
			runtimeState.lastError.set(provider.id, null);
			registerProvider(pi, provider);
			results.push({ provider, status: "refreshed", models: models.length });
		} catch (error) {
			runtimeState.lastRefresh.set(provider.id, Date.now());
			runtimeState.lastError.set(provider.id, error instanceof Error ? error.message : String(error));
			registerProvider(pi, provider);
			results.push({
				provider,
				status: "failed",
				models: runtimeState.models.get(provider.id)?.length ?? 0,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return results;
}

function renderStatus(ctx: { modelRegistry: { authStorage: { get: (provider: string) => unknown } } }): string {
	const configured = SUPPORTED_PROVIDERS.filter(
		(provider) => hasStoredCredential(ctx, provider.id) || getEnvApiKey(provider),
	);
	const lines = [`Supported providers: ${SUPPORTED_PROVIDERS.length}`, `Configured providers: ${configured.length}`];

	if (configured.length === 0) {
		lines.push("No provider from this package is configured yet.");
		lines.push(
			"Tip: run /login <provider-id> or set one of the advertised env vars, then use /providers refresh-models.",
		);
		return lines.join("\n");
	}

	for (const provider of configured.slice(0, 20)) {
		const credential = getStoredCredential(ctx, provider.id);
		const models = credential ? getCredentialModels(credential) : (runtimeState.models.get(provider.id) ?? []);
		const source = credential ? "login" : "env";
		const error = credential ? null : runtimeState.lastError.get(provider.id);
		const refreshedAt = credential?.lastModelRefresh ?? runtimeState.lastRefresh.get(provider.id);
		lines.push(
			`- ${provider.id} — ${provider.name} (${source}, ${models.length} models${formatRefreshAge(refreshedAt)})${error ? ` — last error: ${error}` : ""}`,
		);
	}

	if (configured.length > 20) {
		lines.push(`…and ${configured.length - 20} more. Run /providers list to inspect everything.`);
	}

	return lines.join("\n");
}

function renderProviderList(query: string): string {
	const providers = query ? findProviders(query) : SUPPORTED_PROVIDERS;
	if (providers.length === 0) {
		return `No provider matched "${query}".`;
	}

	return providers
		.map((provider) => `- ${provider.id} — ${provider.name} · env: ${provider.env.join(" | ")} · api: ${provider.api}`)
		.join("\n");
}

async function renderProviderInfo(
	provider: SupportedProviderDefinition,
	ctx: { modelRegistry: { authStorage: { get: (provider: string) => unknown } } },
): Promise<string> {
	const credential = getStoredCredential(ctx, provider.id);
	const currentModels = credential ? getCredentialModels(credential) : (runtimeState.models.get(provider.id) ?? []);
	const catalogModels = currentModels.length > 0 ? currentModels : await getCatalogModels(provider).catch(() => []);
	const source = credential ? "login" : getEnvApiKey(provider) ? "env" : "not configured";
	const refreshedAt = credential?.lastModelRefresh ?? runtimeState.lastRefresh.get(provider.id);

	return [
		`${provider.id} — ${provider.name}`,
		`API: ${provider.api}`,
		`Base URL: ${provider.baseUrl}`,
		`Auth URL: ${provider.authUrl}`,
		`Environment: ${provider.env.join(" | ")}`,
		`Configured via: ${source}`,
		`Models available: ${catalogModels.length}`,
		`Last refresh: ${refreshedAt ? new Date(refreshedAt).toLocaleString() : "never"}`,
		`Last error: ${runtimeState.lastError.get(provider.id) ?? "none"}`,
	].join("\n");
}

async function renderProviderModels(
	provider: SupportedProviderDefinition,
	ctx: { modelRegistry: { authStorage: { get: (provider: string) => unknown } } },
): Promise<string> {
	const credential = getStoredCredential(ctx, provider.id);
	const currentModels = credential ? getCredentialModels(credential) : (runtimeState.models.get(provider.id) ?? []);
	const models = currentModels.length > 0 ? currentModels : await getCatalogModels(provider).catch(() => []);
	if (models.length === 0) {
		return `${provider.id} has no discovered models yet. Configure it, then run /providers refresh-models ${provider.id}.`;
	}

	return [
		`${provider.id} models:`,
		...models.slice(0, 80).map((model) => {
			const badges = [model.reasoning ? "reasoning" : undefined, model.input.includes("image") ? "vision" : undefined]
				.filter(Boolean)
				.join(" · ");
			return `  - ${model.id} — ${model.name}${badges ? ` [${badges}]` : ""} · ${model.contextWindow.toLocaleString()} ctx`;
		}),
		...(models.length > 80 ? [`  …and ${models.length - 80} more`] : []),
	].join("\n");
}

function renderRefreshSummary(
	results: ReadonlyArray<{
		provider: SupportedProviderDefinition;
		status: "refreshed" | "skipped" | "failed";
		models: number;
		error?: string;
	}>,
	total: number,
): string {
	const refreshed = results.filter((result) => result.status === "refreshed");
	const failed = results.filter((result) => result.status === "failed");
	const skipped = results.filter((result) => result.status === "skipped");
	const lines = [
		`Refresh complete for ${total} provider${total === 1 ? "" : "s"}.`,
		`Refreshed: ${refreshed.length}`,
		`Skipped: ${skipped.length}`,
		`Failed: ${failed.length}`,
	];

	for (const result of failed.slice(0, 8)) {
		lines.push(`- ${result.provider.id}: ${result.error ?? "unknown error"}`);
	}

	return lines.join("\n");
}

function hasStoredCredential(
	ctx: { modelRegistry: { authStorage: { get: (provider: string) => unknown } } },
	providerId: string,
): boolean {
	return getStoredCredential(ctx, providerId) !== null;
}

function getStoredCredential(
	ctx: { modelRegistry: { authStorage: { get: (provider: string) => unknown } } },
	providerId: string,
): ProviderCatalogCredentials | null {
	const credential = ctx.modelRegistry.authStorage.get(providerId);
	return credential && typeof credential === "object" && (credential as { type?: string }).type === "oauth"
		? (credential as ProviderCatalogCredentials)
		: null;
}

function findProviders(query: string): SupportedProviderDefinition[] {
	const normalized = query.trim().toLowerCase();
	if (!normalized) {
		return SUPPORTED_PROVIDERS;
	}

	const exact = SUPPORTED_PROVIDERS.find(
		(provider) => provider.id.toLowerCase() === normalized || provider.name.toLowerCase() === normalized,
	);
	if (exact) {
		return [exact];
	}

	return SUPPORTED_PROVIDERS.filter(
		(provider) => provider.id.toLowerCase().includes(normalized) || provider.name.toLowerCase().includes(normalized),
	);
}

function toProviderModels(models: readonly ProviderCatalogModel[]): ProviderCatalogModel[] {
	return models.map((model) => ({
		...model,
		input: [...model.input],
		cost: { ...model.cost },
		compat: model.compat ? { ...model.compat } : undefined,
	}));
}

function formatRefreshAge(timestamp: number | null | undefined): string {
	if (!timestamp) {
		return "";
	}

	const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
	if (seconds < 5) {
		return ", just refreshed";
	}
	if (seconds < 60) {
		return `, ${seconds}s ago`;
	}

	const minutes = Math.round(seconds / 60);
	if (minutes < 60) {
		return `, ${minutes}m ago`;
	}

	const hours = Math.round(minutes / 60);
	return `, ${hours}h ago`;
}

function bootstrapProviders(pi: ExtensionAPI): void {
	for (const provider of SUPPORTED_PROVIDERS) {
		registerProvider(pi, provider);
	}

	refreshProviders(
		pi,
		{
			modelRegistry: {
				authStorage: {
					get: () => undefined,
					set: () => undefined,
				},
			},
		},
		SUPPORTED_PROVIDERS.filter((provider) => Boolean(getEnvApiKey(provider))),
	);
}

export type { ProviderCatalogCredentials, ProviderCatalogModel } from "./catalog.js";
export { SUPPORTED_PROVIDERS } from "./config.js";
export {
	createApiKeyOAuthProvider,
	getCatalogModels,
	getCredentialModels,
	refreshProviderCredential,
	refreshProviderCredentialModels,
	resolveProviderModels,
};

export default function providerCatalogExtension(pi: ExtensionAPI): void {
	bootstrapProviders(pi);
	registerProvidersCommand(pi);
}
