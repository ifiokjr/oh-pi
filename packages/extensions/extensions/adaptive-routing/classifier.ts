import type { Api, AssistantMessage, Model } from "@mariozechner/pi-ai";
import { completeSimple } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { buildFallbackClassification } from "./engine.js";
import { matchesModelRef } from "./normalize.js";
import type {
	AdaptiveRoutingConfig,
	NormalizedRouteCandidate,
	PromptRouteClassification,
	RouteIntent,
	RouteThinkingLevel,
} from "./types.js";

export async function classifyPrompt(
	prompt: string,
	config: AdaptiveRoutingConfig,
	ctx: Pick<ExtensionContext, "modelRegistry">,
	candidates: NormalizedRouteCandidate[],
): Promise<PromptRouteClassification> {
	const heuristic = classifyPromptHeuristically(prompt);
	const routerModel = pickRouterModel(config.routerModels, candidates);
	if (!routerModel) {
		return heuristic;
	}

	const apiKey = await resolveApiKey(routerModel.model, ctx);
	if (!apiKey) {
		return heuristic;
	}

	try {
		const response = await completeSimple(
			routerModel.model,
			{
				systemPrompt:
					"You classify coding-agent prompts. Return strict JSON only with keys: intent, complexity, risk, expectedTurns, toolIntensity, contextBreadth, recommendedTier, recommendedThinking, confidence, reason. Use only allowed values. Keep reason short.",
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: buildClassifierPrompt(prompt) }],
						timestamp: Date.now(),
					},
				],
			},
			{
				apiKey,
				reasoning: routerModel.reasoning ? "minimal" : undefined,
			},
		);

		const parsed = parseClassifierResponse(extractAnswer(response));
		if (!parsed) {
			return {
				...heuristic,
				reason: `${heuristic.reason} (classifier fallback)`,
				classifierMode: "heuristic",
			};
		}
		return {
			...parsed,
			classifierMode: "llm",
			classifierModel: routerModel.fullId,
		};
	} catch {
		return {
			...heuristic,
			reason: `${heuristic.reason} (classifier unavailable)`,
			classifierMode: "heuristic",
		};
	}
}

export function classifyPromptHeuristically(prompt: string): PromptRouteClassification {
	const text = prompt.toLowerCase();
	const intent = detectIntent(text);
	const complexity = detectComplexity(text, intent);
	const recommendedTier = detectTier(intent, complexity);
	const recommendedThinking = detectThinking(recommendedTier, intent);

	return {
		intent,
		complexity,
		risk: intent === "quick-qna" ? "low" : complexity >= 4 ? "high" : "medium",
		expectedTurns: intent === "quick-qna" ? "one" : complexity >= 4 ? "many" : "few",
		toolIntensity: ["implementation", "debugging", "refactor", "autonomous"].includes(intent)
			? "high"
			: intent === "quick-qna"
				? "low"
				: "medium",
		contextBreadth: complexity >= 4 || intent === "architecture" ? "large" : complexity >= 3 ? "medium" : "small",
		recommendedTier,
		recommendedThinking,
		confidence: 0.5,
		reason: `heuristic ${intent} classification`,
		classifierMode: "heuristic",
	};
}

function detectIntent(text: string): RouteIntent {
	if (/(design|ui|ux|layout|visual|styling|theme|color|aesthetic)/.test(text)) {
		return "design";
	}
	if (/(architecture|system design|tradeoff|approach|deep refactor|cross-cutting)/.test(text)) {
		return "architecture";
	}
	if (/(debug|failing|error|stack trace|why is|broken|fix)/.test(text)) {
		return "debugging";
	}
	if (/(review|audit|look over|inspect this change|code review)/.test(text)) {
		return "review";
	}
	if (/(refactor|clean up|restructure)/.test(text)) {
		return "refactor";
	}
	if (/(plan|roadmap|spec|outline|break down|approach this)/.test(text)) {
		return "planning";
	}
	if (/(research|investigate|compare|look up|search)/.test(text)) {
		return "research";
	}
	if (/(autonomous|work through|handle all of|keep going until)/.test(text)) {
		return "autonomous";
	}
	if (/(implement|build|add|create|wire up|integrate)/.test(text)) {
		return "implementation";
	}
	return text.split(/\s+/).length < 18 ? "quick-qna" : "implementation";
}

