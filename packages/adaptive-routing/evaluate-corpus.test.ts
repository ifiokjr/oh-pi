import { DEFAULT_ADAPTIVE_ROUTING_CONFIG } from "./defaults.js";
import { evaluateCorpus, formatEvaluationSummary } from "./evaluate-corpus.js";
import { normalizeRouteCandidates } from "./normalize.js";
import type { CorpusEntry } from "./evaluate-corpus.js";

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

const cheapQnaExample: CorpusEntry = {
	acceptableFallbacks: [],
	expectedComplexity: 1,
	expectedContextBreadth: "small",
	expectedIntent: "quick-qna",
	expectedModel: "groq/llama-3.3-70b-versatile",
	expectedRisk: "low",
	expectedThinking: "minimal",
	expectedTier: "cheap",
	expectedToolIntensity: "low",
	expectedTurns: "one",
	name: "quick-question-file-location",
	prompt: "What file registers the scheduler command?",
};

const designExample: CorpusEntry = {
	acceptableFallbacks: ["anthropic/claude-opus-4.6"],
	expectedComplexity: 2,
	expectedContextBreadth: "small",
	expectedIntent: "design",
	expectedModel: "openai/gpt-5.4",
	expectedRisk: "medium",
	expectedThinking: "minimal",
	expectedTier: "cheap",
	expectedToolIntensity: "medium",
	expectedTurns: "few",
	name: "design-polished-settings-page",
	prompt: "Design a polished settings page with better spacing, hierarchy, and visual tone.",
};

const architectureExample: CorpusEntry = {
	acceptableFallbacks: ["anthropic/claude-opus-4.6"],
	expectedComplexity: 3,
	expectedContextBreadth: "large",
	expectedIntent: "architecture",
	expectedModel: "openai/gpt-5.4",
	expectedRisk: "medium",
	expectedThinking: "medium",
	expectedTier: "balanced",
	expectedToolIntensity: "medium",
	expectedTurns: "few",
	name: "peak-architecture-tradeoffs",
	prompt:
		"Think deeply about the architecture tradeoffs for migrating this multi-package routing system across providers.",
};

describe(evaluateCorpus, () => {
	it("reports a perfect match on the cheap-qna example", () => {
		const result = evaluateCorpus([cheapQnaExample], {
			candidates,
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
		});

		expect(result.total).toBe(1);
		expect(result.mismatched).toBe(0);
		expect(result.modelMismatchCount).toBe(0);
		expect(result.intentAccuracy).toBe(1);
	});

	it("reports a perfect match on the design example", () => {
		const result = evaluateCorpus([designExample], {
			candidates,
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
		});

		expect(result.total).toBe(1);
		expect(result.mismatched).toBe(0);
		expect(result.modelMismatchCount).toBe(0);
	});

	it("reports a perfect match on the architecture example", () => {
		const result = evaluateCorpus([architectureExample], {
			candidates,
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
		});

		expect(result.total).toBe(1);
		expect(result.mismatched).toBe(0);
		expect(result.modelMismatchCount).toBe(0);
	});

	it("detects a model mismatch when the expected model differs", () => {
		const badExample: CorpusEntry = {
			...cheapQnaExample,
			acceptableFallbacks: [],
			expectedModel: "anthropic/claude-opus-4.6",
		};

		const result = evaluateCorpus([badExample], {
			candidates,
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
		});

		expect(result.modelMismatchCount).toBe(1);
		expect(result.mismatched).toBe(1);
	});

	it("allows an acceptable fallback without counting it as a mismatch", () => {
		const designWithFallback: CorpusEntry = {
			...designExample,
			acceptableFallbacks: ["openai/gpt-5.4"],
			expectedModel: "anthropic/claude-opus-4.6",
		};

		const result = evaluateCorpus([designWithFallback], {
			candidates,
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
		});

		expect(result.modelMismatchCount).toBe(0);
		expect(result.mismatched).toBe(0);
	});

	it("classifies a debug prompt correctly", () => {
		const debugExample: CorpusEntry = {
			acceptableFallbacks: ["anthropic/claude-opus-4.6"],
			expectedComplexity: 1,
			expectedContextBreadth: "small",
			expectedIntent: "debugging",
			expectedModel: "openai/gpt-5.4",
			expectedRisk: "medium",
			expectedThinking: "high",
			expectedTier: "premium",
			expectedToolIntensity: "high",
			expectedTurns: "few",
			name: "debug-failing-test",
			prompt: "Why is my test failing with this stack trace?",
		};

		const result = evaluateCorpus([debugExample], {
			candidates,
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
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
			candidates,
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
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
			candidates,
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
		});
		const text = formatEvaluationSummary(result);
		expect(text).toContain("Matched: 1 / 1");
		expect(text).toContain("Mismatched: 0");
	});

	it("formats a summary with mismatches", () => {
		const badExample: CorpusEntry = {
			...cheapQnaExample,
			acceptableFallbacks: [],
			expectedModel: "anthropic/claude-opus-4.6",
		};

		const result = evaluateCorpus([badExample], {
			candidates,
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
		});
		const text = formatEvaluationSummary(result);
		expect(text).toContain("Mismatched: 1");
		expect(text).toContain("model: got");
	});
});
