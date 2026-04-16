import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	type AssistantMessageEventStream,
	type Context,
	type Model,
	type SimpleStreamOptions,
	streamSimpleOpenAICompletions,
} from "@mariozechner/pi-ai";
import {
	createOllamaCloudOAuthProvider,
	loginOllamaCloud,
	refreshOllamaCloudCredential,
	refreshOllamaCloudCredentialModels,
} from "./auth.js";
import {
	OLLAMA_API,
	OLLAMA_CLOUD_API_KEY_ENV,
	OLLAMA_CLOUD_PROVIDER,
	OLLAMA_LOCAL_API_KEY_LITERAL,
	OLLAMA_LOCAL_PROVIDER,
	getOllamaCloudRuntimeConfig,
	getOllamaLocalRuntimeConfig,
} from "./config.js";
import { clearOllamaCliStatusCache, getOllamaCliStatus, pullOllamaModel, type OllamaCliStatus } from "./local.js";
import {
	discoverOllamaCloudModels,
	discoverOllamaLocalModels,
	getCredentialModels,
	getFallbackOllamaCloudModels,
	mergeOllamaLocalCatalog,
	toDownloadableOllamaLocalModel,
	toProviderModels,
	type OllamaCloudCredentials,
	type OllamaProviderModel,
} from "./models.js";

type RuntimeDiscoveryState = {
	models: OllamaProviderModel[];
	lastRefresh: number | null;
	lastError: string | null;
};

type ModelRegistryAuthStorage = {
	get: (provider: string) => unknown;
	set: (provider: string, credential: any) => void;
};

type ModelRegistryLike = {
	authStorage: ModelRegistryAuthStorage;
	refresh?: () => void;
};

type UiLike = {
	notify: (msg: string, type?: "error" | "info" | "warning") => void;
	setStatus: (key: string, value: string | undefined) => void;
	confirm?: (title: string, message: string) => Promise<boolean>;
};

type CommandContextLike = {
	hasUI?: boolean;
	ui: UiLike;
	modelRegistry: ModelRegistryLike;
};

type CollectedOllamaModel = OllamaProviderModel & {
	provider: string;
	baseUrl: string;
};

const localDiscoveryState: RuntimeDiscoveryState = {
	models: [],
	lastRefresh: null,
	lastError: null,
};

const cloudEnvDiscoveryState: RuntimeDiscoveryState = {
	models: getFallbackOllamaCloudModels(),
	lastRefresh: null,
	lastError: null,
};

const activeLocalPulls = new Map<string, Promise<boolean>>();
const PULL_STATUS_KEY = "ollama.pull";
const OLLAMA_STARTUP_CLI_REFRESH_DELAY_MS = 250;

let ollamaCliStatus: OllamaCliStatus | null = null;
let missingCliWarningShown = false;

function registerOllamaLocalProvider(pi: ExtensionAPI): void {
	pi.registerProvider(OLLAMA_LOCAL_PROVIDER, {
		api: OLLAMA_API,
		apiKey: OLLAMA_LOCAL_API_KEY_LITERAL,
		baseUrl: getOllamaLocalRuntimeConfig().apiUrl,
		models: toProviderModels(getRegisteredLocalModels()),
		streamSimple: streamSimpleOllama,
	});
}

function registerOllamaCloudProvider(pi: ExtensionAPI): void {
	pi.registerProvider(OLLAMA_CLOUD_PROVIDER, {
		api: OLLAMA_API,
		apiKey: OLLAMA_CLOUD_API_KEY_ENV,
		baseUrl: getOllamaCloudRuntimeConfig().apiUrl,
		oauth: createOllamaCloudOAuthProvider(),
		models: toProviderModels(cloudEnvDiscoveryState.models),
		streamSimple: streamSimpleOllama,
	});
}

