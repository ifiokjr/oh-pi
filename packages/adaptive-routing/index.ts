import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { classifyPrompt } from "./classifier.js";
import { readAdaptiveRoutingConfig } from "./config.js";
import { decideRoute } from "./engine.js";
import { normalizeRouteCandidates } from "./normalize.js";
import { readAdaptiveRoutingState, writeAdaptiveRoutingState } from "./state.js";
import {
	appendTelemetryEvent,
	computeStats,
	createDecisionId,
	createFeedbackEvent,
	formatStats,
	hashPrompt,
	readTelemetryEvents,
} from "./telemetry.js";
import type {
	AdaptiveRoutingMode,
	AdaptiveRoutingState,
	ProviderUsageState,
	RouteDecision,
	RouteFeedbackCategory,
	RouteThinkingLevel,
} from "./types.js";

const STATUS_KEY = "adaptive-routing";
const STARTUP_STATE_REFRESH_DELAY_MS = 250;

type RuntimeState = {
	state: AdaptiveRoutingState;
	usage?: ProviderUsageState;
	lastDecision?: RouteDecision;
	lastDecisionPromptHash?: string;
	lastDecisionTurnCount: number;
	lastDecisionOverridden: boolean;
	applyingRoute: boolean;
};

export default function adaptiveRoutingExtension(pi: ExtensionAPI) {
	const runtime: RuntimeState = {
		state: readAdaptiveRoutingState(),
		usage: undefined,
		lastDecision: undefined,
		lastDecisionPromptHash: undefined,
		lastDecisionTurnCount: 0,
		lastDecisionOverridden: false,
		applyingRoute: false,
	};

	function persistState(): void {
		writeAdaptiveRoutingState({
			...runtime.state,
			lastDecision: runtime.lastDecision,
		});
	}

	function getEffectiveMode(): AdaptiveRoutingMode {
		const config = readAdaptiveRoutingConfig();
		return runtime.state.mode ?? config.mode;
	}

	function currentRouteLabel(): string | undefined {
		const mode = getEffectiveMode();
		if (mode === "off") {
			return undefined;
		}
		const lockLabel = runtime.state.lock ? ` 🔒 ${runtime.state.lock.model}:${runtime.state.lock.thinking}` : "";
		const decision = runtime.lastDecision;
		return decision
			? `${mode} → ${decision.selectedModel}:${decision.selectedThinking}${lockLabel}`
			: `${mode}${lockLabel}`;
	}

	function updateStatus(ctx: ExtensionContext): void {
		ctx.ui.setStatus(STATUS_KEY, currentRouteLabel());
	}

	function refreshUsageSnapshot(): void {
		pi.events.emit("usage:query", undefined);
	}

	pi.events.on("usage:limits", (payload: unknown) => {
		const providerPayload =
			payload && typeof payload === "object" && "providers" in payload
				? ((payload as { providers?: unknown }).providers as Record<string, unknown> | undefined)
				: undefined;
		const providers: ProviderUsageState["providers"] = {};
		if (providerPayload && typeof providerPayload === "object") {
			for (const [provider, value] of Object.entries(providerPayload)) {
				providers[provider] = {
					confidence: extractQuotaConfidence(value),
					remainingPct: extractRemainingPct(value),
				};
			}
		}
		runtime.usage = {
			providers,
			sessionCost:
				payload && typeof payload === "object" && typeof (payload as { sessionCost?: unknown }).sessionCost === "number"
					? ((payload as { sessionCost: number }).sessionCost ?? undefined)
					: undefined,
			rolling30dCost:
				payload &&
				typeof payload === "object" &&
				typeof (payload as { rolling30dCost?: unknown }).rolling30dCost === "number"
					? ((payload as { rolling30dCost: number }).rolling30dCost ?? undefined)
					: undefined,
			perModel:
				payload && typeof payload === "object" && typeof (payload as { perModel?: unknown }).perModel === "object"
					? ((payload as { perModel: Record<string, unknown> }).perModel ?? undefined)
					: undefined,
			perSource:
				payload && typeof payload === "object" && typeof (payload as { perSource?: unknown }).perSource === "object"
					? ((payload as { perSource: Record<string, unknown> }).perSource ?? undefined)
					: undefined,
			updatedAt: Date.now(),
		};
	});

	let startupRefreshTimer: ReturnType<typeof setTimeout> | undefined;
	const cancelStartupRefresh = () => {
		if (!startupRefreshTimer) {
			return;
		}
		clearTimeout(startupRefreshTimer);
		startupRefreshTimer = undefined;
	};
	const refreshRuntimeState = (ctx: ExtensionContext) => {
		cancelStartupRefresh();
		runtime.state = readAdaptiveRoutingState();
		refreshUsageSnapshot();
		updateStatus(ctx);
	};

	pi.on("session_start", async (_event, ctx) => {
		cancelStartupRefresh();
		startupRefreshTimer = setTimeout(() => {
			startupRefreshTimer = undefined;
			refreshRuntimeState(ctx);
		}, STARTUP_STATE_REFRESH_DELAY_MS);
		startupRefreshTimer.unref?.();
	});

	pi.on("session_shutdown", async () => {
		cancelStartupRefresh();
	});

	pi.on("model_select", async (event, ctx) => {
		if (!runtime.applyingRoute && shouldRecordOverride(event, runtime.lastDecision)) {
			appendTelemetryEvent(readAdaptiveRoutingConfig().telemetry, {
				type: "route_override",
				timestamp: Date.now(),
				decisionId: runtime.lastDecision?.id,
				from: {
					model: runtime.lastDecision?.selectedModel ?? "unknown",
					thinking: runtime.lastDecision?.selectedThinking ?? "off",
				},
				to: {
					model: `${event.model.provider}/${event.model.id}`,
					thinking: pi.getThinkingLevel() as RouteThinkingLevel,
				},
				reason: "manual",
			});
			runtime.lastDecisionOverridden = true;
		}
		updateStatus(ctx);
	});

	pi.on("agent_end", async (_event, _ctx) => {
		if (!runtime.lastDecision?.id) {
			return;
		}
		appendTelemetryEvent(readAdaptiveRoutingConfig().telemetry, {
			type: "route_outcome",
			timestamp: Date.now(),
			decisionId: runtime.lastDecision.id,
			turnCount: runtime.lastDecisionTurnCount,
			completed: true,
			userOverrideOccurred: runtime.lastDecisionOverridden,
		});
	});

	pi.on("turn_end", async () => {
		runtime.lastDecisionTurnCount += 1;
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const config = readAdaptiveRoutingConfig();
		runtime.state = readAdaptiveRoutingState();
		const mode = runtime.state.mode ?? config.mode;
		if (mode === "off") {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}

		refreshUsageSnapshot();
		const availableModels = ctx.modelRegistry.getAvailable();
		const candidates = normalizeRouteCandidates(availableModels).filter(
			(candidate) => !config.models.excluded.some((entry) => entry === candidate.fullId || entry === candidate.modelId),
		);
		if (candidates.length === 0) {
			ctx.ui.setStatus(STATUS_KEY, `${mode} → no eligible models`);
			return;
		}

		const classification = await classifyPrompt(event.prompt, config, ctx, candidates);
		const currentModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
		const currentThinking = pi.getThinkingLevel() as RouteThinkingLevel;
		const decision = decideRoute({
			config,
			candidates,
			classification,
			currentModel,
			currentThinking,
			usage: runtime.usage,
			lock: runtime.state.lock,
		});
		if (!decision) {
			ctx.ui.setStatus(STATUS_KEY, `${mode} → no route`);
			return;
		}

		decision.id = createDecisionId();
		runtime.lastDecision = decision;
		runtime.lastDecisionPromptHash = hashPrompt(event.prompt);
		runtime.lastDecisionTurnCount = 0;
		runtime.lastDecisionOverridden = false;
		runtime.state.lastDecision = decision;
		persistState();

		appendTelemetryEvent(config.telemetry, {
			type: "route_decision",
			timestamp: Date.now(),
			decisionId: decision.id,
			promptHash: runtime.lastDecisionPromptHash,
			mode,
			selected: {
				model: decision.selectedModel,
				thinking: decision.selectedThinking,
			},
			fallbacks: decision.fallbacks,
			classifier: classification,
			quota: decision.explanation.quota,
			candidates: decision.explanation.candidates,
			explanationCodes: decision.explanation.codes,
		});

		if (mode === "shadow") {
			if (currentModel && (currentModel !== decision.selectedModel || currentThinking !== decision.selectedThinking)) {
				appendTelemetryEvent(config.telemetry, {
					type: "route_shadow_disagreement",
					timestamp: Date.now(),
					decisionId: decision.id,
					promptHash: runtime.lastDecisionPromptHash,
					suggested: {
						model: decision.selectedModel,
						thinking: decision.selectedThinking,
					},
					actual: {
						model: currentModel,
						thinking: currentThinking,
					},
				});
			}
			ctx.ui.notify(`Adaptive route suggestion: ${decision.selectedModel} · ${decision.selectedThinking}`, "info");
			updateStatus(ctx);
			return;
		}

		await applyDecision(pi, ctx, decision, candidates, runtime);
		updateStatus(ctx);
	});

	const handleRouteCommand = async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
		const command = args.trim();
		const [head, ...rest] = command.split(/\s+/).filter(Boolean);
		const subcommand = (head ?? "status").toLowerCase();
		runtime.state = readAdaptiveRoutingState();

		switch (subcommand) {
			case "on":
			case "auto":
				runtime.state.mode = "auto";
				persistState();
				updateStatus(ctx);
				ctx.ui.notify("Adaptive routing set to auto mode.", "info");
				return;
			case "off":
				runtime.state.mode = "off";
				persistState();
				updateStatus(ctx);
				ctx.ui.notify("Adaptive routing disabled.", "warning");
				return;
			case "shadow":
				runtime.state.mode = "shadow";
				persistState();
				updateStatus(ctx);
				ctx.ui.notify("Adaptive routing set to shadow mode.", "info");
				return;
			case "lock": {
				if (!ctx.model) {
					ctx.ui.notify("No active model to lock.", "warning");
					return;
				}
				runtime.state.lock = {
					model: `${ctx.model.provider}/${ctx.model.id}`,
					thinking: pi.getThinkingLevel() as RouteThinkingLevel,
					setAt: Date.now(),
				};
				persistState();
				updateStatus(ctx);
				ctx.ui.notify(
					`Adaptive routing locked to ${runtime.state.lock.model}:${runtime.state.lock.thinking}.`,
					"info",
				);
				return;
			}
			case "unlock":
				runtime.state.lock = undefined;
				persistState();
				updateStatus(ctx);
				ctx.ui.notify("Adaptive routing lock cleared.", "info");
				return;
			case "refresh":
				refreshUsageSnapshot();
				runtime.state = readAdaptiveRoutingState();
				ctx.ui.notify("Adaptive routing config and usage refreshed.", "info");
				updateStatus(ctx);
				return;
			case "feedback": {
				const category = normalizeFeedbackCategory(rest[0]);
				if (!category) {
					ctx.ui.notify(
						"Usage: /route:feedback <good|bad|wrong-intent|overkill|underpowered|wrong-provider|wrong-thinking>",
						"warning",
					);
					return;
				}
				appendTelemetryEvent(
					readAdaptiveRoutingConfig().telemetry,
					createFeedbackEvent(runtime.lastDecision, category),
				);
				ctx.ui.notify(`Recorded route feedback: ${category}.`, "info");
				return;
			}
			case "stats":
				await openOverlay(ctx, formatStats(computeStats(readTelemetryEvents())));
				return;
			case "assignments":
				await openOverlay(ctx, buildDelegatedAssignmentLines(readAdaptiveRoutingConfig(), ctx));
				return;
			case "explain":
				await openOverlay(ctx, buildExplanationLines(runtime.lastDecision, runtime.usage));
				return;
			default:
				ctx.ui.notify(buildStatusLine(runtime.state, runtime.lastDecision, getEffectiveMode()), "info");
		}
	};

	pi.registerCommand("route", {
		description:
			"Adaptive routing controls: /route:status|on|auto|off|shadow|explain|assignments|lock|unlock|refresh|feedback|stats",
		handler: handleRouteCommand,
	});

	const routeAliases: Array<{ name: string; subcommand: string; description: string }> = [
		{ name: "route:status", subcommand: "status", description: "Show the current adaptive routing status." },
		{ name: "route:on", subcommand: "on", description: "Enable adaptive routing auto mode." },
		{ name: "route:auto", subcommand: "auto", description: "Enable adaptive routing auto mode." },
		{ name: "route:off", subcommand: "off", description: "Disable adaptive routing." },
		{ name: "route:shadow", subcommand: "shadow", description: "Suggest route decisions without changing the active model." },
		{ name: "route:explain", subcommand: "explain", description: "Explain the latest adaptive route decision." },
		{ name: "route:assignments", subcommand: "assignments", description: "Show delegated routing assignments." },
		{ name: "route:lock", subcommand: "lock", description: "Lock routing to the current model and thinking level." },
		{ name: "route:unlock", subcommand: "unlock", description: "Clear the adaptive routing lock." },
		{ name: "route:refresh", subcommand: "refresh", description: "Refresh routing config and usage snapshots." },
		{ name: "route:feedback", subcommand: "feedback", description: "Record feedback for the last adaptive routing decision." },
		{ name: "route:stats", subcommand: "stats", description: "Show adaptive routing telemetry stats." },
	];

	for (const alias of routeAliases) {
		pi.registerCommand(alias.name, {
			description: alias.description,
			handler: (args, ctx) => handleRouteCommand(args ? `${alias.subcommand} ${args}` : alias.subcommand, ctx),
		});
	}
}

