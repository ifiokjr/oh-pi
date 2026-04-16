import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import {
	mergeDelegatedSelectionPolicies,
	selectDelegatedModel,
	type DelegatedAvailableModel,
	type DelegatedSelectionLatencySnapshot,
	type DelegatedSelectionPolicy,
	type DelegatedSelectionResult,
	type DelegatedSelectionUsageSnapshot,
} from "@ifi/oh-pi-core";
import { readAdaptiveRoutingConfig } from "./config.js";
import type { AdaptiveRoutingConfig, DelegatedTaskProfile } from "./types.js";

export type DelegatedAvailableModelRef = {
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
};

export type DelegatedSelectionPolicyDefaults = {
	taskProfile?: DelegatedTaskProfile;
	preferFastModels?: boolean;
	minContextWindow?: number;
	allowSmallContextForSmallTasks?: boolean;
};

export type DelegatedSelectionInspection = {
	config: AdaptiveRoutingConfig;
	policy?: DelegatedSelectionPolicy;
	selection?: DelegatedSelectionResult;
	usage?: Record<string, DelegatedSelectionUsageSnapshot>;
	latency?: Record<string, DelegatedSelectionLatencySnapshot>;
};

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
	return (group?.candidates ?? []).filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

export function readDelegatedSelectionUsageSnapshot(): Record<string, DelegatedSelectionUsageSnapshot> | undefined {
	const cachePath = getUsageTrackerRateLimitCachePath();
	if (!existsSync(cachePath)) {
		return undefined;
	}

	try {
		const raw = JSON.parse(readFileSync(cachePath, "utf-8")) as { providers?: Record<string, unknown> };
		if (!raw.providers || typeof raw.providers !== "object") {
			return undefined;
		}

		const usage: Record<string, DelegatedSelectionUsageSnapshot> = {};
		for (const [provider, value] of Object.entries(raw.providers)) {
			if (!value || typeof value !== "object") {
				continue;
			}

			const candidate = value as {
				windows?: Array<{ percentLeft?: unknown }>;
				error?: unknown;
			};
			const percentages = Array.isArray(candidate.windows)
				? candidate.windows
						.map((window) => Number(window?.percentLeft))
						.filter((percent): percent is number => Number.isFinite(percent))
				: [];
			const remainingPct = percentages.length > 0 ? Math.min(...percentages) : undefined;
			usage[provider] = {
				remainingPct,
				confidence: candidate.error ? "unknown" : remainingPct == null ? "unknown" : "estimated",
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
		const raw = JSON.parse(readFileSync(aggregatesPath, "utf-8")) as {
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
		provider: model.provider,
		id: model.id,
		name: model.name ?? model.id,
		reasoning: model.reasoning ?? false,
		input: model.input ? [...model.input] : ["text"],
		contextWindow: model.contextWindow ?? 128_000,
		maxTokens: model.maxTokens ?? 16_384,
		cost: model.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
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

	if (!(candidateModels.length > 0 || categoryPolicy || blockedProviders.length > 0 || blockedModels.length > 0 || taskProfile)) {
		return undefined;
	}

	return {
		candidateModels: candidateModels.length > 0 ? candidateModels : undefined,
		preferredProviders: categoryPolicy?.preferredProviders,
		blockedProviders: blockedProviders.length > 0 ? blockedProviders : undefined,
		blockedModels: blockedModels.length > 0 ? blockedModels : undefined,
		taskProfile: taskProfile ?? "all",
		preferFastModels,
		preferLowCost: categoryPolicy?.preferLowCost,
		preferLowerUsage: selectionConfig.preferLowerUsage,
		requireReasoning: categoryPolicy?.requireReasoning,
		requireMultimodal: categoryPolicy?.requireMultimodal,
		minContextWindow,
		allowSmallContextForSmallTasks,
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
		config,
		category: params.category,
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
		config: params.config,
		category: params.category,
		roleKeys: params.roleKeys,
		defaults: params.defaults,
	});
	const usage = params.usage ?? readDelegatedSelectionUsageSnapshot();
	const latency = params.latency ?? readDelegatedSelectionLatencySnapshot();
	if (!policy) {
		return { config, policy, usage, latency };
	}

	return {
		config,
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
		latency,
	};
}