async function refreshRegisteredLocalModels(pi: ExtensionAPI, options: { forceCli?: boolean } = {}): Promise<OllamaProviderModel[]> {
	ollamaCliStatus = await getOllamaCliStatus({ force: options.forceCli });
	if (!ollamaCliStatus.available) {
		localDiscoveryState.models = [];
		localDiscoveryState.lastError = null;
		localDiscoveryState.lastRefresh = Date.now();
		registerOllamaLocalProvider(pi);
		return [];
	}

	try {
		localDiscoveryState.models = (await discoverOllamaLocalModels()) ?? [];
		localDiscoveryState.lastError = null;
	} catch (error) {
		localDiscoveryState.models = [];
		localDiscoveryState.lastError = error instanceof Error ? error.message : String(error);
	}

	localDiscoveryState.lastRefresh = Date.now();
	registerOllamaLocalProvider(pi);
	return localDiscoveryState.models;
}

async function refreshRegisteredCloudEnvModels(pi: ExtensionAPI): Promise<OllamaProviderModel[]> {
	const apiKey = process.env[OLLAMA_CLOUD_API_KEY_ENV]?.trim();

	try {
		cloudEnvDiscoveryState.models = (await discoverOllamaCloudModels(apiKey)) ?? getFallbackOllamaCloudModels();
		cloudEnvDiscoveryState.lastError = null;
	} catch (error) {
		cloudEnvDiscoveryState.models = getFallbackOllamaCloudModels();
		cloudEnvDiscoveryState.lastError = error instanceof Error ? error.message : String(error);
	}

	cloudEnvDiscoveryState.lastRefresh = Date.now();
	registerOllamaCloudProvider(pi);
	registerOllamaLocalProvider(pi);
	return cloudEnvDiscoveryState.models;
}

function registerOllamaCommands(pi: ExtensionAPI): void {
	pi.registerCommand("ollama", {
		description: "Inspect or refresh local + cloud Ollama providers: /ollama [status|refresh-models|models|info <model>|pull <model>]",
		async handler(args, ctx) {
			const trimmed = args.trim();
			const [rawAction = "status", ...rest] = trimmed ? trimmed.split(/\s+/) : ["status"];
			const action = rawAction.toLowerCase();
			const credential = getStoredCloudCredential(ctx);

			if (action === "refresh-models") {
				clearOllamaCliStatusCache();
				const localModels = await refreshRegisteredLocalModels(pi, { forceCli: true });
				const cloudModels = await refreshCloudModels(pi, ctx, credential);
				ctx.modelRegistry.refresh?.();
				const cloudStatus = hasCloudAuth(credential)
					? `${cloudModels.length} cloud available`
					: `${cloudModels.length} public cloud discovered; run /login ollama-cloud to use them`;
				ctx.ui.notify(`Refreshed Ollama models (${localModels.length} local installed, ${cloudStatus}).`, "info");
				return;
			}

			if (action === "models") {
				ctx.ui.notify(renderModelList(collectOllamaModels(credential)), "info");
				return;
			}

			if (action === "pull" || action === "download") {
				const query = rest.join(" ").trim();
				if (!query) {
					ctx.ui.notify("Usage: /ollama pull <model>", "warning");
					return;
				}

				const localModel = findLocalModelForQuery(query, credential);
				if (!localModel) {
					ctx.ui.notify(`No Ollama model matched \"${query}\". Run /ollama refresh-models first.`, "warning");
					return;
				}

				if (localModel.localAvailability === "installed") {
					ctx.ui.notify(`ollama/${localModel.id} is already installed locally.`, "info");
					return;
				}

				await pullLocalModel(pi, ctx, localModel.id);
				return;
			}

			if (action === "info") {
				const query = rest.join(" ").trim();
				if (!query) {
					ctx.ui.notify("Usage: /ollama info <model>", "warning");
					return;
				}
				const model = findModelForQuery(query, collectOllamaModels(credential));
				if (!model) {
					ctx.ui.notify(`No Ollama model matched \"${query}\". Run /ollama refresh-models first.`, "warning");
					return;
				}
				ctx.ui.notify(renderModelInfo(model), "info");
				return;
			}

			ctx.ui.notify(renderUnifiedStatus(credential), "info");
		},
	});

	pi.registerCommand("ollama-cloud", {
		description: "Backward-compatible alias for cloud-only Ollama status and refresh: /ollama-cloud [status|refresh-models]",
		async handler(args, ctx) {
			const action = args.trim().toLowerCase() || "status";
			const credential = getStoredCloudCredential(ctx);

			if (action === "refresh-models") {
				const cloudModels = await refreshCloudModels(pi, ctx, credential);
				ctx.modelRegistry.refresh?.();
				const suffix = hasCloudAuth(credential)
					? `${cloudModels.length} available`
					: `${cloudModels.length} public models discovered; run /login ollama-cloud to use them`;
				ctx.ui.notify(`Refreshed Ollama Cloud models (${suffix}).`, "info");
				return;
			}

			ctx.ui.notify(renderCloudStatus(credential), "info");
		},
	});
}

