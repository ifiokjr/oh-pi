import { readFileSync } from "node:fs";

import { classifyPromptHeuristically } from "./classifier.js";
import { DEFAULT_ADAPTIVE_ROUTING_CONFIG } from "./defaults.js";
import { decideRoute } from "./engine.js";
import { normalizeRouteCandidates } from "./normalize.js";

interface CorpusEntry {
	name: string;
	prompt: string;
	expectedIntent: string;
	expectedComplexity: number;
	expectedRisk: string;
	expectedTurns: string;
	expectedToolIntensity: string;
	expectedContextBreadth: string;
	expectedTier: string;
	expectedThinking: string;
	expectedModel: string;
	acceptableFallbacks: string[];
}

const candidates = normalizeRouteCandidates([
	{
		api: "anthropic-messages",
		baseUrl: "https://api.anthropic.com",
		contextWindow: 200000,
		cost: { cacheRead: 0, cacheWrite: 0, input: 1, output: 1 },
		id: "claude-opus-4.6",
		input: ["text", "image"],
		maxTokens: 16384,
		name: "Claude Opus 4.6",
		provider: "anthropic",
		reasoning: true,
	},
	{
		api: "openai-responses",
		baseUrl: "https://api.openai.com/v1",
		contextWindow: 200000,
		cost: { cacheRead: 0, cacheWrite: 0, input: 1, output: 1 },
		id: "gpt-5.4",
		input: ["text"],
		maxTokens: 32768,
		name: "GPT-5.4",
		provider: "openai",
		reasoning: true,
	},
	{
		api: "openai-completions",
		baseUrl: "https://api.groq.com/openai/v1",
		contextWindow: 128000,
		cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
		id: "llama-3.3-70b-versatile",
		input: ["text"],
		maxTokens: 32768,
		name: "Llama 3.3 70B Versatile",
		provider: "groq",
		reasoning: false,
	},
] as never);

describe("adaptive routing engine", () => {
	it("routes design-heavy prompts toward non-Anthropic premium defaults when available", () => {
		const classification = classifyPromptHeuristically(
			"Design a polished dashboard with stronger hierarchy and visual tone.",
		);
		const decision = decideRoute({
			candidates,
			classification,
			config: {
				...DEFAULT_ADAPTIVE_ROUTING_CONFIG,
				models: {
					excluded: [],
					ranked: ["openai/gpt-5.4", "anthropic/claude-opus-4.6"],
				},
			},
			currentThinking: "medium",
			usage: {
				providers: {
					anthropic: { confidence: "authoritative", remainingPct: 55 },
					openai: { confidence: "authoritative", remainingPct: 55 },
				},
				updatedAt: Date.now(),
			},
		});

		expect(decision?.selectedModel).toBe("openai/gpt-5.4");
		expect(decision?.explanation.codes).toContain("premium_allowed");
	});

	it("protects low-quota providers when reserve thresholds are crossed", () => {
		const classification = classifyPromptHeuristically(
			"Think deeply about a cross-provider architecture migration strategy.",
		);
		const decision = decideRoute({
			candidates,
			classification,
			config: {
				...DEFAULT_ADAPTIVE_ROUTING_CONFIG,
				providerReserves: {
					...DEFAULT_ADAPTIVE_ROUTING_CONFIG.providerReserves,
					openai: {
						allowOverrideForPeak: false,
						applyToTiers: DEFAULT_ADAPTIVE_ROUTING_CONFIG.providerReserves.openai?.applyToTiers,
						confidence: DEFAULT_ADAPTIVE_ROUTING_CONFIG.providerReserves.openai?.confidence,
						minRemainingPct: DEFAULT_ADAPTIVE_ROUTING_CONFIG.providerReserves.openai?.minRemainingPct ?? 15,
					},
				},
			},
			usage: {
				providers: {
					anthropic: { confidence: "authoritative", remainingPct: 40 },
					openai: { confidence: "authoritative", remainingPct: 5 },
				},
				updatedAt: Date.now(),
			},
		});

		expect(decision?.selectedModel).not.toBe("openai/gpt-5.4");
		expect(decision?.explanation.codes).toContain("premium_reserved");
	});

	it("evaluates the routing corpus fixtures", () => {
		const corpus = JSON.parse(
			readFileSync(new URL("fixtures.route-corpus.json", import.meta.url), "utf8"),
		) as CorpusEntry[];
		for (const fixture of corpus) {
			const classification = classifyPromptHeuristically(fixture.prompt);
			const decision = decideRoute({
				candidates,
				classification,
				config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
				usage: {
					providers: {
						anthropic: { confidence: "authoritative", remainingPct: 60 },
						groq: { confidence: "unknown", remainingPct: undefined },
						openai: { confidence: "authoritative", remainingPct: 60 },
					},
					updatedAt: Date.now(),
				},
			});

			expect(classification.intent, fixture.name).toBe(fixture.expectedIntent);
			expect(decision?.selectedModel, fixture.name).toBe(fixture.expectedModel);
			expect(decision?.selectedThinking, fixture.name).toBe(fixture.expectedThinking);
		}
	});
});
