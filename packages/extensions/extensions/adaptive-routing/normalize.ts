import type { Api, Model } from "@mariozechner/pi-ai";
import type { NormalizedRouteCandidate, RouteThinkingLevel, RouteTier } from "./types.js";

export function normalizeRouteCandidates(models: Model<Api>[]): NormalizedRouteCandidate[] {
	return models.map((model) => {
		const provider = String(model.provider);
		const modelId = model.id;
		const fullId = `${provider}/${modelId}`;
		const tags = deriveCandidateTags(model);
		return {
			fullId,
			provider,
			modelId,
			label: model.name || fullId,
			reasoning: model.reasoning,
			maxThinkingLevel: deriveMaxThinkingLevel(model),
			tier: deriveCandidateTier(model),
			contextWindow: model.contextWindow,
			maxTokens: model.maxTokens,
			input: [...model.input],
			costKnown: hasKnownCost(model),
			tags,
			family: deriveCandidateFamily(model),
			fallbackGroups: deriveFallbackGroups(model),
			available: true,
			authenticated: true,
			model,
		};
	});
}

export function deriveMaxThinkingLevel(model: Model<Api>): RouteThinkingLevel {
	if (!model.reasoning) {
		return "off";
	}

	const id = model.id.toLowerCase();
	if (id.includes("gpt-5") || id.includes("opus-4.6") || id.includes("opus-4-6")) {
		return "xhigh";
	}

	return "high";
}

export function deriveCandidateTier(model: Model<Api>): RouteTier {
	const id = model.id.toLowerCase();
	const name = model.name.toLowerCase();

	if (id.includes("gpt-5.4") || id.includes("opus-4.6") || id.includes("opus-4-6") || name.includes("ultra")) {
		return "peak";
	}
	if (id.includes("opus") || id.includes("sonnet") || id.includes("pro") || id.includes("gpt-5")) {
		return "premium";
	}
	if (id.includes("flash") || id.includes("mini")) {
		return "cheap";
	}
	return "balanced";
}

export function deriveCandidateTags(model: Model<Api>): string[] {
	const tags = new Set<string>();
	const provider = String(model.provider);
	const id = model.id.toLowerCase();
	const name = model.name.toLowerCase();
	const tier = deriveCandidateTier(model);

	tags.add(provider);
	tags.add(tier);
	if (model.reasoning) {
		tags.add("reasoning");
	}
	if (model.input.includes("image")) {
		tags.add("multimodal");
	}
	if (tier === "premium" || tier === "peak") {
		tags.add("premium");
	}
	if (tier === "cheap") {
		tags.add("cheap");
	}
	if (provider === "anthropic" || name.includes("claude")) {
		tags.add("design");
	}
	if (provider === "openai" || id.includes("gpt-5")) {
		tags.add("architecture");
	}
	if (provider === "cursor-agent") {
		tags.add("architecture");
		tags.add("premium");
	}
	return Array.from(tags);
}

export function deriveCandidateFamily(model: Model<Api>): string | undefined {
	const provider = String(model.provider);
	const tier = deriveCandidateTier(model);

	if (provider === "anthropic") {
		return `anthropic-${tier}`;
	}
	if (provider === "openai") {
		return `openai-${tier}`;
	}
	if (provider === "cursor-agent") {
		return `cursor-${tier}`;
	}
	if (provider === "google") {
		return `google-${tier}`;
	}
	return undefined;
}

export function deriveFallbackGroups(model: Model<Api>): string[] {
	const provider = String(model.provider);
	const id = model.id.toLowerCase();
	const groups = new Set<string>();
	const tier = deriveCandidateTier(model);

	if (tier === "cheap") {
		groups.add("cheap-router");
	}
	if (
		(provider === "anthropic" && (id.includes("opus") || id.includes("sonnet"))) ||
		(provider === "openai" && id.includes("gpt-5.4"))
	) {
		groups.add("design-premium");
	}
	if ((provider === "anthropic" && id.includes("opus")) || (provider === "openai" && id.includes("gpt-5.4"))) {
		groups.add("peak-reasoning");
	}
	if (provider === "cursor-agent") {
		groups.add("peak-reasoning");
	}
	return Array.from(groups);
}

export function matchesModelRef(
	reference: string,
	candidate: Pick<NormalizedRouteCandidate, "fullId" | "modelId">,
): boolean {
	const normalized = reference.trim();
	return normalized === candidate.fullId || normalized === candidate.modelId;
}

function hasKnownCost(model: Model<Api>): boolean {
	return Object.values(model.cost).some((value) => Number(value) > 0);
}
