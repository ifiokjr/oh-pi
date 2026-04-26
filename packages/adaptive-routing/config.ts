/* C8 ignore file */
import { join } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { loadJsonConfigFile } from "./config-loader.js";
import type { NormalizedConfigResult } from "./config-loader.js";
import { DEFAULT_ADAPTIVE_ROUTING_CONFIG } from "./defaults.js";
import type {
	AdaptiveRoutingConfig,
	AdaptiveRoutingMode,
	AdaptiveRoutingModelPreferences,
	AdaptiveRoutingPrivacyLevel,
	AdaptiveRoutingTelemetryConfig,
	AdaptiveRoutingTelemetryMode,
	DelegatedCategoryPolicy,
	DelegatedModelSelectionConfig,
	DelegatedRoutingConfig,
	DelegatedSelectionOverride,
	DelegatedTaskProfile,
	FallbackGroupPolicy,
	IntentRoutingPolicy,
	ProviderReservePolicy,
	RouteIntent,
	RouteThinkingLevel,
	RouteTier,
	TaskClassPolicy,
} from "./types.js";

const ROUTE_INTENTS = new Set<RouteIntent>([
	"quick-qna",
	"planning",
	"research",
	"implementation",
	"debugging",
	"design",
	"architecture",
	"review",
	"refactor",
	"autonomous",
]);

const ROUTE_TIERS = new Set<RouteTier>(["cheap", "balanced", "premium", "peak"]);
const ROUTE_THINKING_LEVELS = new Set<RouteThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh"]);
const DELEGATED_TASK_PROFILES = new Set<DelegatedTaskProfile>(["design", "planning", "writing", "coding", "all"]);
const ROUTING_MODES = new Set<AdaptiveRoutingMode>(["off", "shadow", "auto"]);
const TELEMETRY_MODES = new Set<AdaptiveRoutingTelemetryMode>(["off", "local", "export"]);
const PRIVACY_LEVELS = new Set<AdaptiveRoutingPrivacyLevel>(["minimal", "redacted", "full-local"]);
const warnedConfigMessages = new Set<string>();

function warnAdaptiveRoutingConfig(configPath: string, message: string): void {
	const warningKey = `${configPath}:${message}`;
	if (warnedConfigMessages.has(warningKey)) {
		return;
	}
	warnedConfigMessages.add(warningKey);
	console.warn(`[adaptive-routing] ${message}`);
}

export function getAdaptiveRoutingConfigPath(): string {
	return join(getAgentDir(), "extensions", "adaptive-routing", "config.json");
}

export function readAdaptiveRoutingConfig(): AdaptiveRoutingConfig {
	const configPath = getAdaptiveRoutingConfigPath();
	return loadJsonConfigFile({
		fallback: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
		normalize: normalizeAdaptiveRoutingConfigWithWarnings,
		path: configPath,
		warn: (message) => warnAdaptiveRoutingConfig(configPath, message),
	});
}

export function normalizeAdaptiveRoutingConfig(raw: unknown): AdaptiveRoutingConfig {
	return normalizeAdaptiveRoutingConfigWithWarnings(raw).value;
}

function normalizeAdaptiveRoutingConfigWithWarnings(raw: unknown): NormalizedConfigResult<AdaptiveRoutingConfig> {
	const fallback = structuredClone(DEFAULT_ADAPTIVE_ROUTING_CONFIG);
	if (!raw || typeof raw !== "object") {
		return { value: fallback };
	}

	const cfg = raw as Record<string, unknown>;
	const warnings: string[] = [];
	return {
		value: {
			delegatedModelSelection: normalizeDelegatedModelSelection(
				cfg.delegatedModelSelection,
				fallback.delegatedModelSelection,
			),
			delegatedRouting: normalizeDelegatedRouting(cfg.delegatedRouting, fallback.delegatedRouting),
			fallbackGroups: normalizeFallbackGroups(cfg.fallbackGroups, fallback.fallbackGroups),
			intents: normalizeIntentPolicies(cfg.intents, fallback.intents),
			mode: normalizeMode(cfg.mode, fallback.mode, warnings, "mode"),
			models: normalizeModelPreferences(cfg.models, fallback.models, warnings),
			providerReserves: normalizeProviderReserves(cfg.providerReserves, fallback.providerReserves),
			routerModels: normalizeStringArray(cfg.routerModels, fallback.routerModels),
			stickyTurns: normalizeStickyTurns(cfg.stickyTurns, fallback.stickyTurns),
			taskClasses: normalizeTaskClasses(cfg.taskClasses, fallback.taskClasses),
			telemetry: normalizeTelemetryConfig(cfg.telemetry, fallback.telemetry, warnings),
		},
		warnings,
	};
}

