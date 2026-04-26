/* C8 ignore file */
import { MODEL_INTELLIGENCE_RUNTIME_SNAPSHOT } from "./model-intelligence.generated.js";

export type ModelTaskProfile = "design" | "planning" | "writing" | "coding" | "all";
export type ProviderUsageConfidence = "authoritative" | "estimated" | "unknown";
export type TaskSizeTier = "small" | "medium" | "large" | "xlarge";

export interface ModelIntelligenceTaskScore {
	task: ModelTaskProfile;
	score: number | null;
	confidence: number;
	metricsUsed: string[];
}

export interface ModelIntelligenceRuntimeModel {
	id: string;
	creator: string;
	model: string;
	sourceType: string;
	overallScore: number;
	taskScores: Record<ModelTaskProfile, ModelIntelligenceTaskScore>;
	inputPriceUsdPerMillion: number | null;
	outputPriceUsdPerMillion: number | null;
	contextWindowTokens: number | null;
	providerModelRefs: string[];
	openWeights: boolean;
	reasoning: boolean;
	multimodal: boolean;
	toolCall: boolean;
	structuredOutput: boolean;
}

export interface ModelIntelligenceRuntimeSnapshot {
	version: number;
	generatedAt: string;
	models: ModelIntelligenceRuntimeModel[];
}

export interface DelegatedSelectionUsageSnapshot {
	confidence?: ProviderUsageConfidence;
	remainingPct?: number;
}

export interface DelegatedSelectionLatencySnapshot {
	avgMs: number;
	count?: number;
}

export interface DelegatedAvailableModel {
	provider: string;
	id: string;
	name: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	contextWindow: number;
	maxTokens: number;
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
}

export interface DelegatedSelectionPolicy {
	candidateModels?: string[];
	preferredModels?: string[];
	preferredProviders?: string[];
	blockedModels?: string[];
	blockedProviders?: string[];
	taskProfile?: ModelTaskProfile;
	preferFastModels?: boolean;
	preferLowCost?: boolean;
	preferLowerUsage?: boolean;
	requireReasoning?: boolean;
	requireMultimodal?: boolean;
	minContextWindow?: number;
	allowSmallContextForSmallTasks?: boolean;
}

export interface DelegatedSelectionCandidate {
	model: DelegatedAvailableModel;
	fullId: string;
	intelligence?: ModelIntelligenceRuntimeModel;
	contextWindow: number;
	multimodal: boolean;
	reasoning: boolean;
	fastScore: number;
	costScore: number | null;
}

export interface DelegatedSelectionRankedCandidate {
	model: string;
	score: number;
	reasons: string[];
	intelligenceId?: string;
}

export interface DelegatedSelectionResult {
	selectedModel?: string;
	ranked: DelegatedSelectionRankedCandidate[];
	minimumContextWindow: number;
	taskSize: TaskSizeTier;
	taskProfile: ModelTaskProfile;
	rejected: { model: string; reason: string }[];
}

const DEFAULT_CONTEXT_WINDOW = 128_000;
const SMALL_CONTEXT_WINDOW = 32_000;
const MEDIUM_CONTEXT_WINDOW = 128_000;
const LARGE_CONTEXT_WINDOW = 256_000;
const XLARGE_CONTEXT_WINDOW = 400_000;
const FAST_MODEL_PATTERN = /(flash|mini|haiku|turbo|instant|swift|fast)/i;
const SLOW_MODEL_PATTERN = /(pro|ultra|opus|reasoning|thinking|large|mythos)/i;

let intelligenceByModelRef: Map<string, ModelIntelligenceRuntimeModel> | undefined;

function getIntelligenceByModelRef(): Map<string, ModelIntelligenceRuntimeModel> {
	if (intelligenceByModelRef) {
		return intelligenceByModelRef;
	}

	intelligenceByModelRef = new Map();
	for (const model of MODEL_INTELLIGENCE_RUNTIME_SNAPSHOT.models) {
		for (const reference of model.providerModelRefs) {
			intelligenceByModelRef.set(reference, model);
		}
	}
	return intelligenceByModelRef;
}

