/* C8 ignore file */
import { mergeDelegatedSelectionPolicies, selectDelegatedModel } from "@ifi/oh-pi-core";
import type {
	DelegatedAvailableModel,
	DelegatedSelectionLatencySnapshot,
	DelegatedSelectionPolicy,
	DelegatedSelectionResult,
	DelegatedSelectionUsageSnapshot,
} from "@ifi/oh-pi-core";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readAdaptiveRoutingConfig } from "./config.js";
import type { AdaptiveRoutingConfig, DelegatedTaskProfile } from "./types.js";

export interface DelegatedAvailableModelRef {
	provider: string;
	id: string;
	fullId: string;
	name?: string;
	reasoning?: boolean;
	input?: ("text" | "image")[];
	contextWindow?: number;
	maxTokens?: number;
	cost?: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
}

export interface DelegatedSelectionPolicyDefaults {
	taskProfile?: DelegatedTaskProfile;
	preferFastModels?: boolean;
	minContextWindow?: number;
	allowSmallContextForSmallTasks?: boolean;
}

export interface DelegatedSelectionInspection {
	config: AdaptiveRoutingConfig;
	policy?: DelegatedSelectionPolicy;
	selection?: DelegatedSelectionResult;
	usage?: Record<string, DelegatedSelectionUsageSnapshot>;
	latency?: Record<string, DelegatedSelectionLatencySnapshot>;
}

function getUsageTrackerRateLimitCachePath(): string {
	return join(getAgentDir(), "usage-tracker-rate-limits.json");
}

function getAdaptiveRoutingAggregatesPath(): string {
	return join(getAgentDir(), "adaptive-routing", "aggregates.json");
}

