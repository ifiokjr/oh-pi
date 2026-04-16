import { describe, expect, it } from "vitest";
import { findModelIntelligence, mergeDelegatedSelectionPolicies, selectDelegatedModel } from "./model-intelligence.js";

const sampleModels = [
	{
		provider: "openai",
		id: "gpt-5.4",
		name: "GPT-5.4",
		api: "openai-responses",
		baseUrl: "https://api.openai.com/v1",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 2.5, output: 15, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 400_000,
		maxTokens: 128_000,
	},
	{
		provider: "google",
		id: "gemini-2.5-flash",
		name: "Gemini 2.5 Flash",
		api: "google-generative-ai",
		baseUrl: "https://generativelanguage.googleapis.com",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0.1, output: 0.4, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1_000_000,
		maxTokens: 64_000,
	},
	{
		provider: "groq",
		id: "llama-3.3-70b-versatile",
		name: "Llama 3.3 70B Versatile",
		api: "openai-completions",
		baseUrl: "https://api.groq.com/openai/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 0.05, output: 0.08, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 32_000,
		maxTokens: 8_000,
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
				preferredProviders: ["openai"],
				blockedProviders: ["cursor"],
				preferLowerUsage: false,
			},
			{
				preferredProviders: ["google"],
				preferLowerUsage: true,
			},
		);

		expect(merged).toEqual({
			preferredProviders: ["google", "openai"],
			blockedProviders: ["cursor"],
			preferLowerUsage: true,
		});
	});

	it("prefers small fast models for small tasks when allowed", () => {
		const result = selectDelegatedModel({
			availableModels: [...sampleModels],
			policy: {
				taskProfile: "planning",
				preferFastModels: true,
				allowSmallContextForSmallTasks: true,
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
				taskProfile: "all",
				preferLowerUsage: true,
				allowSmallContextForSmallTasks: false,
			},
			usage: {
				openai: { remainingPct: 10, confidence: "authoritative" },
				google: { remainingPct: 80, confidence: "authoritative" },
			},
			taskText: "Compare available options and recommend a path.",
		});

		expect(result.selectedModel).toBe("google/gemini-2.5-flash");
	});

	it("filters blocked providers and enforces minimum context windows", () => {
		const result = selectDelegatedModel({
			availableModels: [...sampleModels],
			policy: {
				taskProfile: "coding",
				blockedProviders: ["google"],
				minContextWindow: 200_000,
			},
			taskText: "Refactor this large module and preserve all behavior.",
		});

		expect(result.selectedModel).toBe("openai/gpt-5.4");
		expect(result.rejected).toEqual(
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
			policy: {
				taskProfile: "planning",
				preferFastModels: true,
				allowSmallContextForSmallTasks: false,
			},
			latency: {
				"google/gemini-2.5-flash": { avgMs: 1500, count: 4 },
				"openai/gpt-5.4": { avgMs: 9000, count: 2 },
			},
			taskText: "Quickly compare the likely subsystems involved.",
		});

		expect(result.selectedModel).toBe("google/gemini-2.5-flash");
		expect(result.ranked[0]?.reasons).toContain("measured-latency:8");
	});
});
