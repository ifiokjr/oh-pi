/* c8 ignore file */
import * as sharedQna from "@ifi/pi-shared-qna";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
	createApiKeyOAuthProvider,
	loginProvider,
	refreshProviderCredential,
	refreshProviderCredentialModels,
} from "./auth.js";
import {
	getCatalogModels,
	getCredentialModels,
	type ProviderCatalogCredentials,
	type ProviderCatalogModel,
	resolveProviderModels,
} from "./catalog.js";
import { getEnvApiKey, resolveApiKeyConfig, SUPPORTED_PROVIDERS, type SupportedProviderDefinition } from "./config.js";

type ScrollSelectOption<T> = {
	value: T;
	label: string;
};

type ProviderScrollableSelectConfig<T> = {
	title: string;
	options: ScrollSelectOption<T>[];
	footerHint?: string;
	search?: {
		title: string;
		placeholder: string;
		getOptions(query: string): ScrollSelectOption<T>[];
		emptyMessage(query: string): string;
	};
	maxVisibleOptions?: number;
	overlayWidth?: string;
	overlayMaxHeight?: string;
};

type ProviderAuthReader = Pick<ExtensionContext["modelRegistry"]["authStorage"], "get">;
type ProviderAuthWriter = Pick<ExtensionContext["modelRegistry"]["authStorage"], "get" | "set">;

type ProviderModelRegistry = {
	authStorage: ProviderAuthWriter;
	refresh?: ExtensionContext["modelRegistry"]["refresh"];
};

type ProviderRegistryContext = {
	modelRegistry: ProviderModelRegistry;
};

type ProviderCommandContext = {
	modelRegistry: ProviderModelRegistry;
	ui: Pick<ExtensionCommandContext["ui"], "custom" | "notify" | "select" | "input">;
};

type ProviderStatusContext = {
	modelRegistry: {
		authStorage: ProviderAuthReader;
	};
};

type RuntimeProviderState = {
	models: Map<string, ProviderCatalogModel[]>;
	lastRefresh: Map<string, number>;
	lastError: Map<string, string | null>;
	registered: Set<string>;
};

const runtimeState: RuntimeProviderState = {
	models: new Map(),
	lastRefresh: new Map(),
	lastError: new Map(),
	registered: new Set(),
};

function registerProvider(pi: ExtensionAPI, provider: SupportedProviderDefinition): void {
	pi.registerProvider(provider.id, {
		api: provider.api,
		apiKey: resolveApiKeyConfig(provider),
		baseUrl: provider.baseUrl,
		oauth: createApiKeyOAuthProvider(provider),
		models: toProviderModels(runtimeState.models.get(provider.id) ?? []),
	});
	runtimeState.registered.add(provider.id);
}