function normalizeMode(
	value: unknown,
	fallback: AdaptiveRoutingMode,
	warnings?: string[],
	fieldName = "mode",
): AdaptiveRoutingMode {
	if (typeof value === "string" && ROUTING_MODES.has(value as AdaptiveRoutingMode)) {
		return value as AdaptiveRoutingMode;
	}
	if (value !== undefined) {
		warnings?.push(`Skipped invalid ${fieldName} value; using fallback.`);
	}
	return fallback;
}

function normalizeTelemetryConfig(
	value: unknown,
	fallback: AdaptiveRoutingTelemetryConfig,
	warnings?: string[],
): AdaptiveRoutingTelemetryConfig {
	if (!value || typeof value !== "object") {
		if (value !== undefined) {
			warnings?.push("Skipped invalid telemetry section; using fallback.");
		}
		return { ...fallback };
	}
	const cfg = value as Record<string, unknown>;
	return {
		mode:
			typeof cfg.mode === "string" && TELEMETRY_MODES.has(cfg.mode as AdaptiveRoutingTelemetryMode)
				? (cfg.mode as AdaptiveRoutingTelemetryMode)
				: fallback.mode,
		privacy:
			typeof cfg.privacy === "string" && PRIVACY_LEVELS.has(cfg.privacy as AdaptiveRoutingPrivacyLevel)
				? (cfg.privacy as AdaptiveRoutingPrivacyLevel)
				: fallback.privacy,
	};
}

function normalizeModelPreferences(
	value: unknown,
	fallback: AdaptiveRoutingModelPreferences,
	warnings?: string[],
): AdaptiveRoutingModelPreferences {
	if (!value || typeof value !== "object") {
		if (value !== undefined) {
			warnings?.push("Skipped invalid models section; using fallback.");
		}
		return { ...fallback };
	}
	const cfg = value as Record<string, unknown>;
	return {
		excluded: normalizeStringArray(cfg.excluded, fallback.excluded),
		ranked: normalizeStringArray(cfg.ranked, fallback.ranked),
	};
}

function normalizeIntentPolicies(
	value: unknown,
	fallback: AdaptiveRoutingConfig["intents"],
): AdaptiveRoutingConfig["intents"] {
	const next: AdaptiveRoutingConfig["intents"] = { ...fallback };
	if (!value || typeof value !== "object") {
		return next;
	}

	for (const [intent, policy] of Object.entries(value as Record<string, unknown>)) {
		if (!(ROUTE_INTENTS.has(intent as RouteIntent) && policy) || typeof policy !== "object") {
			continue;
		}
		next[intent as RouteIntent] = normalizeIntentPolicy(policy as Record<string, unknown>, next[intent as RouteIntent]);
	}
	return next;
}

function normalizeIntentPolicy(value: Record<string, unknown>, fallback?: IntentRoutingPolicy): IntentRoutingPolicy {
	return {
		defaultThinking: normalizeOptionalThinking(value.defaultThinking, fallback?.defaultThinking),
		fallbackGroup: normalizeOptionalString(value.fallbackGroup, fallback?.fallbackGroup),
		preferredModels: normalizeOptionalStringArray(value.preferredModels, fallback?.preferredModels),
		preferredProviders: normalizeOptionalStringArray(value.preferredProviders, fallback?.preferredProviders),
		preferredTier: normalizeOptionalTier(value.preferredTier, fallback?.preferredTier),
	};
}

function normalizeTaskClasses(
	value: unknown,
	fallback: AdaptiveRoutingConfig["taskClasses"],
): AdaptiveRoutingConfig["taskClasses"] {
	const next: AdaptiveRoutingConfig["taskClasses"] = { ...fallback };
	if (!value || typeof value !== "object") {
		return next;
	}

	for (const [taskClass, policy] of Object.entries(value as Record<string, unknown>)) {
		if (!policy || typeof policy !== "object") {
			continue;
		}
		const normalized = normalizeTaskClassPolicy(policy as Record<string, unknown>, next[taskClass]);
		if (normalized) {
			next[taskClass] = normalized;
		}
	}
	return next;
}

