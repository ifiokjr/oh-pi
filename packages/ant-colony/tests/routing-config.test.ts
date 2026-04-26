import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";


const { getAgentDir } = vi.hoisted(() => ({
	getAgentDir: vi.fn(() => "/mock-home/.pi/agent"),
}));

vi.mock<typeof import('@mariozechner/pi-coding-agent')>(import('@mariozechner/pi-coding-agent'), () => ({ getAgentDir }));
vi.mock<typeof import('@ifi/oh-pi-core')>(import('@ifi/oh-pi-core'), async () => await import("../../core/src/model-intelligence.ts"));

import {
	DEFAULT_COLONY_CATEGORIES,
	resolveColonyCategoryModel,
	toAvailableModelRefs,
} from "../extensions/ant-colony/routing-config.js";

afterEach(() => {
	vi.clearAllMocks();
});

describe(resolveColonyCategoryModel, () => {
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
						categories: {
							"review-critical": {
								preferredProviders: ["openai", "google"],
							},
						},
						enabled: true,
					},
				},
				null,
				2,
			),
		);

		try {
			const result = resolveColonyCategoryModel("review-critical", [
				{
					contextWindow: 1_000_000,
					cost: { cacheRead: 0, cacheWrite: 0, input: 1.25, output: 5 },
					fullId: "google/gemini-2.5-pro",
					id: "gemini-2.5-pro",
					input: ["text", "image"],
					maxTokens: 64_000,
					name: "Gemini 2.5 Pro",
					provider: "google",
					reasoning: true,
				},
				{
					contextWindow: 400_000,
					cost: { cacheRead: 0, cacheWrite: 0, input: 2.5, output: 15 },
					fullId: "openai/gpt-5.4",
					id: "gpt-5.4",
					input: ["text", "image"],
					maxTokens: 128_000,
					name: "GPT-5.4",
					provider: "openai",
					reasoning: true,
				},
			]);
			expect(result).toStrictEqual({
				category: "review-critical",
				model: "openai/gpt-5.4",
				source: "delegated-category",
			});
		} finally {
			rmSync(tempAgentDir, { force: true, recursive: true });
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
					delegatedModelSelection: {
						roleOverrides: {
							"colony:scout": {
								preferredModels: ["openai/gpt-5-mini"],
							},
						},
					},
					delegatedRouting: {
						categories: {
							"quick-discovery": {
								preferredProviders: ["google", "openai"],
							},
						},
						enabled: true,
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
						contextWindow: 1_000_000,
						cost: { cacheRead: 0, cacheWrite: 0, input: 0.1, output: 0.4 },
						fullId: "google/gemini-2.5-flash",
						id: "gemini-2.5-flash",
						input: ["text", "image"],
						maxTokens: 64_000,
						name: "Gemini 2.5 Flash",
						provider: "google",
						reasoning: true,
					},
					{
						contextWindow: 400_000,
						cost: { cacheRead: 0, cacheWrite: 0, input: 0.25, output: 2 },
						fullId: "openai/gpt-5-mini",
						id: "gpt-5-mini",
						input: ["text", "image"],
						maxTokens: 128_000,
						name: "GPT-5 Mini",
						provider: "openai",
						reasoning: true,
					},
				],
				{ roleKeys: ["colony:scout"], taskText: "Scan the repo and identify the key files." },
			);
			expect(result.model).toBe("openai/gpt-5-mini");
			expect(result.source).toBe("delegated-category");
		} finally {
			rmSync(tempAgentDir, { force: true, recursive: true });
		}
	});

	it("adds full ids when converting available model refs", () => {
		expect(
			toAvailableModelRefs([
				{
					contextWindow: 1_000_000,
					cost: { cacheRead: 0, cacheWrite: 0, input: 0.1, output: 0.4 },
					id: "gemini-2.5-flash",
					input: ["text", "image"],
					maxTokens: 64_000,
					name: "Gemini 2.5 Flash",
					provider: "google",
					reasoning: true,
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
						categories: {
							"quick-discovery": {
								preferredProviders: ["openai", "google"],
							},
						},
						enabled: true,
					},
				},
				null,
				2,
			),
		);
		try {
			const result = resolveColonyCategoryModel("quick-discovery", [
				{
					contextWindow: 32_000,
					cost: { cacheRead: 0, cacheWrite: 0, input: 0.05, output: 0.08 },
					fullId: "groq/llama-3.3-70b-versatile",
					id: "llama-3.3-70b-versatile",
					input: ["text"],
					maxTokens: 8_000,
					name: "Llama 3.3 70B Versatile",
					provider: "groq",
					reasoning: false,
				},
			]);
			expect(result.model).toBe("groq/llama-3.3-70b-versatile");
		} finally {
			rmSync(tempAgentDir, { force: true, recursive: true });
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
						categories: {
							"quick-discovery": {
								candidates: ["google/gemini-2.5-flash", "openai/gpt-5-mini"],
								preferFastModels: true,
								preferredProviders: ["openai", "google"],
							},
						},
						enabled: true,
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
						contextWindow: 1_000_000,
						cost: { cacheRead: 0, cacheWrite: 0, input: 0.1, output: 0.4 },
						fullId: "google/gemini-2.5-flash",
						id: "gemini-2.5-flash",
						input: ["text", "image"],
						maxTokens: 64_000,
						name: "Gemini 2.5 Flash",
						provider: "google",
						reasoning: true,
					},
					{
						contextWindow: 400_000,
						cost: { cacheRead: 0, cacheWrite: 0, input: 0.25, output: 2 },
						fullId: "openai/gpt-5-mini",
						id: "gpt-5-mini",
						input: ["text", "image"],
						maxTokens: 128_000,
						name: "GPT-5 Mini",
						provider: "openai",
						reasoning: true,
					},
				],
				{ roleKeys: ["colony:scout"], taskText: "Quickly inspect the repository." },
			);
			expect(result.model).toBe("google/gemini-2.5-flash");
		} finally {
			rmSync(tempAgentDir, { force: true, recursive: true });
		}
	});
});