export function getModelIntelligenceSnapshot(): ModelIntelligenceRuntimeSnapshot {
	return MODEL_INTELLIGENCE_RUNTIME_SNAPSHOT;
}

export function findModelIntelligence(fullId: string): ModelIntelligenceRuntimeModel | undefined {
	return getIntelligenceByModelRef().get(fullId);
}

export function mergeDelegatedSelectionPolicies(
	base: DelegatedSelectionPolicy | undefined,
	override: DelegatedSelectionPolicy | undefined,
): DelegatedSelectionPolicy | undefined {
	if (!(base || override)) {
		return undefined;
	}

	return {
		allowSmallContextForSmallTasks: override?.allowSmallContextForSmallTasks ?? base?.allowSmallContextForSmallTasks,
		blockedModels: mergeStringLists(base?.blockedModels, override?.blockedModels),
		blockedProviders: mergeStringLists(base?.blockedProviders, override?.blockedProviders),
		candidateModels: mergeStringLists(base?.candidateModels, override?.candidateModels, { overrideFirst: true }),
		minContextWindow: override?.minContextWindow ?? base?.minContextWindow,
		preferFastModels: override?.preferFastModels ?? base?.preferFastModels,
		preferLowCost: override?.preferLowCost ?? base?.preferLowCost,
		preferLowerUsage: override?.preferLowerUsage ?? base?.preferLowerUsage,
		preferredModels: mergeStringLists(base?.preferredModels, override?.preferredModels, { overrideFirst: true }),
		preferredProviders: mergeStringLists(base?.preferredProviders, override?.preferredProviders, {
			overrideFirst: true,
		}),
		requireMultimodal: override?.requireMultimodal ?? base?.requireMultimodal,
		requireReasoning: override?.requireReasoning ?? base?.requireReasoning,
		taskProfile: override?.taskProfile ?? base?.taskProfile,
	};
}

export function selectDelegatedModel(params: {
	availableModels: DelegatedAvailableModel[];
	currentModel?: string;
	policy?: DelegatedSelectionPolicy;
	taskText?: string;
	usage?: Record<string, DelegatedSelectionUsageSnapshot>;
	latency?: Record<string, DelegatedSelectionLatencySnapshot>;
}): DelegatedSelectionResult {
	const policy = params.policy ?? {};
	const taskProfile = policy.taskProfile ?? "all";
	const taskSize = estimateTaskSize(params.taskText);
	const minimumContextWindow = resolveMinimumContextWindow(policy, taskSize);
	const blockedProviders = new Set(policy.blockedProviders ?? []);
	const blockedModels = new Set(policy.blockedModels ?? []);
	const candidates: DelegatedSelectionCandidate[] = [];
	const rejected: DelegatedSelectionResult["rejected"] = [];

	for (const model of params.availableModels) {
		const fullId = `${model.provider}/${model.id}`;
		if (blockedProviders.has(model.provider)) {
			rejected.push({ model: fullId, reason: "provider-blocked" });
			continue;
		}

		if (blockedModels.has(fullId) || blockedModels.has(model.id)) {
			rejected.push({ model: fullId, reason: "model-blocked" });
			continue;
		}

		const contextWindow = normalizeContextWindow(model.contextWindow);
		const multimodal = model.input.includes("image");
		const reasoning = Boolean(model.reasoning);
		if (policy.requireMultimodal && !multimodal) {
			rejected.push({ model: fullId, reason: "multimodal-required" });
			continue;
		}

		if (policy.requireReasoning && !reasoning) {
			rejected.push({ model: fullId, reason: "reasoning-required" });
			continue;
		}

		if (contextWindow < minimumContextWindow) {
			rejected.push({ model: fullId, reason: `context-too-small:${contextWindow}` });
			continue;
		}

		candidates.push({
			contextWindow,
			costScore: estimateCostScore(model),
			fastScore: estimateFastScore(model),
			fullId,
			intelligence: findModelIntelligence(fullId),
			model,
			multimodal,
			reasoning,
		});
	}

	const ranked = candidates
		.map((candidate) =>
			rankCandidate(candidate, {
				currentModel: params.currentModel,
				latency: params.latency,
				minimumContextWindow,
				policy,
				taskProfile,
				taskSize,
				usage: params.usage,
			}),
		)
		.toSorted((left, right) => right.score - left.score || left.model.localeCompare(right.model));

	return {
		minimumContextWindow,
		ranked,
		rejected,
		selectedModel: ranked[0]?.model,
		taskProfile,
		taskSize,
	};
}