function fallbackCandidates(config: AdaptiveRoutingConfig, fallbackGroup: string | undefined): string[] {
	if (!fallbackGroup) {
		return [];
	}
	const group = config.fallbackGroups[fallbackGroup];
	return (group?.candidates ?? []).filter(
		(entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
	);
}

export function readDelegatedSelectionUsageSnapshot(): Record<string, DelegatedSelectionUsageSnapshot> | undefined {
	const cachePath = getUsageTrackerRateLimitCachePath();
	if (!existsSync(cachePath)) {
		return undefined;
	}

	try {
		const raw = JSON.parse(readFileSync(cachePath, "utf8")) as {
			providers?: Record<string, unknown>;
		};
		if (!raw.providers || typeof raw.providers !== "object") {
			return undefined;
		}

		const usage: Record<string, DelegatedSelectionUsageSnapshot> = {};
		for (const [provider, value] of Object.entries(raw.providers)) {
			if (!value || typeof value !== "object") {
				continue;
			}

			const candidate = value as {
				windows?: { percentLeft?: unknown }[];
				error?: unknown;
			};
			const percentages = Array.isArray(candidate.windows)
				? candidate.windows
						.map((window) => Number(window?.percentLeft))
						.filter((percent): percent is number => Number.isFinite(percent))
				: [];
			const remainingPct = percentages.length > 0 ? Math.min(...percentages) : undefined;
			usage[provider] = {
				confidence: candidate.error ? "unknown" : remainingPct == null ? "unknown" : "estimated",
				remainingPct,
			};
		}

		return Object.keys(usage).length > 0 ? usage : undefined;
	} catch {
		return undefined;
	}
}

export function readDelegatedSelectionLatencySnapshot(): Record<string, DelegatedSelectionLatencySnapshot> | undefined {
	const aggregatesPath = getAdaptiveRoutingAggregatesPath();
	if (!existsSync(aggregatesPath)) {
		return undefined;
	}

	try {
		const raw = JSON.parse(readFileSync(aggregatesPath, "utf8")) as {
			perModelLatencyMs?: Record<string, { avgMs?: unknown; count?: unknown }>;
		};
		if (!raw.perModelLatencyMs || typeof raw.perModelLatencyMs !== "object") {
			return undefined;
		}

		const latency: Record<string, DelegatedSelectionLatencySnapshot> = {};
		for (const [model, value] of Object.entries(raw.perModelLatencyMs)) {
			const avgMs = Number(value?.avgMs);
			const count = Number(value?.count);
			if (!Number.isFinite(avgMs) || avgMs <= 0) {
				continue;
			}
			latency[model] = {
				avgMs,
				count: Number.isFinite(count) && count > 0 ? count : undefined,
			};
		}

		return Object.keys(latency).length > 0 ? latency : undefined;
	} catch {
		return undefined;
	}
}

export function toDelegatedAvailableModels(models: DelegatedAvailableModelRef[]): DelegatedAvailableModel[] {
	return models.map((model) => ({
		contextWindow: model.contextWindow ?? 128_000,
		cost: model.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		id: model.id,
		input: model.input ? [...model.input] : ["text"],
		maxTokens: model.maxTokens ?? 16_384,
		name: model.name ?? model.id,
		provider: model.provider,
		reasoning: model.reasoning ?? false,
	}));
}

export function resolveDelegatedSelectionOverride(
	config: AdaptiveRoutingConfig,
	roleKeys: string[],
): DelegatedSelectionPolicy | undefined {
	let merged: DelegatedSelectionPolicy | undefined;
	for (const key of roleKeys) {
		merged = mergeDelegatedSelectionPolicies(merged, config.delegatedModelSelection.roleOverrides[key]);
	}
	return merged;
}

export function buildDelegatedSelectionBasePolicy(params: {
	config: AdaptiveRoutingConfig;
	category?: string;
	defaults?: DelegatedSelectionPolicyDefaults;
}): DelegatedSelectionPolicy | undefined {
	const { config, category, defaults } = params;
	const categoryPolicy = category ? config.delegatedRouting.categories[category] : undefined;
	const selectionConfig = config.delegatedModelSelection;
	const blockedProviders = [...selectionConfig.disabledProviders];
	const blockedModels = [...selectionConfig.disabledModels];
	const candidateModels = categoryPolicy
		? [...(categoryPolicy.candidates ?? []), ...fallbackCandidates(config, categoryPolicy.fallbackGroup)]
		: [];
	const taskProfile = categoryPolicy?.taskProfile ?? defaults?.taskProfile;
	const preferFastModels = categoryPolicy?.preferFastModels ?? defaults?.preferFastModels;
	const minContextWindow = categoryPolicy?.minContextWindow ?? defaults?.minContextWindow;
	const allowSmallContextForSmallTasks =
		categoryPolicy?.allowSmallContextForSmallTasks ??
		defaults?.allowSmallContextForSmallTasks ??
		selectionConfig.allowSmallContextForSmallTasks;

	if (
		!(
			candidateModels.length > 0 ||
			categoryPolicy ||
			blockedProviders.length > 0 ||
			blockedModels.length > 0 ||
			taskProfile
		)
	) {
		return undefined;
	}

	return {
		allowSmallContextForSmallTasks,
		blockedModels: blockedModels.length > 0 ? blockedModels : undefined,
		blockedProviders: blockedProviders.length > 0 ? blockedProviders : undefined,
		candidateModels: candidateModels.length > 0 ? candidateModels : undefined,
		minContextWindow,
		preferFastModels,
		preferLowCost: categoryPolicy?.preferLowCost,
		preferLowerUsage: selectionConfig.preferLowerUsage,
		preferredProviders: categoryPolicy?.preferredProviders,
		requireMultimodal: categoryPolicy?.requireMultimodal,
		requireReasoning: categoryPolicy?.requireReasoning,
		taskProfile: taskProfile ?? "all",
	};
}

export function buildDelegatedSelectionPolicy(params: {
	config?: AdaptiveRoutingConfig;
	category?: string;
	roleKeys?: string[];
	defaults?: DelegatedSelectionPolicyDefaults;
}): { config: AdaptiveRoutingConfig; policy?: DelegatedSelectionPolicy } {
	const config = params.config ?? readAdaptiveRoutingConfig();
	if (config.delegatedRouting.enabled === false) {
		return { config, policy: undefined };
	}

	const basePolicy = buildDelegatedSelectionBasePolicy({
		category: params.category,
		config,
		defaults: params.defaults,
	});
	const override = resolveDelegatedSelectionOverride(config, params.roleKeys ?? []);
	return {
		config,
		policy: mergeDelegatedSelectionPolicies(basePolicy, override),
	};
}

export function inspectDelegatedSelection(params: {
	config?: AdaptiveRoutingConfig;
	availableModels: DelegatedAvailableModelRef[];
	category?: string;
	roleKeys?: string[];
	defaults?: DelegatedSelectionPolicyDefaults;
	currentModel?: string;
	taskText?: string;
	usage?: Record<string, DelegatedSelectionUsageSnapshot>;
	latency?: Record<string, DelegatedSelectionLatencySnapshot>;
}): DelegatedSelectionInspection {
	const { config, policy } = buildDelegatedSelectionPolicy({
		category: params.category,
		config: params.config,
		defaults: params.defaults,
		roleKeys: params.roleKeys,
	});
	const usage = params.usage ?? readDelegatedSelectionUsageSnapshot();
	const latency = params.latency ?? readDelegatedSelectionLatencySnapshot();
	if (!policy) {
		return { config, latency, policy, usage };
	}

	return {
		config,
		latency,
		policy,
		selection: selectDelegatedModel({
			availableModels: toDelegatedAvailableModels(params.availableModels),
			currentModel: params.currentModel,
			policy,
			taskText: params.taskText,
			usage,
			latency,
		}),
		usage,
	};
}