function registerOllamaLifecycle(pi: ExtensionAPI): { scheduleLocalBootstrapRefresh: (ctx?: CommandContextLike) => void } {
	let startupCliRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingLocalBootstrapRefresh: Promise<void> | null = null;
	let pendingStartupContext: CommandContextLike | null = null;

	const notifyMissingCli = (ctx: CommandContextLike | null) => {
		if (!ctx?.hasUI || missingCliWarningShown || ollamaCliStatus?.available !== false) {
			return;
		}

		missingCliWarningShown = true;
		ctx.ui.notify(
			"Ollama CLI not found. Only ollama-cloud models are available right now because Ollama is not installed.",
			"warning",
		);
	};

	const scheduleLocalBootstrapRefresh = (ctx?: CommandContextLike) => {
		if (ctx) {
			pendingStartupContext = ctx;
		}
		if (pendingLocalBootstrapRefresh || startupCliRefreshTimer) {
			return;
		}

		startupCliRefreshTimer = setTimeout(() => {
			startupCliRefreshTimer = null;
			pendingLocalBootstrapRefresh = refreshRegisteredLocalModels(pi)
				.then(() => {
					pendingStartupContext?.modelRegistry.refresh?.();
					notifyMissingCli(pendingStartupContext);
				})
				.finally(() => {
					pendingLocalBootstrapRefresh = null;
					pendingStartupContext = null;
				});
		}, OLLAMA_STARTUP_CLI_REFRESH_DELAY_MS);
	};

	pi.on("session_start", async (_event, ctx) => {
		scheduleLocalBootstrapRefresh(ctx);
		notifyMissingCli(ctx);

		try {
			const credential = getStoredCloudCredentialFromContext(ctx);
			await refreshCloudModels(pi, ctx, credential);
			ctx.modelRegistry.refresh?.();
		} catch {
			// Auth storage can be unavailable during early startup depending on initialization order.
			// Keep boot resilient and rely on manual /ollama refresh-models as fallback.
		}
	});

	pi.on("session_shutdown", () => {
		if (startupCliRefreshTimer) {
			clearTimeout(startupCliRefreshTimer);
			startupCliRefreshTimer = null;
		}
		pendingStartupContext = null;
	});

	pi.on("model_select", async (event, ctx) => {
		if (event.model.provider !== OLLAMA_LOCAL_PROVIDER) {
			return;
		}

		const localModel = getRegisteredLocalModels().find((model) => model.id === event.model.id);
		if (!localModel || localModel.localAvailability !== "downloadable") {
			return;
		}

		ollamaCliStatus = await getOllamaCliStatus();
		if (!ollamaCliStatus.available) {
			ctx.ui.notify(
				"Ollama CLI not found. Only ollama-cloud models are available right now because Ollama is not installed.",
				"warning",
			);
			return;
		}

		if (event.source === "restore" || !ctx.hasUI || typeof ctx.ui.confirm !== "function") {
			ctx.ui.notify(
				`ollama/${event.model.id} is not installed locally yet. Run /ollama pull ${event.model.id} to download it.`,
				"warning",
			);
			return;
		}

		const shouldDownload = await ctx.ui.confirm(
			"Download local Ollama model?",
			[
				"Would you like to download this model?",
				"",
				`ollama/${event.model.id}`,
				"",
				`pi will use the Ollama CLI against ${getOllamaLocalRuntimeConfig().origin}.`,
				`Ollama Cloud is usually faster for the same model: ollama-cloud/${event.model.id}`,
			].join("\n"),
		);
		if (!shouldDownload) {
			ctx.ui.notify(`Skipped local download for ollama/${event.model.id}.`, "info");
			return;
		}

		await pullLocalModel(pi, ctx, event.model.id);
	});

	return { scheduleLocalBootstrapRefresh };
}