function normalizeTaskClassPolicy(
	value: Record<string, unknown>,
	fallback?: TaskClassPolicy,
): TaskClassPolicy | undefined {
	const defaultThinking = normalizeThinking(value.defaultThinking, fallback?.defaultThinking);
	const candidates = normalizeStringArray(value.candidates, fallback?.candidates ?? []);
	if (candidates.length === 0) {
		return fallback;
	}
	return {
		candidates,
		defaultThinking,
		fallbackGroup: normalizeOptionalString(value.fallbackGroup, fallback?.fallbackGroup),
	};
}

function normalizeProviderReserves(
	value: unknown,
	fallback: AdaptiveRoutingConfig["providerReserves"],
): AdaptiveRoutingConfig["providerReserves"] {
	const next: AdaptiveRoutingConfig["providerReserves"] = { ...fallback };
	if (!value || typeof value !== "object") {
		return next;
	}
	for (const [provider, policy] of Object.entries(value as Record<string, unknown>)) {
		if (!policy || typeof policy !== "object") {
			continue;
		}
		next[provider] = normalizeProviderReservePolicy(policy as Record<string, unknown>, next[provider]);
	}
	return next;
}

function normalizeProviderReservePolicy(
	value: Record<string, unknown>,
	fallback?: ProviderReservePolicy,
): ProviderReservePolicy {
	return {
		allowOverrideForPeak:
			typeof value.allowOverrideForPeak === "boolean"
				? value.allowOverrideForPeak
				: (fallback?.allowOverrideForPeak ?? true),
		applyToTiers: normalizeOptionalTierArray(value.applyToTiers, fallback?.applyToTiers),
		confidence:
			typeof value.confidence === "string" && ["authoritative", "estimated", "unknown"].includes(value.confidence)
				? (fallback?.confidence ?? (value.confidence as ProviderReservePolicy["confidence"]))
				: fallback?.confidence,
		minRemainingPct: normalizePercent(value.minRemainingPct, fallback?.minRemainingPct ?? 15),
	};
}

function normalizeFallbackGroups(
	value: unknown,
	fallback: AdaptiveRoutingConfig["fallbackGroups"],
): AdaptiveRoutingConfig["fallbackGroups"] {
	const next: AdaptiveRoutingConfig["fallbackGroups"] = { ...fallback };
	if (!value || typeof value !== "object") {
		return next;
	}
	for (const [groupName, policy] of Object.entries(value as Record<string, unknown>)) {
		if (!policy || typeof policy !== "object") {
			continue;
		}
		const normalized = normalizeFallbackGroupPolicy(policy as Record<string, unknown>, next[groupName]);
		if (normalized) {
			next[groupName] = normalized;
		}
	}
	return next;
}

function normalizeFallbackGroupPolicy(
	value: Record<string, unknown>,
	fallback?: FallbackGroupPolicy,
): FallbackGroupPolicy | undefined {
	const candidates = normalizeStringArray(value.candidates, fallback?.candidates ?? []);
	if (candidates.length === 0) {
		return fallback;
	}
	return {
		candidates,
		description: normalizeOptionalString(value.description, fallback?.description),
	};
}

function normalizeDelegatedRouting(value: unknown, fallback: DelegatedRoutingConfig): DelegatedRoutingConfig {
	if (!value || typeof value !== "object") {
		return {
			categories: { ...fallback.categories },
			enabled: fallback.enabled,
		};
	}
	const cfg = value as Record<string, unknown>;
	const categories = { ...fallback.categories };
	if (cfg.categories && typeof cfg.categories === "object") {
		for (const [name, rawPolicy] of Object.entries(cfg.categories as Record<string, unknown>)) {
			if (!rawPolicy || typeof rawPolicy !== "object") {
				continue;
			}
			categories[name] = normalizeDelegatedCategory(rawPolicy as Record<string, unknown>, categories[name]);
		}
	}
	return {
		categories,
		enabled: typeof cfg.enabled === "boolean" ? cfg.enabled : fallback.enabled,
	};
}