async function applyDecision(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	decision: RouteDecision,
	candidates: ReturnType<typeof normalizeRouteCandidates>,
	runtime: RuntimeState,
): Promise<void> {
	const currentModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
	const currentThinking = pi.getThinkingLevel() as RouteThinkingLevel;
	if (currentModel === decision.selectedModel && currentThinking === decision.selectedThinking) {
		return;
	}

	const target = candidates.find((candidate) => candidate.fullId === decision.selectedModel);
	if (!target) {
		ctx.ui.notify(`Adaptive route target unavailable: ${decision.selectedModel}`, "warning");
		return;
	}

	runtime.applyingRoute = true;
	try {
		if (currentModel !== decision.selectedModel) {
			const ok = await pi.setModel(target.model);
			if (!ok) {
				ctx.ui.notify(`Failed to switch to ${decision.selectedModel}.`, "error");
				return;
			}
		}
		if (currentThinking !== decision.selectedThinking) {
			pi.setThinkingLevel(decision.selectedThinking);
		}
		ctx.ui.notify(`Adaptive route applied: ${decision.selectedModel} · ${decision.selectedThinking}`, "info");
	} finally {
		runtime.applyingRoute = false;
	}
}

function shouldRecordOverride(
	event: { model?: { provider: string; id: string } },
	lastDecision: RouteDecision | undefined,
): boolean {
	if (!(lastDecision && event.model)) {
		return false;
	}
	return `${event.model.provider}/${event.model.id}` !== lastDecision.selectedModel;
}

