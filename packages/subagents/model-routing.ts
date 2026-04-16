import {
	inspectDelegatedSelection,
	type DelegatedAvailableModelRef,
} from "@ifi/pi-extension-adaptive-routing/delegated-runtime.ts";
import type { DelegatedAvailableModel, ModelTaskProfile } from "@ifi/oh-pi-core";
import type { AgentConfig } from "./agents.js";

export type AvailableModelRef = DelegatedAvailableModelRef;

export type SubagentModelResolution = {
	model?: string;
	source: "runtime-override" | "frontmatter-model" | "delegated-category" | "session-default";
	category?: string;
};

const DEFAULT_CATEGORY_TASK_PROFILES: Record<string, ModelTaskProfile> = {
	"quick-discovery": "planning",
	"planning-default": "planning",
	"implementation-default": "coding",
	"research-default": "planning",
	"review-critical": "planning",
	"visual-engineering": "design",
	"multimodal-default": "design",
};

const DEFAULT_CATEGORY_MIN_CONTEXT: Partial<Record<string, number>> = {
	"review-critical": 128_000,
	"visual-engineering": 128_000,
	"multimodal-default": 128_000,
};

function categoryForAgent(agent: AgentConfig): string | undefined {
	const value = agent.extraFields?.category;
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function resolveDelegatedAgentModel(
	agent: AgentConfig,
	availableModels: AvailableModelRef[],
	options: { currentModel?: string; taskText?: string } = {},
): string | undefined {
	const category = categoryForAgent(agent);
	const inspection = inspectDelegatedSelection({
		availableModels,
		category,
		roleKeys: [category ? `subagent-category:${category}` : "", `subagent:${agent.name}`].filter(Boolean),
		defaults: {
			taskProfile: inferTaskProfileForAgent(agent, category),
			preferFastModels: category === "quick-discovery",
			minContextWindow: category ? DEFAULT_CATEGORY_MIN_CONTEXT[category] : undefined,
			allowSmallContextForSmallTasks: true,
		},
		currentModel: options.currentModel,
		taskText: options.taskText,
	});
	return inspection.selection?.selectedModel;
}

export function toAvailableModelRefs(models: DelegatedAvailableModel[]): AvailableModelRef[] {
	return models.map((model) => ({
		...model,
		fullId: `${model.provider}/${model.id}`,
	}));
}

export function resolveSubagentModelResolution(
	agent: AgentConfig,
	availableModels: AvailableModelRef[],
	runtimeOverride?: string,
	options: { currentModel?: string; taskText?: string } = {},
): SubagentModelResolution {
	const category = categoryForAgent(agent);
	if (runtimeOverride) {
		return { model: runtimeOverride, source: "runtime-override", category };
	}
	if (agent.model) {
		return { model: agent.model, source: "frontmatter-model", category };
	}

	const delegatedModel = resolveDelegatedAgentModel(agent, availableModels, options);
	if (delegatedModel) {
		return { model: delegatedModel, source: "delegated-category", category };
	}

	return { source: "session-default", category };
}