async function refreshCloudModels(pi: ExtensionAPI, ctx: CommandContextLike, credential: OllamaCloudCredentials | null): Promise<OllamaProviderModel[]> {
	if (credential) {
		const refreshed = credential.expires <= Date.now()
			? await refreshOllamaCloudCredential(credential)
			: await refreshOllamaCloudCredentialModels(credential);
		setCloudCredentialInContext(ctx, refreshed);
		cloudEnvDiscoveryState.models = getCredentialModels(refreshed);
		cloudEnvDiscoveryState.lastRefresh = Date.now();
		cloudEnvDiscoveryState.lastError = null;
		registerOllamaCloudProvider(pi);
		registerOllamaLocalProvider(pi);
		return cloudEnvDiscoveryState.models;
	}
	return refreshRegisteredCloudEnvModels(pi);
}

async function pullLocalModel(pi: ExtensionAPI, ctx: CommandContextLike, modelId: string): Promise<boolean> {
	const existing = activeLocalPulls.get(modelId);
	if (existing) {
		return existing;
	}

	const run = (async () => {
		clearOllamaCliStatusCache();
		ollamaCliStatus = await getOllamaCliStatus({ force: true });
		if (!ollamaCliStatus.available) {
			registerOllamaLocalProvider(pi);
			ctx.ui.notify(
				"Ollama CLI not found. Only ollama-cloud models are available right now because Ollama is not installed.",
				"warning",
			);
			return false;
		}

		ctx.ui.notify(`Downloading ollama/${modelId} via the Ollama CLI...`, "info");
		ctx.ui.setStatus(PULL_STATUS_KEY, `Pulling ${modelId}...`);

		try {
			await pullOllamaModel(modelId, {
				env: createOllamaProcessEnv(),
				onOutput: (line) => {
					ctx.ui.setStatus(PULL_STATUS_KEY, `Pulling ${modelId} — ${line}`);
				},
			});

			await refreshRegisteredLocalModels(pi);
			ctx.modelRegistry.refresh?.();
			if (!isLocalModelInstalled(modelId)) {
				throw new Error(`Downloaded ${modelId}, but pi could not rediscover it from the local Ollama instance.`);
			}

			ctx.ui.notify(`Downloaded ollama/${modelId}.`, "info");
			return true;
		} catch (error) {
			ctx.ui.notify(`Failed to download ollama/${modelId}: ${error instanceof Error ? error.message : String(error)}`, "error");
			return false;
		} finally {
			ctx.ui.setStatus(PULL_STATUS_KEY, undefined);
			activeLocalPulls.delete(modelId);
		}
	})();

	activeLocalPulls.set(modelId, run);
	return run;
}

function streamSimpleOllama(model: Model<any>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
	if (model.provider === OLLAMA_LOCAL_PROVIDER) {
		return streamSimpleOllamaLocal(model, context, options);
	}

	if (model.provider === OLLAMA_CLOUD_PROVIDER) {
		return streamSimpleOllamaCloud(model, context, options);
	}

	return streamSimpleOpenAICompletions(model as Model<"openai-completions">, context, options);
}

function streamSimpleOllamaCloud(model: Model<any>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
	return streamSimpleOpenAICompletions(model as Model<"openai-completions">, context, options);
}

function streamSimpleOllamaLocal(model: Model<any>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
	if (!isLocalModelInstalled(model.id)) {
		if (!ollamaCliStatus?.available) {
			throw new Error("Ollama CLI is not installed. Only ollama-cloud models are available right now.");
		}
		throw new Error(
			`ollama/${model.id} is not installed locally yet. Select it again to download it, or run /ollama pull ${model.id}.`,
		);
	}

	return streamSimpleOpenAICompletions(model as Model<"openai-completions">, context, options);
}

