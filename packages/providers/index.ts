/* C8 ignore file */
import * as sharedQna from "@ifi/pi-shared-qna";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ProviderConfig,
} from "@mariozechner/pi-coding-agent";
import {
	createApiKeyOAuthProvider,
	loginProvider,
	refreshProviderCredential,
	refreshProviderCredentialModels,
} from "./auth.js";
import { getCatalogModels, getCredentialModels, resolveProviderModels } from './catalog.js';
import type { ProviderCatalogCredentials, ProviderCatalogModel } from './catalog.js';
import { getEnvApiKey, resolveApiKeyConfig, SUPPORTED_PROVIDERS } from './config.js';
import type { SupportedProviderDefinition } from './config.js';

interface ScrollSelectOption<T> {
	value: T;
	label: string;
}

interface ProviderScrollableSelectConfig<T> {
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
}

type ProviderAuthReader = Pick<ExtensionContext["modelRegistry"]["authStorage"], "get">;
type ProviderAuthWriter = Pick<ExtensionContext["modelRegistry"]["authStorage"], "get" | "set">;

interface ProviderModelRegistry {
	authStorage: ProviderAuthWriter;
	refresh?: ExtensionContext["modelRegistry"]["refresh"];
	registerProvider: ExtensionContext["modelRegistry"]["registerProvider"];
}

interface ProviderRegistrar {
	registerProvider(name: string, config: ProviderConfig): void;
}

interface ProviderRegistryContext {
	modelRegistry: ProviderModelRegistry;
}

interface ProviderCommandContext {
	modelRegistry: ProviderModelRegistry;
	ui: Pick<ExtensionCommandContext["ui"], "custom" | "notify" | "select" | "input">;
}

interface ProviderStatusContext {
	modelRegistry: {
		authStorage: ProviderAuthReader;
	};
}

interface RuntimeProviderState {
	models: Map<string, ProviderCatalogModel[]>;
	lastRefresh: Map<string, number>;
	lastError: Map<string, string | null>;
	registered: Set<string>;
}

const runtimeState: RuntimeProviderState = {
	lastError: new Map(),
	lastRefresh: new Map(),
	models: new Map(),
	registered: new Set(),
};

function registerProvider(registrar: ProviderRegistrar, provider: SupportedProviderDefinition): void {
	registrar.registerProvider(provider.id, {
		api: provider.api,
		apiKey: resolveApiKeyConfig(provider),
		baseUrl: provider.baseUrl,
		models: toProviderModels(runtimeState.models.get(provider.id) ?? []),
		oauth: createApiKeyOAuthProvider(provider),
	});
	runtimeState.registered.add(provider.id);
}

