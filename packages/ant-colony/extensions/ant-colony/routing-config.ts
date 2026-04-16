import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import type { AntCaste, WorkerClass } from "./types.js";

export type AvailableModelRef = {
	provider: string;
	id: string;
	fullId: string;
};

type DelegatedCategoryPolicy = {
	candidates?: string[];
	preferredProviders?: string[];
	fallbackGroup?: string;
};

type AdaptiveRoutingConfig = {
	fallbackGroups?: Record<string, { candidates?: string[] } | string[]>;
	delegatedRouting?: {
		enabled?: boolean;
		categories?: Record<string, DelegatedCategoryPolicy>;
	};
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

function findModelForReference(reference: string, availableModels: AvailableModelRef[]): AvailableModelRef | undefined {
	if (reference.endsWith("/<best-available>")) {
		const provider = reference.slice(0, reference.indexOf("/"));
		return availableModels.find((model) => model.provider === provider);
	}
	return availableModels.find((model) => model.fullId === reference || model.id === reference);
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

export function resolveColonyCategoryModel(
	category: string | undefined,
	availableModels: AvailableModelRef[],
): { model?: string; category?: string; source: "delegated-category" | "session-default" } {
	if (!category) {
		return { source: "session-default" };
	}
	const config = readAdaptiveRoutingConfig();
	if (config.delegatedRouting?.enabled === false) {
		return { category, source: "session-default" };
	}
	const policy = config.delegatedRouting?.categories?.[category];
	if (!policy) {
		return { category, source: "session-default" };
	}
	const candidateRefs = [...(policy.candidates ?? []), ...fallbackCandidates(config, policy.fallbackGroup)];
	for (const reference of candidateRefs) {
		const model = findModelForReference(reference, availableModels);
		if (model) {
			return { model: model.fullId, category, source: "delegated-category" };
		}
	}
	for (const provider of policy.preferredProviders ?? []) {
		const model = availableModels.find((entry) => entry.provider === provider);
		if (model) {
			return { model: model.fullId, category, source: "delegated-category" };
		}
	}
	return { category, source: "session-default" };
}
