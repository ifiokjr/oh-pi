import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyPromptHeuristically } from "./classifier.js";
import { DEFAULT_ADAPTIVE_ROUTING_CONFIG } from "./defaults.js";
import { decideRoute } from "./engine.js";
import { normalizeRouteCandidates } from "./normalize.js";

type CorpusEntry = {
	name: string;
	prompt: string;
	intent: string;
	expectedModel: string;
	expectedThinking: string;
};

const candidates = normalizeRouteCandidates([
	{
		provider: "anthropic",
		id: "claude-opus-4.6",
		name: "Claude Opus 4.6",
		api: "anthropic-messages",
		baseUrl: "https://api.anthropic.com",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 16384,
	},
	{
		provider: "openai",
		id: "gpt-5.4",
		name: "GPT-5.4",
		api: "openai-responses",
		baseUrl: "https://api.openai.com/v1",
		reasoning: true,
		input: ["text"],
		cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 32768,
	},
	{
		provider: "groq",
		id: "llama-3.3-70b-versatile",
		name: "Llama 3.3 70B Versatile",
		api: "openai-completions",
		baseUrl: "https://api.groq.com/openai/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 32768,
	},
] as never);

describe("adaptive routing engine", () => {
	it("routes design-heavy prompts toward non-Anthropic premium defaults when available", () => {
		const classification = classifyPromptHeuristically(
			"Design a polished dashboard with stronger hierarchy and visual tone.",
		);
		const decision = decideRoute({
			config: {
				...DEFAULT_ADAPTIVE_ROUTING_CONFIG,
				models: {
					ranked: ["openai/gpt-5.4", "anthropic/claude-opus-4.6"],
					excluded: [],
				},
			},
			candidates,
			classification,
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
			config: {
				...DEFAULT_ADAPTIVE_ROUTING_CONFIG,
				providerReserves: {
					...DEFAULT_ADAPTIVE_ROUTING_CONFIG.providerReserves,
					openai: {
						...DEFAULT_ADAPTIVE_ROUTING_CONFIG.providerReserves.openai,
						allowOverrideForPeak: false,
					},
				},
			},
			candidates,
			classification,
			usage: {
				providers: {
					openai: { confidence: "authoritative", remainingPct: 5 },
					anthropic: { confidence: "authoritative", remainingPct: 40 },
				},
				updatedAt: Date.now(),
			},
		});

		expect(decision?.selectedModel).not.toBe("openai/gpt-5.4");
		expect(decision?.explanation.codes).toContain("premium_reserved");
	});

	it("evaluates the routing corpus fixtures", () => {
		const corpus = JSON.parse(
			readFileSync(new URL("./fixtures.route-corpus.json", import.meta.url), "utf-8"),
		) as CorpusEntry[];
		for (const fixture of corpus) {
			const classification = classifyPromptHeuristically(fixture.prompt);
			const decision = decideRoute({
				config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
				candidates,
				classification,
				usage: {
					providers: {
						anthropic: { confidence: "authoritative", remainingPct: 60 },
						openai: { confidence: "authoritative", remainingPct: 60 },
						groq: { confidence: "unknown", remainingPct: undefined },
					},
					updatedAt: Date.now(),
				},
			});

			expect(classification.intent, fixture.name).toBe(fixture.intent);
			expect(decision?.selectedModel, fixture.name).toBe(fixture.expectedModel);
			expect(decision?.selectedThinking, fixture.name).toBe(fixture.expectedThinking);
		}
	});
});