function registerProvidersCommand(pi: ExtensionAPI): void {
	const providersCommand = {
		description:
			"Inspect, log in to, or refresh the OpenCode-backed multi-provider catalog: /providers, /providers:status, /providers:list [query], /providers:info <provider>, /providers:models <provider>, /providers:login [provider], /providers:refresh-models [provider|all]",
		// Biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This explicit command router keeps each provider subcommand readable.
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
				await loginProviderFromCommand(ctx.modelRegistry, ctx, provider);
				return;
			}

			if (action === "refresh-models") {
				const providers = query && query.toLowerCase() !== "all" ? findProviders(query) : SUPPORTED_PROVIDERS;
				if (providers.length === 0) {
					ctx.ui.notify(`No provider matched "${query}". Run /providers:list first.`, "warning");
					return;
				}
				const refreshed = await refreshProviders(ctx.modelRegistry, ctx, providers);
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

	const aliases: { name: string; subcommand: string; description: string }[] = [
		{ description: "Show multi-provider catalog status.", name: "providers:status", subcommand: "status" },
		{ description: "List supported providers and environment variables.", name: "providers:list", subcommand: "list" },
		{
			description: "Open the provider picker and log in with an API key.",
			name: "providers:login",
			subcommand: "login",
		},
		{
			description: "Inspect one provider's API mode, URLs, env vars, and model count.",
			name: "providers:info",
			subcommand: "info",
		},
		{
			description: "List the current or fallback model catalog for one provider.",
			name: "providers:models",
			subcommand: "models",
		},
		{
			description: "Refresh configured providers from live discovery when possible.",
			name: "providers:refresh-models",
			subcommand: "refresh-models",
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

// Biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Refresh handling branches clearly by stored credential vs env configuration paths.
async function refreshProviders(
	registrar: ProviderRegistrar,
	ctx: ProviderRegistryContext,
	providers: readonly SupportedProviderDefinition[],
): Promise<
	{
		provider: SupportedProviderDefinition;
		status: "refreshed" | "skipped" | "failed";
		models: number;
		error?: string;
	}[]
> {
	const results: {
		provider: SupportedProviderDefinition;
		status: "refreshed" | "skipped" | "failed";
		models: number;
		error?: string;
	}[] = [];

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
				registerProvider(registrar, provider);
				results.push({ models: getCredentialModels(refreshed).length, provider, status: "refreshed" });
				continue;
			} catch (error) {
				results.push({
					error: error instanceof Error ? error.message : String(error),
					models: getCredentialModels(credential).length,
					provider,
					status: "failed",
				});
				continue;
			}
		}

		const apiKey = getEnvApiKey(provider);
		if (!apiKey) {
			results.push({ models: runtimeState.models.get(provider.id)?.length ?? 0, provider, status: "skipped" });
			continue;
		}

		try {
			const models = await resolveProviderModels(provider, apiKey, {
				previous: runtimeState.models.get(provider.id),
			});
			runtimeState.models.set(provider.id, models);
			runtimeState.lastRefresh.set(provider.id, Date.now());
			runtimeState.lastError.set(provider.id, null);
			registerProvider(registrar, provider);
			results.push({ models: models.length, provider, status: "refreshed" });
		} catch (error) {
			runtimeState.lastRefresh.set(provider.id, Date.now());
			runtimeState.lastError.set(provider.id, error instanceof Error ? error.message : String(error));
			registerProvider(registrar, provider);
			results.push({
				error: error instanceof Error ? error.message : String(error),
				models: runtimeState.models.get(provider.id)?.length ?? 0,
				provider,
				status: "failed",
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
	const source = credential ? "login" : (getEnvApiKey(provider) ? "env" : "not configured");
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
	results: readonly {
		provider: SupportedProviderDefinition;
		status: "refreshed" | "skipped" | "failed";
		models: number;
		error?: string;
	}[],
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
		footerHint: typeof ctx.ui.input === "function" ? "type / to search" : undefined,
		maxVisibleOptions: 12,
		options,
		overlayMaxHeight: "75%",
		overlayWidth: "80%",
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
		title: `Select provider to log in (${providers.length} total)`,
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
			dispose() {
				// No-op fallback cleanup.
			},
			handleInput() {
				// Fallback picker relies on the surrounding ui.custom implementation.
			},
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
		}),
		{
			overlay: true,
			overlayOptions: {
				anchor: "center",
				maxHeight: (config.overlayMaxHeight ?? "75%") as never,
				width: (config.overlayWidth ?? "80%") as never,
			},
		},
	);
}

function buildProviderPickerOptions(
	providers: readonly SupportedProviderDefinition[],
	ctx: ProviderStatusContext,
): ScrollSelectOption<SupportedProviderDefinition>[] {
	return providers.map((provider) => ({
		label: formatProviderPickerOption(provider, ctx),
		value: provider,
	}));
}

function formatProviderPickerOption(provider: SupportedProviderDefinition, ctx: ProviderStatusContext): string {
	const state = hasStoredCredential(ctx, provider.id) ? "✓ logged in" : (getEnvApiKey(provider) ? "env key" : "login");
	return `${provider.name} — ${provider.id} · ${state}`;
}

async function loginProviderFromCommand(
	registrar: ProviderRegistrar,
	ctx: ProviderCommandContext,
	provider: SupportedProviderDefinition,
): Promise<void> {
	try {
		registerProvider(registrar, provider);
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
		registerProvider(registrar, provider);
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
	const {input} = ctx.ui;
	if (typeof input !== "function") {
		throw new TypeError("Interactive input is unavailable for provider login.");
	}
	return input(title, placeholder).then((value) => value ?? "");
}

function toProviderModels(models: readonly ProviderCatalogModel[]): ProviderCatalogModel[] {
	return models.map((model) => ({
		...model,
		compat: model.compat ? { ...model.compat } : undefined,
		cost: { ...model.cost },
		input: [...model.input],
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
					get: () => {},
					set: () => {},
				},
				registerProvider: pi.registerProvider.bind(pi),
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
			registerProvider(ctx.modelRegistry, provider);
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
