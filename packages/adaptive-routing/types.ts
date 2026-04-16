import type { Api, Model } from "@mariozechner/pi-ai";

export type AdaptiveRoutingMode = "off" | "shadow" | "auto";
export type AdaptiveRoutingTelemetryMode = "off" | "local" | "export";
export type AdaptiveRoutingPrivacyLevel = "minimal" | "redacted" | "full-local";
export type QuotaConfidence = "authoritative" | "estimated" | "unknown";

export type RouteIntent =
	| "quick-qna"
	| "planning"
	| "research"
	| "implementation"
	| "debugging"
	| "design"
	| "architecture"
	| "review"
	| "refactor"
	| "autonomous";

export type RouteComplexity = 1 | 2 | 3 | 4 | 5;
export type RouteRisk = "low" | "medium" | "high";
export type RouteExpectedTurns = "one" | "few" | "many";
export type RouteToolIntensity = "low" | "medium" | "high";
export type RouteContextBreadth = "small" | "medium" | "large";
export type RouteTier = "cheap" | "balanced" | "premium" | "peak";
export type RouteThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type RouteFeedbackCategory =
	| "good"
	| "bad"
	| "wrong-intent"
	| "overkill"
	| "underpowered"
	| "wrong-provider"
	| "wrong-thinking";

export interface AdaptiveRoutingTelemetryConfig {
	mode: AdaptiveRoutingTelemetryMode;
	privacy: AdaptiveRoutingPrivacyLevel;
}

export interface AdaptiveRoutingModelPreferences {
	ranked: string[];
	excluded: string[];
}

export interface IntentRoutingPolicy {
	preferredModels?: string[];
	preferredProviders?: string[];
	defaultThinking?: RouteThinkingLevel;
	preferredTier?: RouteTier;
	fallbackGroup?: string;
}

export interface TaskClassPolicy {
	defaultThinking: RouteThinkingLevel;
	candidates: string[];
	fallbackGroup?: string;
}

export interface ProviderReservePolicy {
	minRemainingPct: number;
	applyToTiers?: RouteTier[];
	allowOverrideForPeak?: boolean;
	confidence?: QuotaConfidence;
}

export interface FallbackGroupPolicy {
	candidates: string[];
	description?: string;
}

export type DelegatedTaskProfile = "design" | "planning" | "writing" | "coding" | "all";

export interface DelegatedSelectionOverride {
	candidateModels?: string[];
	preferredModels?: string[];
	preferredProviders?: string[];
	blockedModels?: string[];
	blockedProviders?: string[];
	taskProfile?: DelegatedTaskProfile;
	preferFastModels?: boolean;
	preferLowCost?: boolean;
	preferLowerUsage?: boolean;
	requireReasoning?: boolean;
	requireMultimodal?: boolean;
	minContextWindow?: number;
	allowSmallContextForSmallTasks?: boolean;
}

export interface DelegatedCategoryPolicy {
	candidates?: string[];
	preferredProviders?: string[];
	fallbackGroup?: string;
	defaultThinking?: RouteThinkingLevel;
	taskProfile?: DelegatedTaskProfile;
	preferFastModels?: boolean;
	preferLowCost?: boolean;
	requireReasoning?: boolean;
	requireMultimodal?: boolean;
	minContextWindow?: number;
	allowSmallContextForSmallTasks?: boolean;
}

export interface DelegatedRoutingConfig {
	enabled: boolean;
	categories: Record<string, DelegatedCategoryPolicy>;
}

export interface DelegatedModelSelectionConfig {
	disabledProviders: string[];
	disabledModels: string[];
	preferLowerUsage: boolean;
	allowSmallContextForSmallTasks: boolean;
	roleOverrides: Record<string, DelegatedSelectionOverride>;
}

export interface AdaptiveRoutingConfig {
	mode: AdaptiveRoutingMode;
	routerModels: string[];
	stickyTurns: number;
	telemetry: AdaptiveRoutingTelemetryConfig;
	models: AdaptiveRoutingModelPreferences;
	intents: Partial<Record<RouteIntent, IntentRoutingPolicy>>;
	taskClasses: Record<string, TaskClassPolicy>;
	providerReserves: Partial<Record<string, ProviderReservePolicy>>;
	fallbackGroups: Record<string, FallbackGroupPolicy>;
	delegatedRouting: DelegatedRoutingConfig;
	delegatedModelSelection: DelegatedModelSelectionConfig;
}

export interface PromptRouteClassification {
	intent: RouteIntent;
	complexity: RouteComplexity;
	risk: RouteRisk;
	expectedTurns: RouteExpectedTurns;
	toolIntensity: RouteToolIntensity;
	contextBreadth: RouteContextBreadth;
	recommendedTier: RouteTier;
	recommendedThinking: RouteThinkingLevel;
	confidence: number;
	reason: string;
	classifierModel?: string;
	classifierMode?: "heuristic" | "llm";
}