function renderUnifiedStatus(credential: OllamaCloudCredentials | null): string {
	const localConfig = getOllamaLocalRuntimeConfig();
	const cloudConfig = getOllamaCloudRuntimeConfig();
	const localModels = getRegisteredLocalModels();
	const downloadableLocalModels = localModels.filter((model) => model.localAvailability === "downloadable");
	const cloudModels = credential ? getCredentialModels(credential) : cloudEnvDiscoveryState.models;
	return [
		`Ollama CLI: ${describeLocalCliStatus()}`,
		`Ollama local: ${describeLocalRuntime()}`,
		`Local installed: ${localDiscoveryState.models.length}${formatRefreshAge(localDiscoveryState.lastRefresh)}`,
		`Local download candidates: ${downloadableLocalModels.length}`,
		`Local base URL: ${localConfig.apiUrl}`,
		`Ollama cloud auth: ${describeCloudAuth(credential)}`,
		`Cloud models: ${cloudModels.length}${formatRefreshAge(credential?.lastModelRefresh ?? cloudEnvDiscoveryState.lastRefresh)}`,
		`Cloud base URL: ${cloudConfig.apiUrl}`,
		`Tip: prefer ollama-cloud/... for speed, and use /ollama pull <model> only when you need a local copy.`,
	].join("\n");
}

function renderCloudStatus(credential: OllamaCloudCredentials | null): string {
	const config = getOllamaCloudRuntimeConfig();
	const cloudModels = credential ? getCredentialModels(credential) : cloudEnvDiscoveryState.models;
	return [
		`Ollama cloud auth: ${describeCloudAuth(credential)}`,
		`Cloud models: ${cloudModels.length}${formatRefreshAge(credential?.lastModelRefresh ?? cloudEnvDiscoveryState.lastRefresh)}`,
		`Cloud base URL: ${config.apiUrl}`,
	].join("\n");
}

function collectOllamaModels(credential: OllamaCloudCredentials | null): CollectedOllamaModel[] {
	const localConfig = getOllamaLocalRuntimeConfig();
	const cloudConfig = getOllamaCloudRuntimeConfig();
	const cloudModels = credential ? getCredentialModels(credential) : cloudEnvDiscoveryState.models;
	return [
		...cloudModels.map((model) => ({ ...model, provider: OLLAMA_CLOUD_PROVIDER, baseUrl: cloudConfig.apiUrl })),
		...getRegisteredLocalModels().map((model) => ({ ...model, provider: OLLAMA_LOCAL_PROVIDER, baseUrl: localConfig.apiUrl })),
	];
}

function findLocalModelForQuery(query: string, credential: OllamaCloudCredentials | null): OllamaProviderModel | null {
	const localModels = getRegisteredLocalModels();
	const localCollectedModels = localModels.map((model) => ({ ...model, provider: OLLAMA_LOCAL_PROVIDER, baseUrl: getOllamaLocalRuntimeConfig().apiUrl }));
	const localMatch = findModelForQuery(query, localCollectedModels);
	if (localMatch) {
		return localMatch;
	}

	const cloudModels = (credential ? getCredentialModels(credential) : cloudEnvDiscoveryState.models).map((model) => ({
		...model,
		provider: OLLAMA_CLOUD_PROVIDER,
		baseUrl: getOllamaCloudRuntimeConfig().apiUrl,
	}));
	const cloudMatch = findModelForQuery(query, cloudModels);
	if (!cloudMatch) {
		return null;
	}
	return localModels.find((model) => model.id === cloudMatch.id) ?? toDownloadableOllamaLocalModel(cloudMatch);
}

function findModelForQuery(query: string, models: CollectedOllamaModel[]): CollectedOllamaModel | null {
	const normalized = query.trim().toLowerCase();
	if (!normalized) {
		return null;
	}
	return (
		models.find((model) => `${model.provider}/${model.id}`.toLowerCase() === normalized) ??
		models.find((model) => model.id.toLowerCase() === normalized) ??
		models.find((model) => model.name.toLowerCase() === normalized) ??
		models.find((model) => `${model.provider}/${model.id}`.toLowerCase().includes(normalized)) ??
		models.find((model) => model.id.toLowerCase().includes(normalized)) ??
		models.find((model) => model.name.toLowerCase().includes(normalized)) ??
		null
	);
}

