import type {
	AdaptiveRoutingConfig,
	AdaptiveRoutingExplanationCode,
	FallbackGroupPolicy,
	IntentRoutingPolicy,
	RouteIntent,
} from "./types.js";

export const ADAPTIVE_ROUTING_EXPLANATION_CODES: AdaptiveRoutingExplanationCode[] = [
	"intent_design_bias",
	"intent_architecture_bias",
	"premium_allowed",
	"premium_reserved",
	"quota_low",
	"quota_unknown",
	"thinking_clamped",
	"current_model_sticky",
	"fallback_group_applied",
];

export const DEFAULT_INTENT_POLICIES: Record<RouteIntent, IntentRoutingPolicy> = {
	"quick-qna": {
		preferredTier: "cheap",
		defaultThinking: "minimal",
		fallbackGroup: "cheap-router",
	},
	planning: {
		preferredTier: "balanced",
		defaultThinking: "medium",
	},
	research: {
		preferredTier: "balanced",
		defaultThinking: "medium",
	},
	implementation: {
		preferredTier: "balanced",
		defaultThinking: "medium",
	},
	debugging: {
		preferredTier: "premium",
		defaultThinking: "high",
	},
	design: {
		preferredTier: "premium",
		defaultThinking: "high",
		preferredProviders: ["anthropic"],
		fallbackGroup: "design-premium",
	},
	architecture: {
		preferredTier: "peak",
		defaultThinking: "xhigh",
		preferredProviders: ["openai"],
		fallbackGroup: "peak-reasoning",
	},
	review: {
		preferredTier: "balanced",
		defaultThinking: "medium",
	},
	refactor: {
		preferredTier: "premium",
		defaultThinking: "high",
	},
	autonomous: {
		preferredTier: "peak",
		defaultThinking: "xhigh",
		fallbackGroup: "peak-reasoning",
	},
};

export const DEFAULT_FALLBACK_GROUPS: Record<string, FallbackGroupPolicy> = {
	"cheap-router": {
		candidates: ["google/gemini-2.5-flash", "openai/gpt-5-mini"],
		description: "Low-cost classifier and quick-turn routing pool.",
	},
	"design-premium": {
		candidates: ["anthropic/claude-opus-4.6", "openai/gpt-5.4"],
		description: "Premium design-focused routing pool.",
	},
	"peak-reasoning": {
		candidates: ["openai/gpt-5.4", "anthropic/claude-opus-4.6", "cursor-agent/<best-available>"],
		description: "Peak reasoning pool with premium cross-provider fallbacks.",
	},
};

export const DEFAULT_ADAPTIVE_ROUTING_CONFIG: AdaptiveRoutingConfig = {
	mode: "off",
	routerModels: ["google/gemini-2.5-flash", "openai/gpt-5-mini"],
	stickyTurns: 1,
	telemetry: {
		mode: "local",
		privacy: "minimal",
	},
	models: {
		ranked: [],
		excluded: [],
	},
	intents: DEFAULT_INTENT_POLICIES,
	taskClasses: {
		quick: {
			defaultThinking: "minimal",
			candidates: ["google/gemini-2.5-flash", "openai/gpt-5-mini"],
			fallbackGroup: "cheap-router",
		},
		"design-premium": {
			defaultThinking: "high",
			candidates: ["anthropic/claude-opus-4.6", "openai/gpt-5.4"],
			fallbackGroup: "design-premium",
		},
		peak: {
			defaultThinking: "xhigh",
			candidates: ["openai/gpt-5.4", "anthropic/claude-opus-4.6", "cursor-agent/<best-available>"],
			fallbackGroup: "peak-reasoning",
		},
	},
	providerReserves: {
		openai: { minRemainingPct: 15, applyToTiers: ["premium", "peak"], allowOverrideForPeak: true },
		anthropic: { minRemainingPct: 15, applyToTiers: ["premium", "peak"], allowOverrideForPeak: true },
		"cursor-agent": {
			minRemainingPct: 20,
			applyToTiers: ["premium", "peak"],
			allowOverrideForPeak: true,
			confidence: "estimated",
		},
	},
	fallbackGroups: DEFAULT_FALLBACK_GROUPS,
};