function rankCandidate(
	candidate: DelegatedSelectionCandidate,
	context: {
		currentModel?: string;
		policy: DelegatedSelectionPolicy;
		taskProfile: ModelTaskProfile;
		taskSize: TaskSizeTier;
		minimumContextWindow: number;
		usage?: Record<string, DelegatedSelectionUsageSnapshot>;
		latency?: Record<string, DelegatedSelectionLatencySnapshot>;
	},
): DelegatedSelectionRankedCandidate {
	const reasons: string[] = [];
	let score = 0;
	const { policy, taskProfile, taskSize, minimumContextWindow, currentModel, usage, latency } = context;

	const candidateRefs = policy.candidateModels ?? [];
	const candidateIndex = candidateRefs.findIndex((reference) => matchesModelReference(reference, candidate));
	if (candidateIndex !== -1) {
		score += Math.max(36 - candidateIndex * 4, 18);
		reasons.push(`candidate:${candidateIndex + 1}`);
	}

	const preferredModelIndex = (policy.preferredModels ?? []).findIndex((reference) =>
		matchesModelReference(reference, candidate),
	);
	if (preferredModelIndex !== -1) {
		score += Math.max(48 - preferredModelIndex * 6, 20);
		reasons.push(`preferred-model:${preferredModelIndex + 1}`);
	}

	const preferredProviderIndex = (policy.preferredProviders ?? []).indexOf(candidate.model.provider);
	if (preferredProviderIndex !== -1) {
		score += Math.max(18 - preferredProviderIndex * 3, 6);
		reasons.push(`preferred-provider:${preferredProviderIndex + 1}`);
	}

	const taskScore = candidate.intelligence?.taskScores[taskProfile]?.score;
	if (typeof taskScore === "number") {
		score += taskScore / 4;
		reasons.push(`task-fit:${taskProfile}:${taskScore}`);
	} else if (candidate.intelligence) {
		score += candidate.intelligence.overallScore / 8;
		reasons.push("task-fit:overall-fallback");
	} else {
		score += heuristicCapabilityScore(candidate, taskProfile);
		reasons.push("task-fit:heuristic");
	}

	if (policy.preferLowerUsage) {
		const providerUsage = usage?.[candidate.model.provider];
		if (typeof providerUsage?.remainingPct === "number") {
			const usageScore = (providerUsage.remainingPct - 50) / 8;
			score += usageScore;
			reasons.push(`usage:${providerUsage.remainingPct}`);
		}
	}

	const contextFitScore = scoreContextFit(candidate.contextWindow, minimumContextWindow, taskSize, policy);
	score += contextFitScore;
	if (contextFitScore !== 0) {
		reasons.push(`context-fit:${contextFitScore}`);
	}

	if (policy.preferFastModels || taskSize === "small") {
		score += candidate.fastScore * 2;
		if (candidate.fastScore > 0) {
			reasons.push(`fast:${candidate.fastScore}`);
		}
	}

	const latencyScore = scoreMeasuredLatency(candidate.fullId, latency, policy, taskSize);
	score += latencyScore;
	if (latencyScore !== 0) {
		reasons.push(`measured-latency:${latencyScore}`);
	}

	const efficiencyScore = scoreSmallTaskEfficiency(candidate, taskSize, policy);
	score += efficiencyScore;
	if (efficiencyScore !== 0) {
		reasons.push(`small-task-efficiency:${efficiencyScore}`);
	}

	if (policy.preferLowCost && candidate.costScore != null) {
		score += candidate.costScore;
		reasons.push(`cost:${candidate.costScore}`);
	}

	if (currentModel && currentModel === candidate.fullId) {
		score += 4;
		reasons.push("current-model");
	}

	return {
		intelligenceId: candidate.intelligence?.id,
		model: candidate.fullId,
		reasons,
		score: Math.round(score * 10) / 10,
	};
}

