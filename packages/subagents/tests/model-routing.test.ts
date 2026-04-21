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

import { findAvailableModel, resolveSubagentModelResolution, toAvailableModelRefs } from "../model-routing.js";

const sampleModels = [
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
];

afterEach(() => {
	vi.clearAllMocks();
});

describe("resolveSubagentModelResolution", () => {
	it("prefers explicit runtime overrides over delegated categories", () => {
		const result = resolveSubagentModelResolution(
			{
				name: "scout",
				description: "Scout",
				systemPrompt: "Prompt",
				source: "builtin",
				filePath: "/tmp/scout.md",
				extraFields: { category: "quick-discovery" },
			},
			sampleModels,
			"openai/gpt-5-mini",
		);
		expect(result).toEqual({
			model: "openai/gpt-5-mini",
			source: "runtime-override",
			category: "quick-discovery",
		});
	});

	it("resolves delegated categories from adaptive routing config", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "subagent-routing-"));
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
								candidates: ["google/gemini-2.5-flash", "openai/gpt-5-mini"],
								preferredProviders: ["google", "openai"],
							},
						},
					},
				},
				null,
				2,
			),
		);

		try {
			const result = resolveSubagentModelResolution(
				{
					name: "scout",
					description: "Scout",
					systemPrompt: "Prompt",
					source: "builtin",
					filePath: "/tmp/scout.md",
					extraFields: { category: "quick-discovery" },
				},
				sampleModels,
			);
			expect(result).toEqual({
				model: "google/gemini-2.5-flash",
				source: "delegated-category",
				category: "quick-discovery",
			});
		} finally {
			rmSync(tempAgentDir, { recursive: true, force: true });
		}
	});

	it("applies provider disables and per-subagent overrides", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "subagent-routing-"));
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
						disabledProviders: ["google"],
						roleOverrides: {
							"subagent:scout": {
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
			const result = resolveSubagentModelResolution(
				{
					name: "scout",
					description: "Scout",
					systemPrompt: "Prompt",
					source: "builtin",
					filePath: "/tmp/scout.md",
					extraFields: { category: "quick-discovery" },
				},
				sampleModels,
				undefined,
				{ taskText: "Briefly inspect the repo and summarize the likely entry points." },
			);
			expect(result.model).toBe("openai/gpt-5-mini");
			expect(result.source).toBe("delegated-category");
		} finally {
			rmSync(tempAgentDir, { recursive: true, force: true });
		}
	});

	it("uses usage snapshots plus latency telemetry for delegated selection", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "subagent-routing-"));
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
					delegatedModelSelection: {
						preferLowerUsage: true,
					},
				},
				null,
				2,
			),
		);
		writeFileSync(
			join(tempAgentDir, "usage-tracker-rate-limits.json"),
			JSON.stringify(
				{
					providers: {
						openai: { windows: [{ percentLeft: 15 }] },
						google: { windows: [{ percentLeft: 80 }] },
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
						"google/gemini-2.5-flash": { avgMs: 1500, count: 4 },
						"openai/gpt-5-mini": { avgMs: 7000, count: 2 },
					},
				},
				null,
				2,
			),
		);

		try {
			const result = resolveSubagentModelResolution(
				{
					name: "scout",
					description: "Scout",
					systemPrompt: "Prompt",
					source: "builtin",
					filePath: "/tmp/scout.md",
					extraFields: { category: "quick-discovery" },
				},
				sampleModels,
				undefined,
				{ taskText: "Quickly scan the project and summarize the likely hotspots." },
			);
			expect(result.model).toBe("google/gemini-2.5-flash");
		} finally {
			rmSync(tempAgentDir, { recursive: true, force: true });
		}
	});

	it("infers task profiles from agent names without explicit categories", () => {
		expect(
			resolveSubagentModelResolution(
				{ name: "planner", description: "", systemPrompt: "", source: "builtin", filePath: "/tmp/planner.md" },
				sampleModels,
			).model,
		).toBeDefined();
		expect(
			resolveSubagentModelResolution(
				{ name: "design-helper", description: "", systemPrompt: "", source: "builtin", filePath: "/tmp/design.md" },
				sampleModels,
			).source,
		).toBe("delegated-category");
		expect(
			resolveSubagentModelResolution(
				{ name: "writer-docs", description: "", systemPrompt: "", source: "builtin", filePath: "/tmp/write.md" },
				sampleModels,
			).source,
		).toBe("delegated-category");
		expect(
			resolveSubagentModelResolution(
				{ name: "code-helper", description: "", systemPrompt: "", source: "builtin", filePath: "/tmp/code.md" },
				sampleModels,
			).source,
		).toBe("delegated-category");
		expect(
			resolveSubagentModelResolution(
				{ name: "generalist", description: "", systemPrompt: "", source: "builtin", filePath: "/tmp/general.md" },
				sampleModels,
			).source,
		).toBe("delegated-category");
	});

	it("adds full ids when converting available model refs", () => {
		const refs = toAvailableModelRefs([
			{
				provider: "openai",
				id: "gpt-5-mini",
				name: "GPT-5 Mini",
				reasoning: true,
				input: ["text", "image"],
				contextWindow: 400_000,
				maxTokens: 128_000,
				cost: { input: 0.25, output: 2, cacheRead: 0, cacheWrite: 0 },
			},
		]);
		expect(refs[0]?.fullId).toBe("openai/gpt-5-mini");
	});

	it("prefers measured-fast models when latency telemetry exists", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "subagent-routing-"));
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
						"google/gemini-2.5-flash": { avgMs: 1500, count: 4 },
						"openai/gpt-5-mini": { avgMs: 7000, count: 2 },
					},
				},
				null,
				2,
			),
		);

		try {
			const result = resolveSubagentModelResolution(
				{
					name: "scout",
					description: "Scout",
					systemPrompt: "Prompt",
					source: "builtin",
					filePath: "/tmp/scout.md",
					extraFields: { category: "quick-discovery" },
				},
				sampleModels,
				undefined,
				{ taskText: "Quickly scan the project and summarize the likely hotspots." },
			);
			expect(result.model).toBe("google/gemini-2.5-flash");
		} finally {
			rmSync(tempAgentDir, { recursive: true, force: true });
		}
	});

	describe("findAvailableModel", () => {
		it("resolves full IDs that exist in available models", () => {
			expect(findAvailableModel("openai/gpt-5-mini", sampleModels)).toBe("openai/gpt-5-mini");
		});

		it("resolves bare IDs to full IDs when available", () => {
			expect(findAvailableModel("gpt-5-mini", sampleModels)).toBe("openai/gpt-5-mini");
		});

		it("preserves thinking suffixes when resolving", () => {
			expect(findAvailableModel("gpt-5-mini:high", sampleModels)).toBe("openai/gpt-5-mini:high");
		});

		it("returns undefined for unavailable models", () => {
			expect(findAvailableModel("github-models/openai/gpt-4o-mini", sampleModels)).toBeUndefined();
			expect(findAvailableModel("nonexistent-model", sampleModels)).toBeUndefined();
		});

		it("returns undefined for undefined input", () => {
			expect(findAvailableModel(undefined, sampleModels)).toBeUndefined();
		});
	});

	describe("model validation in resolution", () => {
		it("rejects unavailable runtime overrides and falls through", () => {
			const result = resolveSubagentModelResolution(
				{
					name: "scout",
					description: "Scout",
					systemPrompt: "Prompt",
					source: "builtin",
					filePath: "/tmp/scout.md",
				},
				[],
				"github-models/openai/gpt-4o-mini",
			);
			expect(result.source).toBe("session-default");
			expect(result.model).toBeUndefined();
		});

		it("rejects unavailable frontmatter models and falls through", () => {
			const result = resolveSubagentModelResolution(
				{
					name: "scout",
					description: "Scout",
					systemPrompt: "Prompt",
					source: "builtin",
					filePath: "/tmp/scout.md",
					model: "github-models/openai/gpt-4o-mini",
				},
				[],
			);
			expect(result.source).not.toBe("frontmatter-model");
			expect(result.model).toBeUndefined();
		});

		it("falls back to available session-default currentModel", () => {
			const result = resolveSubagentModelResolution(
				{
					name: "scout",
					description: "Scout",
					systemPrompt: "Prompt",
					source: "builtin",
					filePath: "/tmp/scout.md",
				},
				sampleModels,
				undefined,
				{ currentModel: "google/gemini-2.5-flash" },
			);
			expect(result.model).toBe("google/gemini-2.5-flash");
			expect(result.category).toBeUndefined();
		});

		it("rejects unavailable session-default currentModel", () => {
			const result = resolveSubagentModelResolution(
				{
					name: "scout",
					description: "Scout",
					systemPrompt: "Prompt",
					source: "builtin",
					filePath: "/tmp/scout.md",
				},
				[],
				undefined,
				{ currentModel: "github-models/openai/gpt-4o-mini" },
			);
			expect(result.source).toBe("session-default");
			expect(result.model).toBeUndefined();
		});
	});
});