function extractQuotaConfidence(value: unknown): ProviderUsageState["providers"][string]["confidence"] {
	if (!value || typeof value !== "object") {
		return "unknown";
	}
	const typedValue = value as { windows?: unknown[]; stale?: boolean };
	if (Array.isArray(typedValue.windows) && typedValue.windows.length > 0) {
		return "authoritative";
	}
	if (typedValue.stale) {
		return "estimated";
	}
	return "unknown";
}

function extractRemainingPct(value: unknown): number | undefined {
	if (!value || typeof value !== "object") {
		return undefined;
	}
	const typedValue = value as { windows?: unknown[] };
	if (!Array.isArray(typedValue.windows)) {
		return undefined;
	}
	const percentages = typedValue.windows
		.map((window: unknown) =>
			window && typeof window === "object" ? Number((window as { remainingPct?: unknown }).remainingPct) : Number.NaN,
		)
		.filter((pct: number) => Number.isFinite(pct));
	if (percentages.length === 0) {
		return undefined;
	}
	return Math.min(...percentages);
}

function normalizeFeedbackCategory(value: string | undefined): RouteFeedbackCategory | undefined {
	switch ((value ?? "").toLowerCase()) {
		case "good":
		case "bad":
		case "wrong-intent":
		case "overkill":
		case "underpowered":
		case "wrong-provider":
		case "wrong-thinking":
			return value?.toLowerCase() as RouteFeedbackCategory;
		default:
			return undefined;
	}
}

