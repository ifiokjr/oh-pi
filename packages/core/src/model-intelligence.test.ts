
import { findModelIntelligence, mergeDelegatedSelectionPolicies, selectDelegatedModel } from "./model-intelligence.js";

const sampleModels = [
	{
		api: "openai-responses",
		baseUrl: "https://api.openai.com/v1",
		contextWindow: 400_000,
		cost: { cacheRead: 0, cacheWrite: 0, input: 2.5, output: 15 },
		id: "gpt-5.4",
		input: ["text", "image"],
		maxTokens: 128_000,
		name: "GPT-5.4",
		provider: "openai",
		reasoning: true,
	},
	{
		api: "google-generative-ai",
		baseUrl: "https://generativelanguage.googleapis.com",
		contextWindow: 1_000_000,
		cost: { cacheRead: 0, cacheWrite: 0, input: 0.1, output: 0.4 },
		id: "gemini-2.5-flash",
		input: ["text", "image"],
		maxTokens: 64_000,
		name: "Gemini 2.5 Flash",
		provider: "google",
		reasoning: true,
	},
	{
		api: "openai-completions",
		baseUrl: "https://api.groq.com/openai/v1",
		contextWindow: 32_000,
		cost: { cacheRead: 0, cacheWrite: 0, input: 0.05, output: 0.08 },
		id: "llama-3.3-70b-versatile",
		input: ["text"],
		maxTokens: 8_000,
		name: "Llama 3.3 70B Versatile",
		provider: "groq",
		reasoning: false,
	},
] as const;

describe("model intelligence", () => {
	it("finds runtime intelligence by provider/model reference", () => {
		const intelligence = findModelIntelligence("openai/gpt-5.4");
		expect(intelligence).toBeDefined();
		expect(intelligence?.overallScore).toBeGreaterThan(0);
	});

	it("merges delegated selection policies with override precedence", () => {
		const merged = mergeDelegatedSelectionPolicies(
			{
				blockedProviders: ["cursor"],
				preferLowerUsage: false,
				preferredProviders: ["openai"],
			},
			{
				preferLowerUsage: true,
				preferredProviders: ["google"],
			},
		);

		expect(merged).toStrictEqual({
			blockedProviders: ["cursor"],
			preferLowerUsage: true,
			preferredProviders: ["google", "openai"],
		});
	});

	it("prefers small fast models for small tasks when allowed", () => {
		const result = selectDelegatedModel({
			availableModels: [...sampleModels],
			policy: {
				allowSmallContextForSmallTasks: true,
				preferFastModels: true,
				taskProfile: "planning",
			},
			taskText: "List the likely files involved and summarize next steps.",
		});

		expect(result.selectedModel).toBe("groq/llama-3.3-70b-versatile");
		expect(result.taskSize).toBe("small");
	});

	it("prefers providers with more remaining quota when usage data is available", () => {
		const result = selectDelegatedModel({
			availableModels: [...sampleModels],
			policy: {
				allowSmallContextForSmallTasks: false,
				preferLowerUsage: true,
				taskProfile: "all",
			},
			taskText: "Compare available options and recommend a path.",
			usage: {
				google: { confidence: "authoritative", remainingPct: 80 },
				openai: { confidence: "authoritative", remainingPct: 10 },
			},
		});

		expect(result.selectedModel).toBe("google/gemini-2.5-flash");
	});

	it("filters blocked providers and enforces minimum context windows", () => {
		const result = selectDelegatedModel({
			availableModels: [...sampleModels],
			policy: {
				blockedProviders: ["google"],
				minContextWindow: 200_000,
				taskProfile: "coding",
			},
			taskText: "Refactor this large module and preserve all behavior.",
		});

		expect(result.selectedModel).toBe("openai/gpt-5.4");
		expect(result.rejected).toStrictEqual(
			expect.arrayContaining([
				expect.objectContaining({ model: "google/gemini-2.5-flash", reason: "provider-blocked" }),
				expect.objectContaining({
					model: "groq/llama-3.3-70b-versatile",
					reason: expect.stringContaining("context-too-small"),
				}),
			]),
		);
	});

	it("uses measured latency when fast preference is enabled", () => {
		const result = selectDelegatedModel({
			availableModels: [...sampleModels],
			latency: {
				"google/gemini-2.5-flash": { avgMs: 1500, count: 4 },
				"openai/gpt-5.4": { avgMs: 9000, count: 2 },
			},
			policy: {
				allowSmallContextForSmallTasks: false,
				preferFastModels: true,
				taskProfile: "planning",
			},
			taskText: "Quickly compare the likely subsystems involved.",
		});

		expect(result.selectedModel).toBe("google/gemini-2.5-flash");
		expect(result.ranked[0]?.reasons).toContain("measured-latency:8");
	});
});