function renderModelInfo(model: CollectedOllamaModel): string {
	const lines = [
		`${sourceIcon(model.provider)} ${model.provider}/${model.id}`,
		`Name: ${model.name}`,
		`Source: ${model.provider === OLLAMA_LOCAL_PROVIDER ? "Local Ollama daemon" : "Ollama Cloud"}`,
		`Inputs: ${model.input.join(", ")}`,
		`Reasoning: ${model.reasoning ? "yes" : "no"}`,
		`Context window: ${model.contextWindow.toLocaleString()}`,
		`Max tokens: ${model.maxTokens.toLocaleString()}`,
		`Base URL: ${model.baseUrl}`,
	];
	if (model.provider === OLLAMA_LOCAL_PROVIDER) {
		lines.splice(3, 0, `Local availability: ${model.localAvailability === "downloadable" ? "download required" : "installed"}`);
	}
	if (model.family) {
		lines.splice(4, 0, `Family: ${model.family}`);
	}
	if (model.parameterSize) {
		lines.splice(5, 0, `Parameter size: ${model.parameterSize}`);
	}
	if (model.quantization) {
		lines.splice(6, 0, `Quantization: ${model.quantization}`);
	}
	const capabilitySummary = summarizeCapabilities(model);
	if (capabilitySummary) {
		lines.splice(lines.length - 1, 0, `Capabilities: ${capabilitySummary}`);
	}
	return lines.join("\n");
}

function renderModelList(models: CollectedOllamaModel[]): string {
	if (models.length === 0) {
		return "No Ollama models are currently registered. Run /ollama refresh-models.";
	}

	const sections = [
		{
			title: "Cloud",
			models: models.filter((model) => model.provider === OLLAMA_CLOUD_PROVIDER),
		},
		{
			title: "Local",
			models: models.filter((model) => model.provider === OLLAMA_LOCAL_PROVIDER),
		},
	].filter((section) => section.models.length > 0);

	return sections
		.map((section) => [
			`Ollama ${section.title}:`,
			...section.models
				.sort((left, right) => sortCollectedModels(left, right))
				.map(
					(model) =>
						`  ${sourceIcon(model.provider)} ${model.provider}/${model.id} — ${model.name}${renderModelBadges(model)} · ${model.contextWindow.toLocaleString()} ctx`,
				),
		].join("\n"))
		.join("\n\n");
}

function renderModelBadges(model: OllamaProviderModel): string {
	const badges: string[] = [];
	if (model.localAvailability === "downloadable") {
		badges.push("download");
	}
	if (model.input.includes("image")) {
		badges.push("vision");
	}
	if (model.reasoning) {
		badges.push("reasoning");
	}
	if (model.parameterSize) {
		badges.push(model.parameterSize);
	}
	return badges.length > 0 ? ` [${badges.join(" · ")}]` : "";
}

function summarizeCapabilities(model: OllamaProviderModel): string | null {
	const values = new Set<string>();
	for (const capability of model.capabilities ?? []) {
		values.add(capability);
	}
	if (model.localAvailability === "downloadable") {
		values.add("download");
	}
	if (model.input.includes("image")) {
		values.add("vision");
	}
	if (model.reasoning) {
		values.add("thinking");
	}
	return values.size > 0 ? [...values].join(", ") : null;
}

function getRegisteredLocalModels(): OllamaProviderModel[] {
	if (!ollamaCliStatus?.available) {
		return [];
	}
	const cloudCatalog = cloudEnvDiscoveryState.models.length > 0 ? cloudEnvDiscoveryState.models : getFallbackOllamaCloudModels();
	return mergeOllamaLocalCatalog(localDiscoveryState.models, cloudCatalog);
}

function isLocalModelInstalled(modelId: string): boolean {
	return localDiscoveryState.models.some((model) => model.id === modelId);
}

function hasCloudAuth(credential: OllamaCloudCredentials | null): boolean {
	return Boolean(credential || process.env[OLLAMA_CLOUD_API_KEY_ENV]?.trim());
}

function describeCloudAuth(credential: OllamaCloudCredentials | null): string {
	if (credential) {
		return "stored via /login";
	}
	if (process.env[OLLAMA_CLOUD_API_KEY_ENV]?.trim()) {
		return "environment only";
	}
	return "public catalog only (run /login ollama-cloud to use models)";
}