function buildStatusLine(
	state: AdaptiveRoutingState,
	decision: RouteDecision | undefined,
	mode: AdaptiveRoutingMode,
): string {
	const parts = [`mode=${mode}`];
	if (state.lock) {
		parts.push(`lock=${state.lock.model}:${state.lock.thinking}`);
	}
	if (decision) {
		parts.push(`last=${decision.selectedModel}:${decision.selectedThinking}`);
	}
	return `adaptive routing · ${parts.join(" · ")}`;
}

function buildExplanationLines(decision: RouteDecision | undefined, usage: ProviderUsageState | undefined): string[] {
	if (!decision) {
		return ["Adaptive Routing", "No route decision recorded yet."];
	}
	const lines = [
		"Adaptive Routing",
		`Selected: ${decision.selectedModel}`,
		`Thinking: ${decision.selectedThinking}`,
		`Summary: ${decision.explanation.summary}`,
		`Codes: ${decision.explanation.codes.join(", ") || "none"}`,
	];
	if (decision.explanation.classification) {
		const c = decision.explanation.classification;
		lines.push(`Intent: ${c.intent} · complexity ${c.complexity} · tier ${c.recommendedTier}`);
		lines.push(`Thinking recommendation: ${c.recommendedThinking} · confidence ${Math.round(c.confidence * 100)}%`);
		lines.push(`Classifier: ${c.classifierMode}${c.classifierModel ? ` (${c.classifierModel})` : ""}`);
		lines.push(`Reason: ${c.reason}`);
	}
	if (decision.fallbacks.length > 0) {
		lines.push(`Fallbacks: ${decision.fallbacks.join(" → ")}`);
	}
	if (decision.explanation.candidates?.length) {
		lines.push("Top candidates:");
		for (const candidate of decision.explanation.candidates) {
			lines.push(`  - ${candidate.model} (${candidate.score.toFixed(1)}) [${candidate.reasons.join(", ")}]`);
		}
	}
	if (usage && Object.keys(usage.providers).length > 0) {
		lines.push("Quota snapshot:");
		for (const [provider, state] of Object.entries(usage.providers)) {
			lines.push(`  - ${provider}: ${state.remainingPct ?? "?"}% · ${state.confidence}`);
		}
	}
	lines.push("Press q, esc, space, or enter to close.");
	return lines;
}