function normalizeDelegatedCategory(
	value: Record<string, unknown>,
	fallback?: DelegatedCategoryPolicy,
): DelegatedCategoryPolicy {
	return {
		allowSmallContextForSmallTasks: normalizeOptionalBoolean(
			value.allowSmallContextForSmallTasks,
			fallback?.allowSmallContextForSmallTasks,
		),
		candidates: normalizeOptionalStringArray(value.candidates, fallback?.candidates),
		defaultThinking: normalizeOptionalThinking(value.defaultThinking, fallback?.defaultThinking),
		fallbackGroup: normalizeOptionalString(value.fallbackGroup, fallback?.fallbackGroup),
		minContextWindow: normalizeOptionalMinContextWindow(value.minContextWindow, fallback?.minContextWindow),
		preferFastModels: normalizeOptionalBoolean(value.preferFastModels, fallback?.preferFastModels),
		preferLowCost: normalizeOptionalBoolean(value.preferLowCost, fallback?.preferLowCost),
		preferredProviders: normalizeOptionalStringArray(value.preferredProviders, fallback?.preferredProviders),
		requireMultimodal: normalizeOptionalBoolean(value.requireMultimodal, fallback?.requireMultimodal),
		requireReasoning: normalizeOptionalBoolean(value.requireReasoning, fallback?.requireReasoning),
		taskProfile: normalizeOptionalDelegatedTaskProfile(value.taskProfile, fallback?.taskProfile),
	};
}

function normalizeDelegatedModelSelection(
	value: unknown,
	fallback: DelegatedModelSelectionConfig,
): DelegatedModelSelectionConfig {
	if (!value || typeof value !== "object") {
		return {
			allowSmallContextForSmallTasks: fallback.allowSmallContextForSmallTasks,
			disabledModels: [...fallback.disabledModels],
			disabledProviders: [...fallback.disabledProviders],
			preferLowerUsage: fallback.preferLowerUsage,
			roleOverrides: { ...fallback.roleOverrides },
		};
	}
	const cfg = value as Record<string, unknown>;
	return {
		allowSmallContextForSmallTasks:
			typeof cfg.allowSmallContextForSmallTasks === "boolean"
				? cfg.allowSmallContextForSmallTasks
				: fallback.allowSmallContextForSmallTasks,
		disabledModels: normalizeStringArray(cfg.disabledModels ?? cfg.excludedModels, fallback.disabledModels),
		disabledProviders: normalizeStringArray(cfg.disabledProviders ?? cfg.excludedProviders, fallback.disabledProviders),
		preferLowerUsage: typeof cfg.preferLowerUsage === "boolean" ? cfg.preferLowerUsage : fallback.preferLowerUsage,
		roleOverrides: normalizeDelegatedRoleOverrides(cfg.roleOverrides, fallback.roleOverrides),
	};
}

function normalizeDelegatedRoleOverrides(
	value: unknown,
	fallback: DelegatedModelSelectionConfig["roleOverrides"],
): DelegatedModelSelectionConfig["roleOverrides"] {
	const next: DelegatedModelSelectionConfig["roleOverrides"] = { ...fallback };
	if (!value || typeof value !== "object") {
		return next;
	}
	for (const [key, rawOverride] of Object.entries(value as Record<string, unknown>)) {
		if (!rawOverride || typeof rawOverride !== "object") {
			continue;
		}
		next[key] = normalizeDelegatedSelectionOverride(rawOverride as Record<string, unknown>, next[key]);
	}
	return next;
}