function heuristicCapabilityScore(candidate: DelegatedSelectionCandidate, taskProfile: ModelTaskProfile): number {
	const id = candidate.model.id.toLowerCase();
	const provider = candidate.model.provider.toLowerCase();
	const name = candidate.model.name.toLowerCase();

	switch (taskProfile) {
		case "design": {
			return (candidate.multimodal ? 10 : 0) + (provider === "google" ? 4 : 0) + (id.includes("gpt-5") ? 3 : 0);
		}
		case "planning": {
			return (candidate.reasoning ? 8 : 0) + (id.includes("reason") || name.includes("think") ? 4 : 0);
		}
		case "writing": {
			return (provider === "anthropic" ? 6 : 0) + (provider === "google" ? 4 : 0) + (candidate.reasoning ? 2 : 0);
		}
		case "coding": {
			return /coder|code|codex|gemma|qwen|glm|kimi|gpt-5/i.test(id) ? 10 : 4;
		}
		case "all": {
			return candidate.reasoning ? 6 : 3;
		}
		default: {
			return 0;
		}
	}
}

function resolveMinimumContextWindow(policy: DelegatedSelectionPolicy, taskSize: TaskSizeTier): number {
	if (typeof policy.minContextWindow === "number" && Number.isFinite(policy.minContextWindow)) {
		return Math.max(Math.floor(policy.minContextWindow), SMALL_CONTEXT_WINDOW);
	}

	switch (taskSize) {
		case "small": {
			return policy.allowSmallContextForSmallTasks === false ? MEDIUM_CONTEXT_WINDOW : SMALL_CONTEXT_WINDOW;
		}
		case "medium": {
			return MEDIUM_CONTEXT_WINDOW;
		}
		case "large": {
			return LARGE_CONTEXT_WINDOW;
		}
		case "xlarge": {
			return XLARGE_CONTEXT_WINDOW;
		}
	}
}

function scoreContextFit(
	contextWindow: number,
	minimumContextWindow: number,
	taskSize: TaskSizeTier,
	policy: DelegatedSelectionPolicy,
): number {
	if (taskSize === "small" && policy.allowSmallContextForSmallTasks !== false) {
		if (contextWindow <= SMALL_CONTEXT_WINDOW) {
			return 6;
		}
		if (contextWindow <= MEDIUM_CONTEXT_WINDOW) {
			return 4;
		}
		if (contextWindow <= LARGE_CONTEXT_WINDOW) {
			return 2;
		}
		return 0;
	}

	if (taskSize === "medium") {
		if (contextWindow <= MEDIUM_CONTEXT_WINDOW) {
			return 4;
		}
		if (contextWindow <= LARGE_CONTEXT_WINDOW) {
			return 3;
		}
		return 1;
	}

	if (contextWindow >= minimumContextWindow * 2) {
		return 6;
	}
	if (contextWindow >= minimumContextWindow) {
		return 4;
	}
	return 0;
}

