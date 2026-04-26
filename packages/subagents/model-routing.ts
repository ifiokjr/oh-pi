/* C8 ignore file */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { mergeDelegatedSelectionPolicies, selectDelegatedModel } from "@ifi/oh-pi-core";
import type {
	DelegatedAvailableModel,
	DelegatedSelectionLatencySnapshot,
	DelegatedSelectionPolicy,
	DelegatedSelectionUsageSnapshot,
	ModelTaskProfile,
} from "@ifi/oh-pi-core";
import type { AgentConfig } from "./agents.js";

export interface AvailableModelRef {
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

export interface SubagentModelResolution {
	model?: string;
	source: "runtime-override" | "frontmatter-model" | "delegated-category" | "session-default";
	category?: string;
}

interface DelegatedCategoryPolicy {
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
}

interface DelegatedRoutingConfig {
	enabled?: boolean;
	categories?: Record<string, DelegatedCategoryPolicy>;
}

interface DelegatedModelSelectionConfig {
	disabledProviders?: string[];
	excludedProviders?: string[];
	disabledModels?: string[];
	excludedModels?: string[];
	preferLowerUsage?: boolean;
	allowSmallContextForSmallTasks?: boolean;
	roleOverrides?: Record<string, DelegatedSelectionPolicy>;
}

interface AdaptiveRoutingConfig {
	fallbackGroups?: Record<string, { candidates?: string[] } | string[]>;
	delegatedRouting?: DelegatedRoutingConfig;
	delegatedModelSelection?: DelegatedModelSelectionConfig;
}

const DEFAULT_CATEGORY_TASK_PROFILES: Record<string, ModelTaskProfile> = {
	"implementation-default": "coding",
	"multimodal-default": "design",
	"planning-default": "planning",
	"quick-discovery": "planning",
	"research-default": "planning",
	"review-critical": "planning",
	"visual-engineering": "design",
};

const DEFAULT_CATEGORY_MIN_CONTEXT: Partial<Record<string, number>> = {
	"multimodal-default": 128_000,
	"review-critical": 128_000,
	"visual-engineering": 128_000,
};

function getAdaptiveRoutingConfigPath(): string {
	return join(getAgentDir(), "extensions", "adaptive-routing", "config.json");
}

function getUsageTrackerRateLimitCachePath(): string {
	return join(getAgentDir(), "usage-tracker-rate-limits.json");
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
		return JSON.parse(readFileSync(configPath, "utf8")) as AdaptiveRoutingConfig;
	} catch {
		return {};
	}
}

