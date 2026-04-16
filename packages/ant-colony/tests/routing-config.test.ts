import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getAgentDir } = vi.hoisted(() => ({
	getAgentDir: vi.fn(() => "/mock-home/.pi/agent"),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({ getAgentDir }));
vi.mock("@ifi/oh-pi-core", async () => {
	return await import("../../core/src/model-intelligence.ts");
});
vi.mock("@ifi/pi-extension-adaptive-routing/delegated-runtime.ts", async () => {
	return await import("../../adaptive-routing/delegated-runtime.ts");
});

import { DEFAULT_COLONY_CATEGORIES, resolveColonyCategoryModel, toAvailableModelRefs } from "../extensions/ant-colony/routing-config.js";

afterEach(() => {
	vi.clearAllMocks();
});

describe("resolveColonyCategoryModel", () => {
	it("ships non-Anthropic default colony categories", () => {
		expect(DEFAULT_COLONY_CATEGORIES.scout).toBe("quick-discovery");
		expect(DEFAULT_COLONY_CATEGORIES.worker).toBe("implementation-default");
		expect(DEFAULT_COLONY_CATEGORIES.soldier).toBe("review-critical");
	});

	it("resolves a model from delegated routing config", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "ant-routing-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "extensions", "adaptive-routing"), { recursive: true });
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			JSON.stringify(
				{
					delegatedRouting: {
						enabled: true,
						categories: {
							"review-critical": {
								preferredProviders: ["openai", "google"],
							},
						},
					},
				},
				null,
				2,
			),
		);

		try {
			const result = resolveColonyCategoryModel("review-critical", [
				{
					provider: "google",
					id: "gemini-2.5-pro",
					name: "Gemini 2.5 Pro",
					reasoning: true,
					input: ["text", "image"],
					contextWindow: 1_000_000,
					maxTokens: 64_000,
					cost: { input: 1.25, output: 5, cacheRead: 0, cacheWrite: 0 },
					fullId: "google/gemini-2.5-pro",
				},
				{
					provider: "openai",
					id: "gpt-5.4",
					name: "GPT-5.4",
					reasoning: true,
					input: ["text", "image"],
					contextWindow: 400_000,
					maxTokens: 128_000,
					cost: { input: 2.5, output: 15, cacheRead: 0, cacheWrite: 0 },
					fullId: "openai/gpt-5.4",
				},
			]);
			expect(result).toEqual({
				model: "openai/gpt-5.4",
				category: "review-critical",
				source: "delegated-category",
			});
		} finally {
			rmSync(tempAgentDir, { recursive: true, force: true });
		}
	});

	it("applies per-role overrides when present", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "ant-routing-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "extensions", "adaptive-routing"), { recursive: true });
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			JSON.stringify(
				{
					delegatedRouting: {
						enabled: true,
						categories: {
							"quick-discovery": {
								preferredProviders: ["google", "openai"],
							},
						},
					},
					delegatedModelSelection: {
						roleOverrides: {
							"colony:scout": {
								preferredModels: ["openai/gpt-5-mini"],
							},
						},
					},
				},
				null,
				2,
			),
		);

		try {
			const result = resolveColonyCategoryModel(
				"quick-discovery",
				[
					{
						provider: "google",
						id: "gemini-2.5-flash",
						name: "Gemini 2.5 Flash",
						reasoning: true,
						input: ["text", "image"],
						contextWindow: 1_000_000,
						maxTokens: 64_000,
						cost: { input: 0.1, output: 0.4, cacheRead: 0, cacheWrite: 0 },
						fullId: "google/gemini-2.5-flash",
					},
					{
						provider: "openai",
						id: "gpt-5-mini",
						name: "GPT-5 Mini",
						reasoning: true,
						input: ["text", "image"],
						contextWindow: 400_000,
						maxTokens: 128_000,
						cost: { input: 0.25, output: 2, cacheRead: 0, cacheWrite: 0 },
						fullId: "openai/gpt-5-mini",
					},
				],
				{ roleKeys: ["colony:scout"], taskText: "Scan the repo and identify the key files." },
			);
			expect(result.model).toBe("openai/gpt-5-mini");
			expect(result.source).toBe("delegated-category");
		} finally {
			rmSync(tempAgentDir, { recursive: true, force: true });
		}
	});

	it("adds full ids when converting available model refs", () => {
		expect(
			toAvailableModelRefs([
				{
					provider: "google",
					id: "gemini-2.5-flash",
					name: "Gemini 2.5 Flash",
					reasoning: true,
					input: ["text", "image"],
					contextWindow: 1_000_000,
					maxTokens: 64_000,
					cost: { input: 0.1, output: 0.4, cacheRead: 0, cacheWrite: 0 },
				},
			])[0]?.fullId,
		).toBe("google/gemini-2.5-flash");
	});

	it("falls back to groq for quick-discovery when provider preferences miss", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "ant-routing-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "extensions", "adaptive-routing"), { recursive: true });
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			JSON.stringify(
				{
					delegatedRouting: {
						enabled: true,
						categories: {
							"quick-discovery": {
								preferredProviders: ["openai", "google"],
							},
						},
					},
				},
				null,
				2,
			),
		);
		try {
			const result = resolveColonyCategoryModel("quick-discovery", [
				{
					provider: "groq",
					id: "llama-3.3-70b-versatile",
					name: "Llama 3.3 70B Versatile",
					reasoning: false,
					input: ["text"],
					contextWindow: 32_000,
					maxTokens: 8_000,
					cost: { input: 0.05, output: 0.08, cacheRead: 0, cacheWrite: 0 },
					fullId: "groq/llama-3.3-70b-versatile",
				},
			]);
			expect(result.model).toBe("groq/llama-3.3-70b-versatile");
		} finally {
			rmSync(tempAgentDir, { recursive: true, force: true });
		}
	});

	it("uses measured latency to prefer faster scout models", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "ant-routing-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "extensions", "adaptive-routing"), { recursive: true });
		mkdirSync(join(tempAgentDir, "adaptive-routing"), { recursive: true });
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			JSON.stringify(
				{
					delegatedRouting: {
						enabled: true,
						categories: {
							"quick-discovery": {
								candidates: ["google/gemini-2.5-flash", "openai/gpt-5-mini"],
								preferredProviders: ["openai", "google"],
								preferFastModels: true,
							},
						},
					},
				},
				null,
				2,
			),
		);
		writeFileSync(
			join(tempAgentDir, "adaptive-routing", "aggregates.json"),
			JSON.stringify(
				{
					perModelLatencyMs: {
						"google/gemini-2.5-flash": { avgMs: 1200, count: 3 },
						"openai/gpt-5-mini": { avgMs: 6000, count: 2 },
					},
				},
				null,
				2,
			),
		);

		try {
			const result = resolveColonyCategoryModel(
				"quick-discovery",
				[
					{
						provider: "google",
						id: "gemini-2.5-flash",
						name: "Gemini 2.5 Flash",
						reasoning: true,
						input: ["text", "image"],
						contextWindow: 1_000_000,
						maxTokens: 64_000,
						cost: { input: 0.1, output: 0.4, cacheRead: 0, cacheWrite: 0 },
						fullId: "google/gemini-2.5-flash",
					},
					{
						provider: "openai",
						id: "gpt-5-mini",
						name: "GPT-5 Mini",
						reasoning: true,
						input: ["text", "image"],
						contextWindow: 400_000,
						maxTokens: 128_000,
						cost: { input: 0.25, output: 2, cacheRead: 0, cacheWrite: 0 },
						fullId: "openai/gpt-5-mini",
					},
				],
				{ roleKeys: ["colony:scout"], taskText: "Quickly inspect the repository." },
			);
			expect(result.model).toBe("google/gemini-2.5-flash");
		} finally {
			rmSync(tempAgentDir, { recursive: true, force: true });
		}
	});
});