function scoreMeasuredLatency(
	fullId: string,
	latency: Record<string, DelegatedSelectionLatencySnapshot> | undefined,
	policy: DelegatedSelectionPolicy,
	taskSize: TaskSizeTier,
): number {
	if (!(latency && (policy.preferFastModels || taskSize === "small"))) {
		return 0;
	}

	const entry = latency[fullId];
	if (!(entry && Number.isFinite(entry.avgMs) && entry.avgMs > 0)) {
		return 0;
	}

	if (entry.avgMs <= 2500) {
		return 8;
	}
	if (entry.avgMs <= 5000) {
		return 5;
	}
	if (entry.avgMs <= 10_000) {
		return 2;
	}
	if (entry.avgMs <= 20_000) {
		return -2;
	}
	return -6;
}

function scoreSmallTaskEfficiency(
	candidate: DelegatedSelectionCandidate,
	taskSize: TaskSizeTier,
	policy: DelegatedSelectionPolicy,
): number {
	if (!(taskSize === "small" && policy.allowSmallContextForSmallTasks !== false)) {
		return 0;
	}

	let score = 0;
	if (candidate.contextWindow <= SMALL_CONTEXT_WINDOW) {
		score += 10;
	} else if (candidate.contextWindow <= MEDIUM_CONTEXT_WINDOW) {
		score += 6;
	} else if (candidate.contextWindow <= LARGE_CONTEXT_WINDOW) {
		score -= 2;
	} else {
		score -= 6;
	}

	if (candidate.costScore != null) {
		score += Math.max(candidate.costScore / 2, 0);
	}

	if (candidate.fastScore > 0) {
		score += candidate.fastScore;
	}

	return score;
}

function estimateTaskSize(taskText: string | undefined): TaskSizeTier {
	const length = taskText?.trim().length ?? 0;
	if (length <= 800) {
		return "small";
	}
	if (length <= 3000) {
		return "medium";
	}
	if (length <= 8000) {
		return "large";
	}
	return "xlarge";
}

function estimateFastScore(model: Pick<DelegatedAvailableModel, "id" | "name" | "contextWindow">): number {
	const label = `${model.id} ${model.name}`;
	let score = 0;

	if (FAST_MODEL_PATTERN.test(label)) {
		score += 4;
	}
	if (SLOW_MODEL_PATTERN.test(label)) {
		score -= 1;
	}

	const contextWindow = normalizeContextWindow(model.contextWindow);
	if (contextWindow <= SMALL_CONTEXT_WINDOW) {
		score += 3;
	} else if (contextWindow <= MEDIUM_CONTEXT_WINDOW) {
		score += 2;
	}

	return score;
}

function estimateCostScore(model: Pick<DelegatedAvailableModel, "cost">): number | null {
	const values = Object.values(model.cost).filter((value) => Number.isFinite(value) && value > 0);
	if (values.length === 0) {
		return null;
	}

	const totalCost = values.reduce((sum, value) => sum + value, 0);
	if (totalCost <= 1) {
		return 6;
	}
	if (totalCost <= 5) {
		return 4;
	}
	if (totalCost <= 15) {
		return 2;
	}
	return 0;
}

function normalizeContextWindow(value: number): number {
	return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_CONTEXT_WINDOW;
}

function mergeStringLists(
	base: string[] | undefined,
	override: string[] | undefined,
	options: { overrideFirst?: boolean } = {},
): string[] | undefined {
	const values = options.overrideFirst
		? [...(override ?? []), ...(base ?? [])]
		: [...(base ?? []), ...(override ?? [])];
	const unique = [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))];
	return unique.length > 0 ? unique : undefined;
}

function matchesModelReference(
	reference: string,
	candidate: Pick<DelegatedSelectionCandidate, "fullId" | "model">,
): boolean {
	if (reference.endsWith("/<best-available>")) {
		const provider = reference.slice(0, reference.indexOf("/"));
		return candidate.model.provider === provider;
	}

	return reference === candidate.fullId || reference === candidate.model.id;
}