function describeLocalCliStatus(): string {
	if (ollamaCliStatus?.available) {
		return ollamaCliStatus.version ? `available (${ollamaCliStatus.version})` : "available";
	}
	return "missing (only cloud instances are available right now because Ollama is not installed)";
}

function describeLocalRuntime(): string {
	if (!ollamaCliStatus?.available) {
		return "downloads unavailable";
	}
	if (localDiscoveryState.lastError) {
		return `unreachable (${localDiscoveryState.lastError})`;
	}
	if (localDiscoveryState.lastRefresh) {
		return "reachable";
	}
	return "probing";
}

function sortCollectedModels(left: CollectedOllamaModel, right: CollectedOllamaModel): number {
	if (left.provider === right.provider && left.provider === OLLAMA_LOCAL_PROVIDER) {
		const leftWeight = left.localAvailability === "downloadable" ? 1 : 0;
		const rightWeight = right.localAvailability === "downloadable" ? 1 : 0;
		if (leftWeight !== rightWeight) {
			return leftWeight - rightWeight;
		}
	}
	return left.id.localeCompare(right.id);
}

function sourceIcon(provider: string): string {
	return provider === OLLAMA_LOCAL_PROVIDER ? "⌂" : "☁";
}

function formatRefreshAge(timestamp: number | null | undefined): string {
	if (!timestamp) {
		return "";
	}
	const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
	if (seconds < 5) {
		return " (just refreshed)";
	}
	if (seconds < 60) {
		return ` (${seconds}s ago)`;
	}
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) {
		return ` (${minutes}m ago)`;
	}
	const hours = Math.round(minutes / 60);
	return ` (${hours}h ago)`;
}

function getStoredCloudCredential(ctx: { modelRegistry: { authStorage: { get: (provider: string) => unknown } } }): OllamaCloudCredentials | null {
	const credential = ctx.modelRegistry.authStorage.get(OLLAMA_CLOUD_PROVIDER);
	return credential && typeof credential === "object" && (credential as { type?: string }).type === "oauth"
		? (credential as OllamaCloudCredentials)
		: null;
}

function getStoredCloudCredentialFromContext(ctx: CommandContextLike): OllamaCloudCredentials | null {
	const getter = ctx.modelRegistry?.authStorage?.get;
	if (typeof getter !== "function") {
		return null;
	}
	try {
		const credential = getter(OLLAMA_CLOUD_PROVIDER);
		return credential && typeof credential === "object" && (credential as { type?: string }).type === "oauth"
			? (credential as OllamaCloudCredentials)
			: null;
	} catch {
		return null;
	}
}

function setCloudCredentialInContext(ctx: CommandContextLike, credential: OllamaCloudCredentials): void {
	const setter = ctx.modelRegistry?.authStorage?.set;
	if (typeof setter !== "function") {
		return;
	}
	try {
		setter(OLLAMA_CLOUD_PROVIDER, { type: "oauth", ...credential });
	} catch {
		// Ignore auth-storage races and keep runtime usable.
	}
}

function createOllamaProcessEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	if (!env.OLLAMA_HOST) {
		env.OLLAMA_HOST = getOllamaLocalRuntimeConfig().origin;
	}
	return env;
}

function bootstrapOllamaProviders(pi: ExtensionAPI, scheduleLocalRefresh: () => void): void {
	registerOllamaCloudProvider(pi);
	registerOllamaLocalProvider(pi);
	void refreshRegisteredCloudEnvModels(pi);
	scheduleLocalRefresh();
}

export {
	createOllamaCloudOAuthProvider,
	discoverOllamaCloudModels,
	discoverOllamaLocalModels,
	getCredentialModels,
	getFallbackOllamaCloudModels,
	loginOllamaCloud,
	refreshOllamaCloudCredential,
};
export { toOllamaModel, toOllamaCloudModel, type OllamaCloudCredentials, type OllamaProviderModel } from "./models.js";

export default function ollamaProviderExtension(pi: ExtensionAPI): void {
	const registerLifecycle = registerOllamaLifecycle(pi);
	bootstrapOllamaProviders(pi, registerLifecycle.scheduleLocalBootstrapRefresh);
	registerOllamaCommands(pi);
}