function registerProvidersCommand(pi: ExtensionAPI): void {
	const providersCommand = {
		description:
			"Inspect, log in to, or refresh the OpenCode-backed multi-provider catalog: /providers, /providers:status, /providers:list [query], /providers:info <provider>, /providers:models <provider>, /providers:login [provider], /providers:refresh-models [provider|all]",
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This explicit command router keeps each provider subcommand readable.
		async handler(args: string, ctx: ExtensionCommandContext) {
			const trimmed = args.trim();
			const [rawAction = "status", ...rest] = trimmed ? trimmed.split(/\s+/) : ["status"];
			const action = rawAction.toLowerCase();
			const query = rest.join(" ").trim();

			if (action === "login") {
				const provider = await resolveProviderSelection(query, ctx);
				if (!provider) {
					return;
				}
				await loginProviderFromCommand(pi, ctx, provider);
				return;
			}

			if (action === "refresh-models") {
				const providers = query && query.toLowerCase() !== "all" ? findProviders(query) : SUPPORTED_PROVIDERS;
				if (providers.length === 0) {
					ctx.ui.notify(`No provider matched "${query}". Run /providers:list first.`, "warning");
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
					ctx.ui.notify("Usage: /providers:info <provider>", "warning");
					return;
				}
				const provider = findProviders(query)[0];
				if (!provider) {
					ctx.ui.notify(`No provider matched "${query}". Run /providers:list first.`, "warning");
					return;
				}
				ctx.ui.notify(await renderProviderInfo(provider, ctx), "info");
				return;
			}

			if (action === "models") {
				if (!query) {
					ctx.ui.notify("Usage: /providers:models <provider>", "warning");
					return;
				}
				const provider = findProviders(query)[0];
				if (!provider) {
					ctx.ui.notify(`No provider matched "${query}". Run /providers:list first.`, "warning");
					return;
				}
				ctx.ui.notify(await renderProviderModels(provider, ctx), "info");
				return;
			}

			ctx.ui.notify(renderStatus(ctx), "info");
		},
	};

	pi.registerCommand("providers", providersCommand);

	const aliases: Array<{ name: string; subcommand: string; description: string }> = [
		{ name: "providers:status", subcommand: "status", description: "Show multi-provider catalog status." },
		{ name: "providers:list", subcommand: "list", description: "List supported providers and environment variables." },
		{
			name: "providers:login",
			subcommand: "login",
			description: "Open the provider picker and log in with an API key.",
		},
		{
			name: "providers:info",
			subcommand: "info",
			description: "Inspect one provider's API mode, URLs, env vars, and model count.",
		},
		{
			name: "providers:models",
			subcommand: "models",
			description: "List the current or fallback model catalog for one provider.",
		},
		{
			name: "providers:refresh-models",
			subcommand: "refresh-models",
			description: "Refresh configured providers from live discovery when possible.",
		},
	];

	for (const alias of aliases) {
		pi.registerCommand(alias.name, {
			description: alias.description,
			handler: (args: string, ctx: ExtensionCommandContext) =>
				providersCommand.handler(args ? `${alias.subcommand} ${args}` : alias.subcommand, ctx),
		});
	}
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Refresh handling branches clearly by stored credential vs env configuration paths.
async function refreshProviders(
	pi: ExtensionAPI,
	ctx: ProviderRegistryContext,
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
				const isExpired = typeof credential.expires === "number" && credential.expires <= Date.now();
				const refreshed = isExpired
					? await refreshProviderCredential(provider, credential)
					: await refreshProviderCredentialModels(provider, credential);
				ctx.modelRegistry.authStorage.set(provider.id, { type: "oauth", ...refreshed });
				runtimeState.models.set(provider.id, getCredentialModels(refreshed));
				runtimeState.lastRefresh.set(provider.id, refreshed.lastModelRefresh ?? Date.now());
				runtimeState.lastError.set(provider.id, null);
				registerProvider(pi, provider);
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

function renderStatus(ctx: ProviderStatusContext): string {
	const configured = SUPPORTED_PROVIDERS.filter(
		(provider) => hasStoredCredential(ctx, provider.id) || getEnvApiKey(provider),
	);
	const lines = [`Supported providers: ${SUPPORTED_PROVIDERS.length}`, `Configured providers: ${configured.length}`];

	if (configured.length === 0) {
		lines.push("No provider from this package is configured yet.");
		lines.push("Tip: run /providers:login to open the paged provider picker, then use /providers:refresh-models.");
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
		lines.push(`…and ${configured.length - 20} more. Run /providers:list to inspect everything.`);
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

async function renderProviderInfo(provider: SupportedProviderDefinition, ctx: ProviderStatusContext): Promise<string> {
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
	ctx: ProviderStatusContext,
): Promise<string> {
	const credential = getStoredCredential(ctx, provider.id);
	const currentModels = credential ? getCredentialModels(credential) : (runtimeState.models.get(provider.id) ?? []);
	const models = currentModels.length > 0 ? currentModels : await getCatalogModels(provider).catch(() => []);
	if (models.length === 0) {
		return `${provider.id} has no discovered models yet. Configure it, then run /providers:refresh-models ${provider.id}.`;
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

function hasStoredCredential(ctx: ProviderStatusContext, providerId: string): boolean {
	return getStoredCredential(ctx, providerId) !== null;
}

function getStoredCredential(ctx: ProviderStatusContext, providerId: string): ProviderCatalogCredentials | null {
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

async function resolveProviderSelection(
	query: string,
	ctx: ProviderCommandContext,
): Promise<SupportedProviderDefinition | null> {
	const matchedProviders = query ? findProviders(query) : SUPPORTED_PROVIDERS;
	if (matchedProviders.length === 0) {
		ctx.ui.notify(`No provider matched "${query}". Run /providers:list first.`, "warning");
		return null;
	}

	if (matchedProviders.length === 1) {
		return matchedProviders[0] ?? null;
	}

	return await selectProviderFromOverlay(ctx, matchedProviders);
}

async function selectProviderFromOverlay(
	ctx: ProviderCommandContext,
	providers: readonly SupportedProviderDefinition[],
): Promise<SupportedProviderDefinition | null> {
	const options = buildProviderPickerOptions(providers, ctx);
	return await openProviderScrollableSelect(ctx.ui, {
		title: `Select provider to log in (${providers.length} total)`,
		options,
		footerHint: typeof ctx.ui.input === "function" ? "type / to search" : undefined,
		search:
			typeof ctx.ui.input === "function"
				? {
						title: "Provider search",
						placeholder: "Type a provider id or name",
						getOptions(query: string) {
							if (!query) {
								return options;
							}

							return buildProviderPickerOptions(findProviders(query), ctx);
						},
						emptyMessage(query: string) {
							return `No provider matched "${query}".`;
						},
					}
				: undefined,
		maxVisibleOptions: 12,
		overlayWidth: "80%",
		overlayMaxHeight: "75%",
	});
}

async function openProviderScrollableSelect<T>(
	ui: Pick<ExtensionCommandContext["ui"], "custom" | "input">,
	config: ProviderScrollableSelectConfig<T>,
): Promise<T | null> {
	const sharedOpenScrollableSelect = (sharedQna as { openScrollableSelect?: unknown }).openScrollableSelect;
	if (typeof sharedOpenScrollableSelect === "function") {
		return await (
			sharedOpenScrollableSelect as (
				ui: Pick<ExtensionCommandContext["ui"], "custom" | "input">,
				config: ProviderScrollableSelectConfig<T>,
			) => Promise<T | null>
		)(ui, config);
	}
	if (typeof ui.custom !== "function") {
		return config.options[0]?.value ?? null;
	}
	return await ui.custom(
		(_tui, _theme, _keybindings, _done) => ({
			invalidate() {
				// No-op fallback invalidation.
			},
			render(width: number) {
				return [
					config.title,
					...(config.footerHint ? [config.footerHint] : []),
					...config.options.slice(0, config.maxVisibleOptions ?? 12).map((option) => `- ${option.label}`),
				].map((line) => line.slice(0, width));
			},
			handleInput() {
				// Fallback picker relies on the surrounding ui.custom implementation.
			},
			dispose() {
				// No-op fallback cleanup.
			},
		}),
		{
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: (config.overlayWidth ?? "80%") as never,
				maxHeight: (config.overlayMaxHeight ?? "75%") as never,
			},
		},
	);
}

function buildProviderPickerOptions(
	providers: readonly SupportedProviderDefinition[],
	ctx: ProviderStatusContext,
): ScrollSelectOption<SupportedProviderDefinition>[] {
	return providers.map((provider) => ({
		value: provider,
		label: formatProviderPickerOption(provider, ctx),
	}));
}

function formatProviderPickerOption(provider: SupportedProviderDefinition, ctx: ProviderStatusContext): string {
	const state = hasStoredCredential(ctx, provider.id) ? "✓ logged in" : getEnvApiKey(provider) ? "env key" : "login";
	return `${provider.name} — ${provider.id} · ${state}`;
}

async function loginProviderFromCommand(
	pi: ExtensionAPI,
	ctx: ProviderCommandContext,
	provider: SupportedProviderDefinition,
): Promise<void> {
	try {
		registerProvider(pi, provider);
		const credential = await loginProvider(provider, {
			onAuth(params) {
				ctx.ui.notify(`${params.instructions}\n${params.url}`, "info");
			},
			onProgress(message) {
				if (message) {
					ctx.ui.notify(message, "info");
				}
			},
			async onPrompt(params) {
				return await promptProviderInput(ctx, `Log in to ${provider.name}`, `${params.message}\n${provider.authUrl}`);
			},
		});
		ctx.modelRegistry.authStorage.set(provider.id, { type: "oauth", ...credential });
		runtimeState.models.set(provider.id, getCredentialModels(credential));
		runtimeState.lastRefresh.set(provider.id, credential.lastModelRefresh ?? Date.now());
		runtimeState.lastError.set(provider.id, null);
		registerProvider(pi, provider);
		ctx.modelRegistry.refresh?.();
		ctx.ui.notify(
			`Logged in to ${provider.name}. ${getCredentialModels(credential).length} model${getCredentialModels(credential).length === 1 ? "" : "s"} available.`,
			"info",
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		runtimeState.lastError.set(provider.id, message);
		ctx.ui.notify(`Failed to log in to ${provider.name}: ${message}`, "error");
	}
}

function promptProviderInput(ctx: ProviderCommandContext, title: string, placeholder?: string): Promise<string> {
	const input = ctx.ui.input;
	if (typeof input !== "function") {
		throw new Error("Interactive input is unavailable for provider login.");
	}
	return input(title, placeholder).then((value) => value ?? "");
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
	for (const provider of SUPPORTED_PROVIDERS.filter((candidate) => Boolean(getEnvApiKey(candidate)))) {
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

function registerPersistedProviders(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx: ProviderRegistryContext) => {
		let changed = false;
		for (const provider of SUPPORTED_PROVIDERS) {
			if (!(hasStoredCredential(ctx, provider.id) || getEnvApiKey(provider))) {
				continue;
			}
			const wasRegistered = runtimeState.registered.has(provider.id);
			registerProvider(pi, provider);
			changed ||= !wasRegistered;
		}
		if (changed) {
			ctx.modelRegistry.refresh?.();
		}
	});
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

export function resetProviderCatalogRuntimeStateForTests(): void {
	runtimeState.models.clear();
	runtimeState.lastRefresh.clear();
	runtimeState.lastError.clear();
	runtimeState.registered.clear();
}

export default function providerCatalogExtension(pi: ExtensionAPI): void {
	bootstrapProviders(pi);
	registerPersistedProviders(pi);
	registerProvidersCommand(pi);
}
