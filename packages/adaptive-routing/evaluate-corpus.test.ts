import { describe, expect, it } from "vitest";
import { DEFAULT_ADAPTIVE_ROUTING_CONFIG } from "./defaults.js";
import { evaluateCorpus, formatEvaluationSummary } from "./evaluate-corpus.js";
import type { CorpusEntry } from "./evaluate-corpus.js";
import { normalizeRouteCandidates } from "./normalize.js";

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

const cheapQnaExample: CorpusEntry = {
	name: "quick-question-file-location",
	prompt: "What file registers the scheduler command?",
	expectedIntent: "quick-qna",
	expectedComplexity: 1,
	expectedRisk: "low",
	expectedTurns: "one",
	expectedToolIntensity: "low",
	expectedContextBreadth: "small",
	expectedTier: "cheap",
	expectedThinking: "minimal",
	expectedModel: "groq/llama-3.3-70b-versatile",
	acceptableFallbacks: [],
};

const designExample: CorpusEntry = {
	name: "design-polished-settings-page",
	prompt: "Design a polished settings page with better spacing, hierarchy, and visual tone.",
	expectedIntent: "design",
	expectedComplexity: 2,
	expectedRisk: "medium",
	expectedTurns: "few",
	expectedToolIntensity: "medium",
	expectedContextBreadth: "small",
	expectedTier: "cheap",
	expectedThinking: "minimal",
	expectedModel: "openai/gpt-5.4",
	acceptableFallbacks: ["anthropic/claude-opus-4.6"],
};

const architectureExample: CorpusEntry = {
	name: "peak-architecture-tradeoffs",
	prompt:
		"Think deeply about the architecture tradeoffs for migrating this multi-package routing system across providers.",
	expectedIntent: "architecture",
	expectedComplexity: 3,
	expectedRisk: "medium",
	expectedTurns: "few",
	expectedToolIntensity: "medium",
	expectedContextBreadth: "large",
	expectedTier: "balanced",
	expectedThinking: "medium",
	expectedModel: "openai/gpt-5.4",
	acceptableFallbacks: ["anthropic/claude-opus-4.6"],
};

describe("evaluateCorpus", () => {
	it("reports a perfect match on the cheap-qna example", () => {
		const result = evaluateCorpus([cheapQnaExample], {
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
			candidates,
		});

		expect(result.total).toBe(1);
		expect(result.mismatched).toBe(0);
		expect(result.modelMismatchCount).toBe(0);
		expect(result.intentAccuracy).toBe(1);
	});

	it("reports a perfect match on the design example", () => {
		const result = evaluateCorpus([designExample], {
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
			candidates,
		});

		expect(result.total).toBe(1);
		expect(result.mismatched).toBe(0);
		expect(result.modelMismatchCount).toBe(0);
	});

	it("reports a perfect match on the architecture example", () => {
		const result = evaluateCorpus([architectureExample], {
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
			candidates,
		});

		expect(result.total).toBe(1);
		expect(result.mismatched).toBe(0);
		expect(result.modelMismatchCount).toBe(0);
	});

	it("detects a model mismatch when the expected model differs", () => {
		const badExample: CorpusEntry = {
			...cheapQnaExample,
			expectedModel: "anthropic/claude-opus-4.6",
			acceptableFallbacks: [],
		};

		const result = evaluateCorpus([badExample], {
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
			candidates,
		});

		expect(result.modelMismatchCount).toBe(1);
		expect(result.mismatched).toBe(1);
	});

	it("allows an acceptable fallback without counting it as a mismatch", () => {
		const designWithFallback: CorpusEntry = {
			...designExample,
			expectedModel: "anthropic/claude-opus-4.6",
			acceptableFallbacks: ["openai/gpt-5.4"],
		};

		const result = evaluateCorpus([designWithFallback], {
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
			candidates,
		});

		expect(result.modelMismatchCount).toBe(0);
		expect(result.mismatched).toBe(0);
	});

	it("classifies a debug prompt correctly", () => {
		const debugExample: CorpusEntry = {
			name: "debug-failing-test",
			prompt: "Why is my test failing with this stack trace?",
			expectedIntent: "debugging",
			expectedComplexity: 1,
			expectedRisk: "medium",
			expectedTurns: "few",
			expectedToolIntensity: "high",
			expectedContextBreadth: "small",
			expectedTier: "premium",
			expectedThinking: "high",
			expectedModel: "openai/gpt-5.4",
			acceptableFallbacks: ["anthropic/claude-opus-4.6"],
		};

		const result = evaluateCorpus([debugExample], {
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
			candidates,
		});

		expect(result.total).toBe(1);
		expect(result.intentAccuracy).toBe(1);
		expect(result.mismatched).toBe(0);
	});

	it("reports an intent mismatch when the expected intent differs", () => {
		const badIntentExample: CorpusEntry = {
			...cheapQnaExample,
			expectedIntent: "design",
		};

		const result = evaluateCorpus([badIntentExample], {
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
			candidates,
		});

		expect(result.total).toBe(1);
		expect(result.mismatched).toBe(1);
		expect(result.runs[0].mismatches).toHaveLength(1);
		expect(result.runs[0].mismatches[0].fieldName).toBe("intent");
		expect(result.runs[0].mismatches[0].expected).toBe("design");
		expect(result.runs[0].mismatches[0].actual).toBe("quick-qna");
	});

	it("formats a summary with zero mismatches", () => {
		const result = evaluateCorpus([cheapQnaExample], {
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
			candidates,
		});
		const text = formatEvaluationSummary(result);
		expect(text).toContain("Matched: 1 / 1");
		expect(text).toContain("Mismatched: 0");
	});

	it("formats a summary with mismatches", () => {
		const badExample: CorpusEntry = {
			...cheapQnaExample,
			expectedModel: "anthropic/claude-opus-4.6",
			acceptableFallbacks: [],
		};

		const result = evaluateCorpus([badExample], {
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
			candidates,
		});
		const text = formatEvaluationSummary(result);
		expect(text).toContain("Mismatched: 1");
		expect(text).toContain("model: got");
	});
});
