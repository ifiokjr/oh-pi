import { matchesModelRef } from "./normalize.js";
import type {
	AdaptiveRoutingConfig,
	NormalizedRouteCandidate,
	PromptRouteClassification,
	ProviderUsageState,
	RouteCandidateScore,
	RouteDecision,
	RouteExplanation,
	RouteIntent,
	RouteLock,
	RouteQuotaSnapshot,
	RouteThinkingLevel,
	RouteTier,
} from "./types.js";

export interface RoutingDecisionInput {
	config: AdaptiveRoutingConfig;
	candidates: NormalizedRouteCandidate[];
	classification: PromptRouteClassification;
	currentModel?: string;
	currentThinking?: RouteThinkingLevel;
	usage?: ProviderUsageState;
	lock?: RouteLock;
}

export function decideRoute(input: RoutingDecisionInput): RouteDecision | undefined {
	const { config, candidates, classification, usage, lock } = input;
	if (candidates.length === 0) {
		return undefined;
	}

	if (lock) {
		const lockedCandidate = candidates.find((candidate) => matchesModelRef(lock.model, candidate));
		if (lockedCandidate) {
			const appliedThinking = clampThinking(lock.thinking, lockedCandidate.maxThinkingLevel);
			return {
				selectedModel: lockedCandidate.fullId,
				selectedThinking: appliedThinking,
				fallbacks: buildFallbacks(candidates, lockedCandidate.fullId, config, classification),
				explanation: {
					summary: `locked to ${lockedCandidate.fullId} · ${appliedThinking}`,
					codes: ["manual_lock_applied"],
					classification,
					clampedThinking:
						appliedThinking === lock.thinking ? undefined : { requested: lock.thinking, applied: appliedThinking },
					quota: buildQuotaSummary(usage),
				},
			};
		}
	}

	const scores = candidates.map((candidate) => scoreCandidate(candidate, input));
	scores.sort((a, b) => b.score - a.score || a.model.localeCompare(b.model));
	const best = scores[0];
	if (!best) {
		return undefined;
	}

	const selected = candidates.find((candidate) => candidate.fullId === best.model);
	if (!selected) {
		return undefined;
	}

	const selectedThinking = clampThinking(resolveRequestedThinking(config, classification), selected.maxThinkingLevel);
	const explanation = buildExplanation(selected, selectedThinking, best, scores.slice(0, 3), classification, usage);

	return {
		selectedModel: selected.fullId,
		selectedThinking,
		fallbacks: scores.slice(1, 4).map((score) => score.model),
		explanation,
	};
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: candidate scoring intentionally combines multiple weighted routing signals.
function scoreCandidate(candidate: NormalizedRouteCandidate, input: RoutingDecisionInput): RouteCandidateScore {
	const reasons: string[] = [];
	let score = 0;
	const { config, classification, currentModel, usage } = input;
	const intentPolicy = config.intents[classification.intent];

	const rankingIndex = config.models.ranked.findIndex((entry) => matchesModelRef(entry, candidate));
	if (rankingIndex >= 0) {
		score += Math.max(30 - rankingIndex * 3, 3);
		reasons.push(`rank:${rankingIndex + 1}`);
	}

	if (intentPolicy?.preferredModels?.some((entry) => matchesModelRef(entry, candidate))) {
		score += 28;
		reasons.push("intent-model");
	}

	if (intentPolicy?.preferredProviders?.includes(candidate.provider)) {
		score += 14;
		reasons.push("intent-provider");
	}

	const tierDelta = Math.abs(tierOrder(candidate.tier) - tierOrder(classification.recommendedTier));
	if (tierDelta === 0) {
		score += 18;
		reasons.push(`tier:${candidate.tier}`);
	} else if (tierDelta === 1) {
		score += 8;
		reasons.push("tier-near");
	} else {
		score -= 8;
	}

	if (supportsRequestedThinking(candidate.maxThinkingLevel, resolveRequestedThinking(config, classification))) {
		score += 6;
		reasons.push("thinking-fit");
	} else {
		score -= 5;
	}

	if (classification.intent === "design" && candidate.tags.includes("design")) {
		score += 12;
		reasons.push("design-fit");
	}

	if (
		["architecture", "debugging", "autonomous", "refactor"].includes(classification.intent) &&
		candidate.tags.includes("architecture")
	) {
		score += 10;
		reasons.push("reasoning-fit");
	}

	if (currentModel && currentModel === candidate.fullId && config.stickyTurns > 0) {
		score += 5;
		reasons.push("sticky");
	}

	const reserve = config.providerReserves[candidate.provider];
	const providerQuota = usage?.providers[candidate.provider];
	if (reserve && shouldApplyReserve(reserve.applyToTiers, candidate.tier)) {
		if (typeof providerQuota?.remainingPct === "number") {
			if (providerQuota.remainingPct < reserve.minRemainingPct) {
				score -= reserve.allowOverrideForPeak && classification.recommendedTier === "peak" ? 20 : 80;
				reasons.push("reserve-low");
			} else {
				score += 4;
				reasons.push("reserve-ok");
			}
		} else if (providerQuota?.confidence === "unknown" || !providerQuota) {
			reasons.push("quota-unknown");
		}
	}

	if (classification.risk === "high" && (candidate.tier === "premium" || candidate.tier === "peak")) {
		score += 8;
		reasons.push("risk-fit");
	}

	if (classification.intent === "quick-qna" && candidate.tier === "cheap") {
		score += 8;
		reasons.push("cheap-fit");
	}

	return {
		model: candidate.fullId,
		score,
		reasons,
	};
}

function buildExplanation(
	selected: NormalizedRouteCandidate,
	selectedThinking: RouteThinkingLevel,
	best: RouteCandidateScore,
	topCandidates: RouteCandidateScore[],
	classification: PromptRouteClassification,
	usage?: ProviderUsageState,
): RouteExplanation {
	const requestedThinking = classification.recommendedThinking;
	const codes = new Set<RouteExplanation["codes"][number]>();
	for (const reason of best.reasons) {
		if (reason === "design-fit") {
			codes.add("intent_design_bias");
		}
		if (reason === "reasoning-fit") {
			codes.add("intent_architecture_bias");
		}
		if (reason === "sticky") {
			codes.add("current_model_sticky");
		}
		if (reason === "reserve-ok") {
			codes.add("premium_allowed");
		}
		if (reason === "quota-unknown") {
			codes.add("quota_unknown");
		}
	}
	if (topCandidates.some((candidate) => candidate.reasons.includes("reserve-low"))) {
		codes.add("premium_reserved");
	}
	if (selectedThinking !== requestedThinking) {
		codes.add("thinking_clamped");
	}
	if (selected.fallbackGroups.length > 0) {
		codes.add("fallback_group_applied");
	}

	return {
		summary: `${selected.fullId} · ${selectedThinking} · ${classification.intent} · ${classification.recommendedTier}`,
		codes: Array.from(codes),
		classification,
		clampedThinking:
			selectedThinking === requestedThinking ? undefined : { requested: requestedThinking, applied: selectedThinking },
		quota: buildQuotaSummary(usage),
		candidates: topCandidates,
	};
}

function buildFallbacks(
	candidates: NormalizedRouteCandidate[],
	excludedModel: string,
	config: AdaptiveRoutingConfig,
	classification: PromptRouteClassification,
): string[] {
	return candidates
		.filter((candidate) => candidate.fullId !== excludedModel)
		.sort((a, b) => tierOrder(b.tier) - tierOrder(a.tier) || a.fullId.localeCompare(b.fullId))
		.filter((candidate) => !config.models.excluded.some((entry) => matchesModelRef(entry, candidate)))
		.filter(
			(candidate) => matchesTier(candidate.tier, classification.recommendedTier) || candidate.fallbackGroups.length > 0,
		)
		.slice(0, 3)
		.map((candidate) => candidate.fullId);
}

export function resolveRequestedThinking(
	config: AdaptiveRoutingConfig,
	classification: PromptRouteClassification,
): RouteThinkingLevel {
	return config.intents[classification.intent]?.defaultThinking ?? classification.recommendedThinking;
}

export function clampThinking(requested: RouteThinkingLevel, maxSupported: RouteThinkingLevel): RouteThinkingLevel {
	const order: RouteThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
	return order[Math.min(order.indexOf(requested), order.indexOf(maxSupported))] ?? maxSupported;
}

function supportsRequestedThinking(maxSupported: RouteThinkingLevel, requested: RouteThinkingLevel): boolean {
	return clampThinking(requested, maxSupported) === requested;
}

function buildQuotaSummary(usage?: ProviderUsageState): Record<string, RouteQuotaSnapshot> | undefined {
	if (!usage) {
		return undefined;
	}
	const summary: Record<string, RouteQuotaSnapshot> = {};
	for (const [provider, state] of Object.entries(usage.providers)) {
		summary[provider] = { confidence: state.confidence, remainingPct: state.remainingPct };
	}
	return summary;
}

function shouldApplyReserve(applyToTiers: RouteTier[] | undefined, recommendedTier: RouteTier): boolean {
	return !applyToTiers || applyToTiers.includes(recommendedTier);
}

function tierOrder(tier: RouteTier): number {
	switch (tier) {
		case "cheap":
			return 0;
		case "balanced":
			return 1;
		case "premium":
			return 2;
		case "peak":
			return 3;
	}
}

function matchesTier(candidateTier: RouteTier, requestedTier: RouteTier): boolean {
	return Math.abs(tierOrder(candidateTier) - tierOrder(requestedTier)) <= 1;
}

export function buildFallbackClassification(intent: RouteIntent): PromptRouteClassification {
	return {
		intent,
		complexity: intent === "design" || intent === "architecture" ? 4 : 3,
		risk: intent === "quick-qna" ? "low" : "medium",
		expectedTurns: intent === "quick-qna" ? "one" : "few",
		toolIntensity: intent === "implementation" || intent === "debugging" ? "high" : "medium",
		contextBreadth: intent === "architecture" ? "large" : "medium",
		recommendedTier: intent === "design" || intent === "architecture" ? "premium" : "balanced",
		recommendedThinking: intent === "quick-qna" ? "minimal" : "medium",
		confidence: 0.35,
		reason: "Fallback classification applied.",
		classifierMode: "heuristic",
	};
}
