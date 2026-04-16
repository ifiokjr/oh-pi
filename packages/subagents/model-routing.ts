import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import type { AgentConfig } from "./agents.js";

export type AvailableModelRef = {
	provider: string;
	id: string;
	fullId: string;
};

export type SubagentModelResolution = {
	model?: string;
	source: "runtime-override" | "frontmatter-model" | "delegated-category" | "session-default";
	category?: string;
};

type DelegatedCategoryPolicy = {
	candidates?: string[];
	preferredProviders?: string[];
	fallbackGroup?: string;
};

type DelegatedRoutingConfig = {
	enabled?: boolean;
	categories?: Record<string, DelegatedCategoryPolicy>;
};

type AdaptiveRoutingConfig = {
	fallbackGroups?: Record<string, { candidates?: string[] } | string[]>;
	delegatedRouting?: DelegatedRoutingConfig;
};

function getAdaptiveRoutingConfigPath(): string {
	return join(getAgentDir(), "extensions", "adaptive-routing", "config.json");
}

function readAdaptiveRoutingConfig(): AdaptiveRoutingConfig {
	const path = getAdaptiveRoutingConfigPath();
	if (!existsSync(path)) {
		return {};
	}
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as AdaptiveRoutingConfig;
	} catch {
		return {};
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
	return (group?.candidates ?? []).filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function findModelForReference(reference: string, availableModels: AvailableModelRef[]): AvailableModelRef | undefined {
	if (reference.endsWith("/<best-available>")) {
		const provider = reference.slice(0, reference.indexOf("/"));
		return availableModels.find((model) => model.provider === provider);
	}
	return availableModels.find((model) => model.fullId === reference || model.id === reference);
}

function resolveDelegatedCategoryModel(category: string, availableModels: AvailableModelRef[]): string | undefined {
	const config = readAdaptiveRoutingConfig();
	const delegated = config.delegatedRouting;
	if (delegated?.enabled === false) {
		return undefined;
	}
	const policy = delegated?.categories?.[category];
	if (!policy) {
		return undefined;
	}
	const candidateRefs = [...(policy.candidates ?? []), ...fallbackCandidates(config, policy.fallbackGroup)];
	for (const reference of candidateRefs) {
		const model = findModelForReference(reference, availableModels);
		if (model) {
			return model.fullId;
		}
	}
	for (const provider of policy.preferredProviders ?? []) {
		const model = availableModels.find((entry) => entry.provider === provider);
		if (model) {
			return model.fullId;
		}
	}
	return undefined;
}

export function resolveSubagentModelResolution(
	agent: AgentConfig,
	availableModels: AvailableModelRef[],
	runtimeOverride?: string,
): SubagentModelResolution {
	if (runtimeOverride) {
		return { model: runtimeOverride, source: "runtime-override", category: categoryForAgent(agent) };
	}
	if (agent.model) {
		return { model: agent.model, source: "frontmatter-model", category: categoryForAgent(agent) };
	}
	const category = categoryForAgent(agent);
	if (category) {
		const delegatedModel = resolveDelegatedCategoryModel(category, availableModels);
		if (delegatedModel) {
			return { model: delegatedModel, source: "delegated-category", category };
		}
	}
	return { source: "session-default", category };
}
