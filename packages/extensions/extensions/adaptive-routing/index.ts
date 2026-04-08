import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ModelSelectEvent,
} from "@mariozechner/pi-coding-agent";
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
		pi.events.emit("usage:query");
	}

	pi.events.on("usage:limits", (payload) => {
		const providers: ProviderUsageState["providers"] = {};
		if (payload && typeof payload === "object" && payload.providers && typeof payload.providers === "object") {
			for (const [provider, value] of Object.entries(payload.providers as Record<string, unknown>)) {
				providers[provider] = {
					confidence: extractQuotaConfidence(value),
					remainingPct: extractRemainingPct(value),
				};
			}
		}
		runtime.usage = {
			providers,
			sessionCost: typeof payload?.sessionCost === "number" ? payload.sessionCost : undefined,
			rolling30dCost: typeof payload?.rolling30dCost === "number" ? payload.rolling30dCost : undefined,
			perModel: typeof payload?.perModel === "object" ? payload.perModel : undefined,
			perSource: typeof payload?.perSource === "object" ? payload.perSource : undefined,
			updatedAt: Date.now(),
		};
	});

	pi.on("session_start", async (_event, ctx) => {
		runtime.state = readAdaptiveRoutingState();
		refreshUsageSnapshot();
		updateStatus(ctx);
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

	pi.registerCommand("route", {
		description:
			"Adaptive routing controls: /route [status|on|off|shadow|auto|explain|lock|unlock|refresh|feedback|stats]",
		async handler(args, ctx) {
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
							"Usage: /route feedback <good|bad|wrong-intent|overkill|underpowered|wrong-provider|wrong-thinking>",
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
				case "explain":
					await openOverlay(ctx, buildExplanationLines(runtime.lastDecision, runtime.usage));
					return;
				default:
					ctx.ui.notify(buildStatusLine(runtime.state, runtime.lastDecision, getEffectiveMode()), "info");
			}
		},
	});
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

function shouldRecordOverride(event: ModelSelectEvent, lastDecision: RouteDecision | undefined): boolean {
	if (!(lastDecision && event.model)) {
		return false;
	}
	return `${event.model.provider}/${event.model.id}` !== lastDecision.selectedModel;
}

function extractQuotaConfidence(value: unknown): ProviderUsageState["providers"][string]["confidence"] {
	if (!value || typeof value !== "object") {
		return "unknown";
	}
	if (Array.isArray(value.windows) && value.windows.length > 0) {
		return "authoritative";
	}
	if (value.stale) {
		return "estimated";
	}
	return "unknown";
}

function extractRemainingPct(value: unknown): number | undefined {
	if (!value || typeof value !== "object" || !Array.isArray(value.windows)) {
		return undefined;
	}
	const percentages = value.windows
		.map((window) =>
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

async function openOverlay(ctx: ExtensionCommandContext, lines: string[]): Promise<void> {
	await ctx.ui.custom(
		(tui, _theme, _keybindings, done) => ({
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
