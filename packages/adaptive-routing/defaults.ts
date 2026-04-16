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
		preferredProviders: ["openai", "ollama-cloud", "ollama"],
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
		candidates: ["openai/gpt-5-mini", "groq/llama-3.3-70b-versatile", "ollama-cloud/gpt-oss:20b"],
		description: "Low-cost quick-turn pool with open-source fallbacks.",
	},
	"design-premium": {
		candidates: ["openai/gpt-5.4", "ollama-cloud/qwen3-coder-next", "ollama-cloud/qwen3.5:397b"],
		description: "Premium design-focused routing pool with strong open-model backups.",
	},
	"peak-reasoning": {
		candidates: ["openai/gpt-5.4", "ollama-cloud/qwen3-next:80b", "ollama-cloud/gpt-oss:120b", "cursor-agent/<best-available>"],
		description: "Peak reasoning pool with open-source and premium cross-provider fallbacks.",
	},
};

export const DEFAULT_ADAPTIVE_ROUTING_CONFIG: AdaptiveRoutingConfig = {
	mode: "off",
	routerModels: ["openai/gpt-5-mini", "groq/llama-3.3-70b-versatile", "ollama-cloud/gpt-oss:20b"],
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
			candidates: ["openai/gpt-5-mini", "groq/llama-3.3-70b-versatile", "ollama-cloud/gpt-oss:20b"],
			fallbackGroup: "cheap-router",
		},
		"design-premium": {
			defaultThinking: "high",
			candidates: ["openai/gpt-5.4", "ollama-cloud/qwen3-coder-next", "ollama-cloud/qwen3.5:397b"],
			fallbackGroup: "design-premium",
		},
		peak: {
			defaultThinking: "xhigh",
			candidates: ["openai/gpt-5.4", "ollama-cloud/qwen3-next:80b", "ollama-cloud/gpt-oss:120b", "cursor-agent/<best-available>"],
			fallbackGroup: "peak-reasoning",
		},
	},
	providerReserves: {
		openai: { minRemainingPct: 15, applyToTiers: ["premium", "peak"], allowOverrideForPeak: true },
		groq: { minRemainingPct: 10, applyToTiers: ["cheap", "balanced"], allowOverrideForPeak: false },
		"cursor-agent": {
			minRemainingPct: 20,
			applyToTiers: ["premium", "peak"],
			allowOverrideForPeak: true,
			confidence: "estimated",
		},
	},
	fallbackGroups: DEFAULT_FALLBACK_GROUPS,
	delegatedRouting: {
		enabled: true,
		categories: {
			"quick-discovery": {
				preferredProviders: ["groq", "ollama-cloud", "ollama", "openai"],
				fallbackGroup: "cheap-router",
				defaultThinking: "minimal",
			},
			"planning-default": {
				preferredProviders: ["openai", "ollama-cloud", "ollama", "groq"],
				defaultThinking: "medium",
			},
			"implementation-default": {
				preferredProviders: ["openai", "ollama-cloud", "ollama", "groq"],
				defaultThinking: "medium",
			},
			"research-default": {
				preferredProviders: ["openai", "groq", "ollama-cloud", "ollama"],
				defaultThinking: "medium",
			},
			"review-critical": {
				preferredProviders: ["openai", "ollama-cloud", "ollama", "groq"],
				fallbackGroup: "peak-reasoning",
				defaultThinking: "high",
			},
			"visual-engineering": {
				preferredProviders: ["ollama-cloud", "ollama", "openai", "groq"],
				fallbackGroup: "design-premium",
				defaultThinking: "high",
			},
			"multimodal-default": {
				preferredProviders: ["ollama-cloud", "ollama", "openai", "groq"],
				defaultThinking: "medium",
			},
		},
	},
};
