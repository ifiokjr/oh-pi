import type { DelegatedAvailableModel, DelegatedSelectionUsageSnapshot, ModelTaskProfile } from "@ifi/oh-pi-core";
import {
	type DelegatedAvailableModelRef,
	inspectDelegatedSelection,
} from "@ifi/pi-extension-adaptive-routing/delegated-runtime.ts";
import type { AntCaste, WorkerClass } from "./types.js";

export type AvailableModelRef = DelegatedAvailableModelRef;

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

export function toAvailableModelRefs(models: DelegatedAvailableModel[]): AvailableModelRef[] {
	return models.map((model) => ({
		...model,
		fullId: `${model.provider}/${model.id}`,
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

	const inspection = inspectDelegatedSelection({
		availableModels,
		category,
		roleKeys: [`colony-category:${category}`, ...(options.roleKeys ?? [])],
		defaults: {
			taskProfile: DEFAULT_CATEGORY_TASK_PROFILES[category] ?? "all",
			preferFastModels: category === "quick-discovery",
			minContextWindow: DEFAULT_CATEGORY_MIN_CONTEXT[category],
			allowSmallContextForSmallTasks: true,
		},
		currentModel: options.currentModel,
		taskText: options.taskText,
		usage: options.usage,
	});
	if (inspection.selection?.selectedModel) {
		return { model: inspection.selection.selectedModel, category, source: "delegated-category" };
	}
	return { category, source: "session-default" };
}