function detectComplexity(text: string, intent: RouteIntent): 1 | 2 | 3 | 4 | 5 {
	let score = 1;
	const length = text.split(/\s+/).length;
	if (length > 20) {
		score += 1;
	}
	if (length > 50) {
		score += 1;
	}
	if (/(multiple|across|migration|all of these|thoroughly|deeply|telemetry|fallback|quota|policy)/.test(text)) {
		score += 1;
	}
	if (["architecture", "autonomous", "design"].includes(intent)) {
		score += 1;
	}
	return Math.min(score, 5) as 1 | 2 | 3 | 4 | 5;
}

function detectTier(intent: RouteIntent, complexity: number) {
	if (intent === "quick-qna" && complexity <= 2) {
		return "cheap" as const;
	}
	if ((intent === "design" || intent === "architecture" || intent === "autonomous") && complexity >= 4) {
		return "peak" as const;
	}
	if (complexity >= 4 || intent === "debugging" || intent === "refactor") {
		return "premium" as const;
	}
	return complexity <= 2 ? ("cheap" as const) : ("balanced" as const);
}

function detectThinking(tier: PromptRouteClassification["recommendedTier"], intent: RouteIntent): RouteThinkingLevel {
	if (tier === "cheap") {
		return "minimal";
	}
	if (tier === "balanced") {
		return "medium";
	}
	if (tier === "premium") {
		return intent === "design" ? "high" : "high";
	}
	return "xhigh";
}

function pickRouterModel(
	routerModels: string[],
	candidates: NormalizedRouteCandidate[],
): NormalizedRouteCandidate | undefined {
	for (const ref of routerModels) {
		const match = candidates.find((candidate) => matchesModelRef(ref, candidate));
		if (match) {
			return match;
		}
	}
	return candidates.find((candidate) => candidate.tier === "cheap") ?? candidates[0];
}

async function resolveApiKey(
	model: Model<Api>,
	ctx: Pick<ExtensionContext, "modelRegistry">,
): Promise<string | undefined> {
	const registry = ctx.modelRegistry as ExtensionContext["modelRegistry"] & {
		getApiKeyForProvider?: (provider: string) => Promise<string | undefined>;
		authStorage?: { getApiKey?: (provider: string) => Promise<string | undefined> };
	};
	if (typeof registry.getApiKey === "function") {
		return registry.getApiKey(model);
	}
	if (typeof registry.getApiKeyForProvider === "function") {
		return registry.getApiKeyForProvider(model.provider);
	}
	if (typeof registry.authStorage?.getApiKey === "function") {
		return registry.authStorage.getApiKey(model.provider);
	}
	return undefined;
}

function buildClassifierPrompt(prompt: string): string {
	return [
		"Classify this coding-agent prompt.",
		"Allowed intent values: quick-qna, planning, research, implementation, debugging, design, architecture, review, refactor, autonomous.",
		"Allowed complexity values: 1, 2, 3, 4, 5.",
		"Allowed risk values: low, medium, high.",
		"Allowed expectedTurns values: one, few, many.",
		"Allowed toolIntensity values: low, medium, high.",
		"Allowed contextBreadth values: small, medium, large.",
		"Allowed recommendedTier values: cheap, balanced, premium, peak.",
		"Allowed recommendedThinking values: off, minimal, low, medium, high, xhigh.",
		"Return JSON only.",
		`Prompt: ${prompt}`,
	].join("\n");
}

function parseClassifierResponse(text: string): PromptRouteClassification | undefined {
	try {
		const match = text.match(/\{[\s\S]*\}/);
		if (!match) {
			return undefined;
		}
		const parsed = JSON.parse(match[0]) as Partial<PromptRouteClassification>;
		if (!(parsed.intent && parsed.recommendedTier && parsed.recommendedThinking)) {
			return undefined;
		}
		return {
			...buildFallbackClassification(parsed.intent),
			...parsed,
			confidence: clampConfidence(parsed.confidence),
			reason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : "llm classification",
		};
	} catch {
		return undefined;
	}
}

function extractAnswer(message: AssistantMessage): string {
	return message.content
		.filter((part): part is Extract<AssistantMessage["content"][number], { type: "text" }> => part.type === "text")
		.map((part) => part.text)
		.join("")
		.trim();
}

function clampConfidence(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return 0.65;
	}
	return Math.max(0, Math.min(1, parsed));
}
