import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type DelegatedAvailableModel,
	type DelegatedSelectionLatencySnapshot,
	type DelegatedSelectionPolicy,
	type DelegatedSelectionUsageSnapshot,
	type ModelTaskProfile,
	mergeDelegatedSelectionPolicies,
	selectDelegatedModel,
} from "@ifi/oh-pi-core";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import type { AntCaste, WorkerClass } from "./types.js";

export type AvailableModelRef = {
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

type DelegatedCategoryPolicy = {
	candidates?: string[];
	preferredProviders?: string[];
	fallbackGroup?: string;
	taskProfile?: ModelTaskProfile;
	preferFastModels?: boolean;
	preferLowCost?: boolean;
	requireReasoning?: boolean;
	requireMultimodal?: boolean;
	minContextWindow?: number;
	allowSmallContextForSmallTasks?: boolean;
};

type DelegatedModelSelectionConfig = {
	disabledProviders?: string[];
	excludedProviders?: string[];
	disabledModels?: string[];
	excludedModels?: string[];
	preferLowerUsage?: boolean;
	allowSmallContextForSmallTasks?: boolean;
	roleOverrides?: Record<string, DelegatedSelectionPolicy>;
};

type AdaptiveRoutingConfig = {
	fallbackGroups?: Record<string, { candidates?: string[] } | string[]>;
	delegatedRouting?: {
		enabled?: boolean;
		categories?: Record<string, DelegatedCategoryPolicy>;
	};
	delegatedModelSelection?: DelegatedModelSelectionConfig;
};

export const DEFAULT_COLONY_CATEGORIES: Record<AntCaste | WorkerClass, string> = {
	scout: "quick-discovery",
	worker: "implementation-default",
	soldier: "review-critical",
	drone: "implementation-default",
	design: "visual-engineering",
	multimodal: "multimodal-default",
	backend: "implementation-default",
	review: "review-critical",
};

const DEFAULT_CATEGORY_TASK_PROFILES: Record<string, ModelTaskProfile> = {
	"quick-discovery": "planning",
	"implementation-default": "coding",
	"review-critical": "planning",
	"visual-engineering": "design",
	"multimodal-default": "design",
};

const DEFAULT_CATEGORY_MIN_CONTEXT: Partial<Record<string, number>> = {
	"review-critical": 128_000,
	"visual-engineering": 128_000,
	"multimodal-default": 128_000,
};

function getAdaptiveRoutingConfigPath(): string {
	return join(getAgentDir(), "extensions", "adaptive-routing", "config.json");
}

function getAdaptiveRoutingAggregatesPath(): string {
	return join(getAgentDir(), "adaptive-routing", "aggregates.json");
}

function readAdaptiveRoutingConfig(): AdaptiveRoutingConfig {
	const configPath = getAdaptiveRoutingConfigPath();
	if (!existsSync(configPath)) {
		return {};
	}
	try {
		return JSON.parse(readFileSync(configPath, "utf-8")) as AdaptiveRoutingConfig;
	} catch {
		return {};
	}
}

function fallbackCandidates(config: AdaptiveRoutingConfig, fallbackGroup: string | undefined): string[] {
	if (!fallbackGroup) {
		return [];
	}
	const group = config.fallbackGroups?.[fallbackGroup];
	if (Array.isArray(group)) {
		return group.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
	}
	return (group?.candidates ?? []).filter(
		(entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
	);
}

function readMeasuredLatencySnapshot(): Record<string, DelegatedSelectionLatencySnapshot> | undefined {
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

function buildBasePolicy(
	category: string | undefined,
	config: AdaptiveRoutingConfig,
): DelegatedSelectionPolicy | undefined {
	const categoryPolicy = category ? config.delegatedRouting?.categories?.[category] : undefined;
	const selectionConfig = config.delegatedModelSelection;
	const blockedProviders = [
		...(selectionConfig?.disabledProviders ?? []),
		...(selectionConfig?.excludedProviders ?? []),
	];
	const blockedModels = [...(selectionConfig?.disabledModels ?? []), ...(selectionConfig?.excludedModels ?? [])];
	const candidateModels = categoryPolicy
		? [...(categoryPolicy.candidates ?? []), ...fallbackCandidates(config, categoryPolicy.fallbackGroup)]
		: [];

	if (!(candidateModels.length > 0 || categoryPolicy || blockedProviders.length > 0 || blockedModels.length > 0)) {
		return category
			? {
					taskProfile: DEFAULT_CATEGORY_TASK_PROFILES[category] ?? "all",
					preferLowerUsage: selectionConfig?.preferLowerUsage ?? true,
					allowSmallContextForSmallTasks: selectionConfig?.allowSmallContextForSmallTasks ?? true,
				}
			: undefined;
	}

	return {
		candidateModels: candidateModels.length > 0 ? candidateModels : undefined,
		preferredProviders: categoryPolicy?.preferredProviders,
		blockedProviders: blockedProviders.length > 0 ? blockedProviders : undefined,
		blockedModels: blockedModels.length > 0 ? blockedModels : undefined,
		taskProfile: category ? (categoryPolicy?.taskProfile ?? DEFAULT_CATEGORY_TASK_PROFILES[category] ?? "all") : "all",
		preferFastModels: categoryPolicy?.preferFastModels ?? category === "quick-discovery",
		preferLowCost: categoryPolicy?.preferLowCost,
		preferLowerUsage: selectionConfig?.preferLowerUsage ?? true,
		requireReasoning: categoryPolicy?.requireReasoning,
		requireMultimodal: categoryPolicy?.requireMultimodal,
		minContextWindow:
			categoryPolicy?.minContextWindow ?? (category ? DEFAULT_CATEGORY_MIN_CONTEXT[category] : undefined),
		allowSmallContextForSmallTasks:
			categoryPolicy?.allowSmallContextForSmallTasks ?? selectionConfig?.allowSmallContextForSmallTasks ?? true,
	};
}

function resolveRoleOverride(config: AdaptiveRoutingConfig, roleKeys: string[]): DelegatedSelectionPolicy | undefined {
	const overrides = config.delegatedModelSelection?.roleOverrides;
	if (!overrides) {
		return undefined;
	}

	let merged: DelegatedSelectionPolicy | undefined;
	for (const key of roleKeys) {
		merged = mergeDelegatedSelectionPolicies(merged, overrides[key]);
	}
	return merged;
}

export function toAvailableModelRefs(models: DelegatedAvailableModel[]): AvailableModelRef[] {
	return models.map((model) => ({
		...model,
		fullId: `${model.provider}/${model.id}`,
	}));
}

function normalizeAvailableModels(models: AvailableModelRef[]): DelegatedAvailableModel[] {
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

export function resolveColonyCategoryModel(
	category: string | undefined,
	availableModels: AvailableModelRef[],
	options: {
		currentModel?: string;
		taskText?: string;
		usage?: Record<string, DelegatedSelectionUsageSnapshot>;
		roleKeys?: string[];
	} = {},
): { model?: string; category?: string; source: "delegated-category" | "session-default" } {
	if (!category) {
		return { source: "session-default" };
	}
	const config = readAdaptiveRoutingConfig();
	if (config.delegatedRouting?.enabled === false) {
		return { category, source: "session-default" };
	}

	const basePolicy = buildBasePolicy(category, config);
	const roleOverride = resolveRoleOverride(config, [`colony-category:${category}`, ...(options.roleKeys ?? [])]);
	const policy = mergeDelegatedSelectionPolicies(basePolicy, roleOverride);
	if (!policy) {
		return { category, source: "session-default" };
	}

	const selection = selectDelegatedModel({
		availableModels: normalizeAvailableModels(availableModels),
		currentModel: options.currentModel,
		policy,
		taskText: options.taskText,
		usage: options.usage,
		latency: readMeasuredLatencySnapshot(),
	});
	if (selection.selectedModel) {
		return { model: selection.selectedModel, category, source: "delegated-category" };
	}
	return { category, source: "session-default" };
}