export interface RouteCandidateScore {
	model: string;
	score: number;
	reasons: string[];
}

export interface RouteQuotaSnapshot {
	confidence: QuotaConfidence;
	remainingPct?: number;
}

export interface RouteExplanation {
	summary: string;
	codes: AdaptiveRoutingExplanationCode[];
	classification?: PromptRouteClassification;
	clampedThinking?: {
		requested: RouteThinkingLevel;
		applied: RouteThinkingLevel;
	};
	quota?: Record<string, RouteQuotaSnapshot>;
	candidates?: RouteCandidateScore[];
}

export interface RouteDecision {
	id?: string;
	selectedModel: string;
	selectedThinking: RouteThinkingLevel;
	fallbacks: string[];
	explanation: RouteExplanation;
}

export interface RouteLock {
	model: string;
	thinking: RouteThinkingLevel;
	setAt: number;
}

export interface AdaptiveRoutingState {
	mode?: AdaptiveRoutingMode;
	lock?: RouteLock;
	lastDecision?: RouteDecision;
}

export interface ProviderUsageState {
	providers: Record<
		string,
		{
			confidence: QuotaConfidence;
			remainingPct?: number;
		}
	>;
	sessionCost?: number;
	rolling30dCost?: number;
	perModel?: Record<string, unknown>;
	perSource?: Record<string, unknown>;
	updatedAt: number;
}

export interface NormalizedRouteCandidate {
	fullId: string;
	provider: string;
	modelId: string;
	label: string;
	reasoning: boolean;
	maxThinkingLevel: RouteThinkingLevel;
	tier: RouteTier;
	contextWindow?: number;
	maxTokens?: number;
	input: ("text" | "image")[];
	costKnown: boolean;
	tags: string[];
	family?: string;
	fallbackGroups: string[];
	available: boolean;
	authenticated: boolean;
	model: Model<Api>;
}

export type AdaptiveRoutingExplanationCode =
	| "intent_design_bias"
	| "intent_architecture_bias"
	| "premium_allowed"
	| "premium_reserved"
	| "quota_low"
	| "quota_unknown"
	| "thinking_clamped"
	| "current_model_sticky"
	| "fallback_group_applied"
	| "manual_lock_applied"
	| "shadow_disagreement"
	| "classifier_fallback";

interface TelemetryEventBase {
	type: string;
	timestamp: number;
	decisionId?: string;
	sessionId?: string;
	promptHash?: string;
}

export interface RouteDecisionTelemetryEvent extends TelemetryEventBase {
	type: "route_decision";
	mode: AdaptiveRoutingMode;
	selected: {
		model: string;
		thinking: RouteThinkingLevel;
	};
	fallbacks: string[];
	classifier?: PromptRouteClassification;
	quota?: Record<string, RouteQuotaSnapshot>;
	candidates?: RouteCandidateScore[];
	explanationCodes: AdaptiveRoutingExplanationCode[];
}

export interface RouteOverrideTelemetryEvent extends TelemetryEventBase {
	type: "route_override";
	from: {
		model: string;
		thinking: RouteThinkingLevel;
	};
	to: {
		model: string;
		thinking: RouteThinkingLevel;
	};
	reason: "manual" | "lock" | "shadow-disagreement";
}

export interface RouteFeedbackTelemetryEvent extends TelemetryEventBase {
	type: "route_feedback";
	category: RouteFeedbackCategory;
}

export interface RouteOutcomeTelemetryEvent extends TelemetryEventBase {
	type: "route_outcome";
	selectedModel?: string;
	turnCount: number;
	completed: boolean;
	userOverrideOccurred: boolean;
	durationMs?: number;
}

export interface RouteShadowDisagreementTelemetryEvent extends TelemetryEventBase {
	type: "route_shadow_disagreement";
	suggested: {
		model: string;
		thinking: RouteThinkingLevel;
	};
	actual: {
		model: string | null;
		thinking: RouteThinkingLevel;
	};
}

export type AdaptiveRoutingTelemetryEvent =
	| RouteDecisionTelemetryEvent
	| RouteOverrideTelemetryEvent
	| RouteFeedbackTelemetryEvent
	| RouteOutcomeTelemetryEvent
	| RouteShadowDisagreementTelemetryEvent;

export interface AdaptiveRoutingStats {
	decisions: number;
	feedback: Partial<Record<RouteFeedbackCategory, number>>;
	overrides: number;
	shadowDisagreements: number;
	lastDecisionAt?: number;
	outcomes: number;
	avgDurationMs?: number;
	perModelLatencyMs: Record<string, { count: number; avgMs: number }>;
}