function readProviderUsageSnapshot(): Record<string, DelegatedSelectionUsageSnapshot> | undefined {
	const cachePath = getUsageTrackerRateLimitCachePath();
	if (!existsSync(cachePath)) {
		return undefined;
	}

	try {
		const raw = JSON.parse(readFileSync(cachePath, "utf8")) as { providers?: Record<string, unknown> };
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

function readMeasuredLatencySnapshot(): Record<string, DelegatedSelectionLatencySnapshot> | undefined {
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

function categoryForAgent(agent: AgentConfig): string | undefined {
	const value = agent.extraFields?.category;
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function inferTaskProfileForAgent(agent: AgentConfig, category: string | undefined): ModelTaskProfile {
	if (category && DEFAULT_CATEGORY_TASK_PROFILES[category]) {
		return DEFAULT_CATEGORY_TASK_PROFILES[category];
	}

	const name = agent.name.toLowerCase();
	if (name.includes("plan") || name.includes("research") || name.includes("scout")) {
		return "planning";
	}
	if (name.includes("design") || name.includes("ui") || name.includes("visual")) {
		return "design";
	}
	if (name.includes("write") || name.includes("doc") || name.includes("prompt")) {
		return "writing";
	}
	if (name.includes("code") || name.includes("impl") || name.includes("engineer")) {
		return "coding";
	}
	return "all";
}

function buildBasePolicy(
	agent: AgentConfig,
	config: AdaptiveRoutingConfig,
	category: string | undefined,
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
	const taskProfile = categoryPolicy?.taskProfile ?? inferTaskProfileForAgent(agent, category);
	const preferFastModels = categoryPolicy?.preferFastModels ?? category === "quick-discovery";
	const minContextWindow =
		categoryPolicy?.minContextWindow ?? (category ? DEFAULT_CATEGORY_MIN_CONTEXT[category] : undefined);

	if (!(candidateModels.length > 0 || categoryPolicy || blockedProviders.length > 0 || blockedModels.length > 0)) {
		return {
			allowSmallContextForSmallTasks: selectionConfig?.allowSmallContextForSmallTasks ?? true,
			preferLowerUsage: selectionConfig?.preferLowerUsage ?? true,
			taskProfile,
		};
	}

	return {
		allowSmallContextForSmallTasks:
			categoryPolicy?.allowSmallContextForSmallTasks ?? selectionConfig?.allowSmallContextForSmallTasks ?? true,
		blockedModels: blockedModels.length > 0 ? blockedModels : undefined,
		blockedProviders: blockedProviders.length > 0 ? blockedProviders : undefined,
		candidateModels: candidateModels.length > 0 ? candidateModels : undefined,
		minContextWindow,
		preferFastModels,
		preferLowCost: categoryPolicy?.preferLowCost,
		preferLowerUsage: selectionConfig?.preferLowerUsage ?? true,
		preferredProviders: categoryPolicy?.preferredProviders,
		requireMultimodal: categoryPolicy?.requireMultimodal,
		requireReasoning: categoryPolicy?.requireReasoning,
		taskProfile,
	};
}

function resolveRoleOverride(
	config: AdaptiveRoutingConfig,
	category: string | undefined,
	agent: AgentConfig,
): DelegatedSelectionPolicy | undefined {
	const overrides = config.delegatedModelSelection?.roleOverrides;
	if (!overrides) {
		return undefined;
	}

	let merged: DelegatedSelectionPolicy | undefined;
	const roleKeys = [category ? `subagent-category:${category}` : null, `subagent:${agent.name}`].filter(
		(value): value is string => Boolean(value),
	);

	for (const key of roleKeys) {
		merged = mergeDelegatedSelectionPolicies(merged, overrides[key]);
	}

	return merged;
}

function normalizeAvailableModels(models: AvailableModelRef[]): DelegatedAvailableModel[] {
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

function resolveDelegatedAgentModel(
	agent: AgentConfig,
	availableModels: AvailableModelRef[],
	options: { currentModel?: string; taskText?: string } = {},
): string | undefined {
	const config = readAdaptiveRoutingConfig();
	if (config.delegatedRouting?.enabled === false) {
		return undefined;
	}

	const category = categoryForAgent(agent);
	const basePolicy = buildBasePolicy(agent, config, category);
	const roleOverride = resolveRoleOverride(config, category, agent);
	const policy = mergeDelegatedSelectionPolicies(basePolicy, roleOverride);
	if (!policy) {
		return undefined;
	}

	const selection = selectDelegatedModel({
		availableModels: normalizeAvailableModels(availableModels),
		currentModel: options.currentModel,
		latency: readMeasuredLatencySnapshot(),
		policy,
		taskText: options.taskText,
		usage: readProviderUsageSnapshot(),
	});
	return selection.selectedModel;
}

export function toAvailableModelRefs(models: DelegatedAvailableModel[]): AvailableModelRef[] {
	return models.map((model) => ({
		...model,
		fullId: `${model.provider}/${model.id}`,
	}));
}

/**
 * Check whether a model string is available in the given models list.
 * Accepts fullId (provider/id), bare id, or id with thinking suffix.
 * Returns the canonical fullId if available, otherwise undefined.
 */
export function findAvailableModel(
	modelName: string | undefined,
	availableModels: AvailableModelRef[],
): string | undefined {
	if (!modelName) {
		return undefined;
	}

	// Strip thinking suffix for lookup
	const colonIdx = modelName.lastIndexOf(":");
	const baseName = colonIdx !== -1 ? modelName.substring(0, colonIdx) : modelName;
	const thinkingSuffix = colonIdx !== -1 ? modelName.substring(colonIdx) : "";

	// Try exact fullId match first
	const exactMatch = availableModels.find((m) => m.fullId === baseName);
	if (exactMatch) {
		return thinkingSuffix ? `${exactMatch.fullId}${thinkingSuffix}` : exactMatch.fullId;
	}

	// Try bare id match
	const idMatch = availableModels.find((m) => m.id === baseName);
	if (idMatch) {
		return thinkingSuffix ? `${idMatch.fullId}${thinkingSuffix}` : idMatch.fullId;
	}

	return undefined;
}

export function resolveSubagentModelResolution(
	agent: AgentConfig,
	availableModels: AvailableModelRef[],
	runtimeOverride?: string,
	options: { currentModel?: string; taskText?: string } = {},
): SubagentModelResolution {
	const category = categoryForAgent(agent);
	if (runtimeOverride) {
		const validated = findAvailableModel(runtimeOverride, availableModels);
		if (validated) {
			return { category, model: validated, source: "runtime-override" };
		}
	}
	if (agent.model) {
		const validated = findAvailableModel(agent.model, availableModels);
		if (validated) {
			return { category, model: validated, source: "frontmatter-model" };
		}
	}

	const sessionModel = findAvailableModel(options.currentModel, availableModels);
	if (sessionModel) {
		return { category, model: sessionModel, source: "session-default" };
	}

	const delegatedModel = resolveDelegatedAgentModel(agent, availableModels, options);
	if (delegatedModel) {
		return { category, model: delegatedModel, source: "delegated-category" };
	}

	return { category, source: "session-default" };
}