function normalizeDelegatedSelectionOverride(
	value: Record<string, unknown>,
	fallback?: DelegatedSelectionOverride,
): DelegatedSelectionOverride {
	return {
		allowSmallContextForSmallTasks: normalizeOptionalBoolean(
			value.allowSmallContextForSmallTasks,
			fallback?.allowSmallContextForSmallTasks,
		),
		blockedModels: normalizeOptionalStringArray(value.blockedModels, fallback?.blockedModels),
		blockedProviders: normalizeOptionalStringArray(value.blockedProviders, fallback?.blockedProviders),
		candidateModels: normalizeOptionalStringArray(value.candidateModels, fallback?.candidateModels),
		minContextWindow: normalizeOptionalMinContextWindow(value.minContextWindow, fallback?.minContextWindow),
		preferFastModels: normalizeOptionalBoolean(value.preferFastModels, fallback?.preferFastModels),
		preferLowCost: normalizeOptionalBoolean(value.preferLowCost, fallback?.preferLowCost),
		preferLowerUsage: normalizeOptionalBoolean(value.preferLowerUsage, fallback?.preferLowerUsage),
		preferredModels: normalizeOptionalStringArray(value.preferredModels, fallback?.preferredModels),
		preferredProviders: normalizeOptionalStringArray(value.preferredProviders, fallback?.preferredProviders),
		requireMultimodal: normalizeOptionalBoolean(value.requireMultimodal, fallback?.requireMultimodal),
		requireReasoning: normalizeOptionalBoolean(value.requireReasoning, fallback?.requireReasoning),
		taskProfile: normalizeOptionalDelegatedTaskProfile(value.taskProfile, fallback?.taskProfile),
	};
}

function normalizeOptionalBoolean(value: unknown, fallback?: boolean): boolean | undefined {
	if (typeof value === "boolean") {
		return value;
	}
	return fallback;
}

function normalizeOptionalMinContextWindow(value: unknown, fallback?: number): number | undefined {
	if (value === undefined) {
		return fallback;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return Math.max(1024, Math.round(parsed));
}

function normalizeOptionalDelegatedTaskProfile(
	value: unknown,
	fallback?: DelegatedTaskProfile,
): DelegatedTaskProfile | undefined {
	if (typeof value === "string" && DELEGATED_TASK_PROFILES.has(value as DelegatedTaskProfile)) {
		return value as DelegatedTaskProfile;
	}
	return fallback;
}

function normalizeStickyTurns(value: unknown, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return Math.max(0, Math.min(20, Math.round(parsed)));
}

function normalizePercent(value: unknown, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return Math.max(0, Math.min(100, parsed));
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
	if (!Array.isArray(value)) {
		return [...fallback];
	}
	const normalized = value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter(Boolean);
	return normalized.length > 0 ? [...new Set(normalized)] : [...fallback];
}

function normalizeOptionalStringArray(value: unknown, fallback?: string[]): string[] | undefined {
	if (value === undefined) {
		return fallback ? [...fallback] : undefined;
	}
	if (!Array.isArray(value)) {
		return fallback ? [...fallback] : undefined;
	}
	const normalized = value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter(Boolean);
	return normalized.length > 0 ? [...new Set(normalized)] : undefined;
}

function normalizeOptionalString(value: unknown, fallback?: string): string | undefined {
	if (typeof value !== "string") {
		return fallback;
	}
	const trimmed = value.trim();
	return trimmed || fallback;
}

function normalizeThinking(value: unknown, fallback?: RouteThinkingLevel): RouteThinkingLevel {
	return typeof value === "string" && ROUTE_THINKING_LEVELS.has(value as RouteThinkingLevel)
		? (value as RouteThinkingLevel)
		: (fallback ?? "medium");
}

function normalizeOptionalThinking(value: unknown, fallback?: RouteThinkingLevel): RouteThinkingLevel | undefined {
	if (value === undefined) {
		return fallback;
	}
	return typeof value === "string" && ROUTE_THINKING_LEVELS.has(value as RouteThinkingLevel)
		? (value as RouteThinkingLevel)
		: fallback;
}

function normalizeOptionalTier(value: unknown, fallback?: RouteTier): RouteTier | undefined {
	if (value === undefined) {
		return fallback;
	}
	return typeof value === "string" && ROUTE_TIERS.has(value as RouteTier) ? (value as RouteTier) : fallback;
}

function normalizeOptionalTierArray(value: unknown, fallback?: RouteTier[]): RouteTier[] | undefined {
	if (value === undefined) {
		return fallback ? [...fallback] : undefined;
	}
	if (!Array.isArray(value)) {
		return fallback ? [...fallback] : undefined;
	}
	const normalized = value.filter(
		(item): item is RouteTier => typeof item === "string" && ROUTE_TIERS.has(item as RouteTier),
	);
	return normalized.length > 0 ? [...new Set(normalized)] : undefined;
}