function buildDelegatedAssignmentLines(
	config: ReturnType<typeof readAdaptiveRoutingConfig>,
	ctx: ExtensionCommandContext,
): string[] {
	const lines = ["Delegated Routing Assignments"];
	const delegated = config.delegatedRouting;
	if (!delegated.enabled) {
		lines.push("Delegated routing is disabled.");
		return lines;
	}
	const availableModels = ctx.modelRegistry.getAvailable().map((model) => ({
		provider: model.provider,
		id: model.id,
		fullId: `${model.provider}/${model.id}`,
	}));
	const categoryEntries = Object.entries(delegated.categories);
	if (categoryEntries.length === 0) {
		lines.push("No delegated categories configured.");
		return lines;
	}
	for (const [category, policy] of categoryEntries) {
		const resolvedModel = resolveDelegatedAssignmentModel(category, policy, config, availableModels);
		lines.push(`- ${category}`);
		if (policy.preferredProviders?.length) {
			lines.push(`  providers: ${policy.preferredProviders.join(" → ")}`);
		}
		if (policy.fallbackGroup) {
			lines.push(`  fallback group: ${policy.fallbackGroup}`);
		}
		if (policy.candidates?.length) {
			lines.push(`  candidates: ${policy.candidates.join(" → ")}`);
		}
		if (policy.defaultThinking) {
			lines.push(`  thinking: ${policy.defaultThinking}`);
		}
		lines.push(`  resolved: ${resolvedModel ?? "(no matching installed model)"}`);
	}
	lines.push("Press q, esc, space, or enter to close.");
	return lines;
}

function resolveDelegatedAssignmentModel(
	category: string,
	policy: NonNullable<ReturnType<typeof readAdaptiveRoutingConfig>["delegatedRouting"]["categories"][string]>,
	config: ReturnType<typeof readAdaptiveRoutingConfig>,
	availableModels: Array<{ provider: string; id: string; fullId: string }>,
): string | undefined {
	const refs = [
		...(policy.candidates ?? []),
		...(policy.fallbackGroup ? (config.fallbackGroups[policy.fallbackGroup]?.candidates ?? []) : []),
	];
	for (const ref of refs) {
		const match = ref.endsWith("/<best-available>")
			? availableModels.find((model) => model.provider === ref.slice(0, ref.indexOf("/")))
			: availableModels.find((model) => model.fullId === ref || model.id === ref);
		if (match) {
			return match.fullId;
		}
	}
	for (const provider of policy.preferredProviders ?? []) {
		const match = availableModels.find((model) => model.provider === provider);
		if (match) {
			return match.fullId;
		}
	}
	const cheapFallback =
		category === "quick-discovery" ? availableModels.find((model) => model.provider === "groq") : undefined;
	return cheapFallback?.fullId;
}

async function openOverlay(ctx: ExtensionCommandContext, lines: string[]): Promise<void> {
	await ctx.ui.custom(
		(tui, _theme, _keybindings, done) => ({
			invalidate() {
				// No-op overlay invalidation.
			},
			render(width: number) {
				return lines.map((line) => line.slice(0, width));
			},
			handleInput(data: string) {
				if (data === "q" || data === "\x1b" || data === " " || data === "\r") {
					done(undefined);
					return;
				}
				if (data === "r") {
					tui.requestRender();
				}
			},
			dispose() {
				// No-op overlay cleanup.
			},
		}),
		{ overlay: true, overlayOptions: { anchor: "center", width: 96, maxHeight: 28 } },
	);
}
