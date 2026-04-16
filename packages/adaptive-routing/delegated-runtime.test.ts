import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAgentDir } = vi.hoisted(() => ({
	getAgentDir: vi.fn(() => "/mock-home/.pi/agent"),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	getAgentDir,
}));
vi.mock("@ifi/oh-pi-core", async () => {
	return await import("../core/src/model-intelligence.js");
});

import {
	buildDelegatedSelectionPolicy,
	inspectDelegatedSelection,
	readDelegatedSelectionLatencySnapshot,
	readDelegatedSelectionUsageSnapshot,
	type DelegatedAvailableModelRef,
} from "./delegated-runtime.js";

const sampleModels: DelegatedAvailableModelRef[] = [
	{
		provider: "openai",
		id: "gpt-5-mini",
		fullId: "openai/gpt-5-mini",
		name: "GPT-5 Mini",
		reasoning: true,
		input: ["text", "image"],
		contextWindow: 400_000,
		maxTokens: 128_000,
		cost: { input: 0.25, output: 2, cacheRead: 0, cacheWrite: 0 },
	},
	{
		provider: "google",
		id: "gemini-2.5-flash",
		fullId: "google/gemini-2.5-flash",
		name: "Gemini 2.5 Flash",
		reasoning: true,
		input: ["text", "image"],
		contextWindow: 1_000_000,
		maxTokens: 64_000,
		cost: { input: 0.1, output: 0.4, cacheRead: 0, cacheWrite: 0 },
	},
];

describe("delegated runtime helpers", () => {
	let tempAgentDir: string;

	beforeEach(() => {
		tempAgentDir = mkdtempSync(join(tmpdir(), "delegated-runtime-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "extensions", "adaptive-routing"), { recursive: true });
	});

	afterEach(() => {
		rmSync(tempAgentDir, { recursive: true, force: true });
		vi.clearAllMocks();
	});

	it("reads delegated usage snapshots from usage-tracker cache", () => {
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

		expect(readDelegatedSelectionUsageSnapshot()).toEqual({
			openai: { remainingPct: 15, confidence: "estimated" },
			google: { remainingPct: 80, confidence: "estimated" },
		});
	});

	it("reads measured delegated latency snapshots from adaptive-routing aggregates", () => {
		mkdirSync(join(tempAgentDir, "adaptive-routing"), { recursive: true });
		writeFileSync(
			join(tempAgentDir, "adaptive-routing", "aggregates.json"),
			JSON.stringify(
				{
					perModelLatencyMs: {
						"google/gemini-2.5-flash": { avgMs: 1500, count: 4 },
						"openai/gpt-5-mini": { avgMs: 5000, count: 2 },
					},
				},
				null,
				2,
			),
		);

		expect(readDelegatedSelectionLatencySnapshot()).toEqual({
			"google/gemini-2.5-flash": { avgMs: 1500, count: 4 },
			"openai/gpt-5-mini": { avgMs: 5000, count: 2 },
		});
	});

	it("builds merged delegated policies from category defaults and role overrides", () => {
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			JSON.stringify(
				{
					delegatedRouting: {
						enabled: true,
						categories: {
							"quick-discovery": {
								preferredProviders: ["google"],
								preferFastModels: true,
							},
						},
					},
					delegatedModelSelection: {
						disabledProviders: ["cursor"],
						disabledModels: [],
						preferLowerUsage: true,
						allowSmallContextForSmallTasks: true,
						roleOverrides: {
							"subagent:planner": {
								preferredModels: ["google/gemini-2.5-flash"],
							},
						},
					},
				},
				null,
				2,
			),
		);

		const result = buildDelegatedSelectionPolicy({
			category: "quick-discovery",
			roleKeys: ["subagent:planner"],
			defaults: {
				taskProfile: "planning",
				preferFastModels: true,
			},
		});

		expect(result.policy).toMatchObject({
			preferredProviders: ["google"],
			preferredModels: ["google/gemini-2.5-flash"],
			blockedProviders: ["cursor"],
			taskProfile: "planning",
			preferFastModels: true,
			preferLowerUsage: true,
		});
	});

	it("inspects delegated selections with ranked reasons", () => {
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
								preferFastModels: true,
							},
						},
					},
					delegatedModelSelection: {
						disabledProviders: [],
						disabledModels: [],
						preferLowerUsage: true,
						allowSmallContextForSmallTasks: true,
						roleOverrides: {},
					},
				},
				null,
				2,
			),
		);

		const inspection = inspectDelegatedSelection({
			availableModels: sampleModels,
			category: "quick-discovery",
			defaults: { taskProfile: "planning", preferFastModels: true },
			usage: {
				openai: { remainingPct: 10, confidence: "estimated" },
				google: { remainingPct: 90, confidence: "estimated" },
			},
			latency: {
				"google/gemini-2.5-flash": { avgMs: 1500, count: 4 },
				"openai/gpt-5-mini": { avgMs: 6000, count: 2 },
			},
			taskText: "Quickly scan the repo and summarize likely hotspots.",
		});

		expect(inspection.selection?.selectedModel).toBe("google/gemini-2.5-flash");
		expect(inspection.selection?.ranked[0]?.reasons).toEqual(
			expect.arrayContaining([expect.stringContaining("preferred-provider:1"), expect.stringContaining("measured-latency")]),
		);
	});
});
