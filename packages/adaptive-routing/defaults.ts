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
	architecture: {
		defaultThinking: "xhigh",
		fallbackGroup: "peak-reasoning",
		preferredProviders: ["openai"],
		preferredTier: "peak",
	},
	autonomous: {
		defaultThinking: "xhigh",
		fallbackGroup: "peak-reasoning",
		preferredTier: "peak",
	},
	debugging: {
		defaultThinking: "high",
		preferredTier: "premium",
	},
	design: {
		defaultThinking: "high",
		fallbackGroup: "design-premium",
		preferredProviders: ["openai", "ollama-cloud", "ollama"],
		preferredTier: "premium",
	},
	implementation: {
		defaultThinking: "medium",
		preferredTier: "balanced",
	},
	planning: {
		defaultThinking: "medium",
		preferredTier: "balanced",
	},
	"quick-qna": {
		defaultThinking: "minimal",
		fallbackGroup: "cheap-router",
		preferredTier: "cheap",
	},
	refactor: {
		defaultThinking: "high",
		preferredTier: "premium",
	},
	research: {
		defaultThinking: "medium",
		preferredTier: "balanced",
	},
	review: {
		defaultThinking: "medium",
		preferredTier: "balanced",
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
		candidates: [
			"openai/gpt-5.4",
			"ollama-cloud/qwen3-next:80b",
			"ollama-cloud/gpt-oss:120b",
			"cursor-agent/<best-available>",
		],
		description: "Peak reasoning pool with open-source and premium cross-provider fallbacks.",
	},
};

export const DEFAULT_ADAPTIVE_ROUTING_CONFIG: AdaptiveRoutingConfig = {
	delegatedModelSelection: {
		allowSmallContextForSmallTasks: true,
		disabledModels: [],
		disabledProviders: [],
		preferLowerUsage: true,
		roleOverrides: {},
	},
	delegatedRouting: {
		categories: {
			"implementation-default": {
				defaultThinking: "medium",
				minContextWindow: 64000,
				preferredProviders: ["openai", "ollama-cloud", "ollama", "groq"],
				taskProfile: "coding",
			},
			"multimodal-default": {
				defaultThinking: "medium",
				minContextWindow: 128000,
				preferredProviders: ["ollama-cloud", "ollama", "openai", "groq"],
				requireMultimodal: true,
				taskProfile: "design",
			},
			"planning-default": {
				defaultThinking: "medium",
				minContextWindow: 64000,
				preferredProviders: ["openai", "ollama-cloud", "ollama", "groq"],
				taskProfile: "planning",
			},
			"quick-discovery": {
				allowSmallContextForSmallTasks: true,
				defaultThinking: "minimal",
				fallbackGroup: "cheap-router",
				preferFastModels: true,
				preferredProviders: ["groq", "ollama-cloud", "ollama", "openai"],
				taskProfile: "planning",
			},
			"research-default": {
				defaultThinking: "medium",
				preferredProviders: ["openai", "groq", "ollama-cloud", "ollama"],
				taskProfile: "planning",
			},
			"review-critical": {
				defaultThinking: "high",
				fallbackGroup: "peak-reasoning",
				minContextWindow: 128000,
				preferredProviders: ["openai", "ollama-cloud", "ollama", "groq"],
				requireReasoning: true,
				taskProfile: "planning",
			},
			"visual-engineering": {
				defaultThinking: "high",
				fallbackGroup: "design-premium",
				minContextWindow: 128000,
				preferredProviders: ["ollama-cloud", "ollama", "openai", "groq"],
				taskProfile: "design",
			},
		},
		enabled: true,
	},
	fallbackGroups: DEFAULT_FALLBACK_GROUPS,
	intents: DEFAULT_INTENT_POLICIES,
	mode: "off",
	models: {
		excluded: [],
		ranked: [],
	},
	providerReserves: {
		"cursor-agent": {
			allowOverrideForPeak: true,
			applyToTiers: ["premium", "peak"],
			confidence: "estimated",
			minRemainingPct: 20,
		},
		groq: { allowOverrideForPeak: false, applyToTiers: ["cheap", "balanced"], minRemainingPct: 10 },
		openai: { allowOverrideForPeak: true, applyToTiers: ["premium", "peak"], minRemainingPct: 15 },
	},
	routerModels: ["openai/gpt-5-mini", "groq/llama-3.3-70b-versatile", "ollama-cloud/gpt-oss:20b"],
	stickyTurns: 1,
	taskClasses: {
		"design-premium": {
			candidates: ["openai/gpt-5.4", "ollama-cloud/qwen3-coder-next", "ollama-cloud/qwen3.5:397b"],
			defaultThinking: "high",
			fallbackGroup: "design-premium",
		},
		peak: {
			candidates: [
				"openai/gpt-5.4",
				"ollama-cloud/qwen3-next:80b",
				"ollama-cloud/gpt-oss:120b",
				"cursor-agent/<best-available>",
			],
			defaultThinking: "xhigh",
			fallbackGroup: "peak-reasoning",
		},
		quick: {
			candidates: ["openai/gpt-5-mini", "groq/llama-3.3-70b-versatile", "ollama-cloud/gpt-oss:20b"],
			defaultThinking: "minimal",
			fallbackGroup: "cheap-router",
		},
	},
	telemetry: {
		mode: "local",
		privacy: "minimal",
	},
};
