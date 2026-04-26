import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";


const { getAgentDir } = vi.hoisted(() => ({
	getAgentDir: vi.fn(() => "/mock-home/.pi/agent"),
}));

vi.mock<typeof import('@mariozechner/pi-coding-agent')>(import('@mariozechner/pi-coding-agent'), () => ({
	getAgentDir,
}));
vi.mock<typeof import('@ifi/oh-pi-core')>(import('@ifi/oh-pi-core'), async () => await import("../core/src/model-intelligence.js"));

import { buildDelegatedSelectionPolicy, inspectDelegatedSelection, readDelegatedSelectionLatencySnapshot, readDelegatedSelectionUsageSnapshot } from './delegated-runtime.js';
import type { DelegatedAvailableModelRef } from './delegated-runtime.js';

const sampleModels: DelegatedAvailableModelRef[] = [
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
];

describe("delegated runtime helpers", () => {
	let tempAgentDir: string;

	beforeEach(() => {
		tempAgentDir = mkdtempSync(join(tmpdir(), "delegated-runtime-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "extensions", "adaptive-routing"), { recursive: true });
	});

	afterEach(() => {
		rmSync(tempAgentDir, { force: true, recursive: true });
		vi.clearAllMocks();
	});

	it("reads delegated usage snapshots from usage-tracker cache", () => {
		writeFileSync(
			join(tempAgentDir, "usage-tracker-rate-limits.json"),
			JSON.stringify(
				{
					providers: {
						google: { windows: [{ percentLeft: 80 }] },
						openai: { windows: [{ percentLeft: 15 }] },
					},
				},
				null,
				2,
			),
		);

		expect(readDelegatedSelectionUsageSnapshot()).toStrictEqual({
			google: { confidence: "estimated", remainingPct: 80 },
			openai: { confidence: "estimated", remainingPct: 15 },
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

		expect(readDelegatedSelectionLatencySnapshot()).toStrictEqual({
			"google/gemini-2.5-flash": { avgMs: 1500, count: 4 },
			"openai/gpt-5-mini": { avgMs: 5000, count: 2 },
		});
	});

	it("builds merged delegated policies from category defaults and role overrides", () => {
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			JSON.stringify(
				{
					delegatedModelSelection: {
						allowSmallContextForSmallTasks: true,
						disabledModels: [],
						disabledProviders: ["cursor"],
						preferLowerUsage: true,
						roleOverrides: {
							"subagent:planner": {
								preferredModels: ["google/gemini-2.5-flash"],
							},
						},
					},
					delegatedRouting: {
						categories: {
							"quick-discovery": {
								preferFastModels: true,
								preferredProviders: ["google"],
							},
						},
						enabled: true,
					},
				},
				null,
				2,
			),
		);

		const result = buildDelegatedSelectionPolicy({
			category: "quick-discovery",
			defaults: {
				preferFastModels: true,
				taskProfile: "planning",
			},
			roleKeys: ["subagent:planner"],
		});

		expect(result.policy).toMatchObject({
			blockedProviders: ["cursor"],
			preferFastModels: true,
			preferLowerUsage: true,
			preferredModels: ["google/gemini-2.5-flash"],
			preferredProviders: ["google"],
			taskProfile: "planning",
		});
	});

	it("inspects delegated selections with ranked reasons", () => {
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			JSON.stringify(
				{
					delegatedModelSelection: {
						allowSmallContextForSmallTasks: true,
						disabledModels: [],
						disabledProviders: [],
						preferLowerUsage: true,
						roleOverrides: {},
					},
					delegatedRouting: {
						categories: {
							"quick-discovery": {
								candidates: ["google/gemini-2.5-flash", "openai/gpt-5-mini"],
								preferFastModels: true,
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

		const inspection = inspectDelegatedSelection({
			availableModels: sampleModels,
			category: "quick-discovery",
			defaults: { preferFastModels: true, taskProfile: "planning" },
			latency: {
				"google/gemini-2.5-flash": { avgMs: 1500, count: 4 },
				"openai/gpt-5-mini": { avgMs: 6000, count: 2 },
			},
			taskText: "Quickly scan the repo and summarize likely hotspots.",
			usage: {
				google: { confidence: "estimated", remainingPct: 90 },
				openai: { confidence: "estimated", remainingPct: 10 },
			},
		});

		expect(inspection.selection?.selectedModel).toBe("google/gemini-2.5-flash");
		expect(inspection.selection?.ranked[0]?.reasons).toStrictEqual(
			expect.arrayContaining([
				expect.stringContaining("preferred-provider:1"),
				expect.stringContaining("measured-latency"),
			]),
		);
	});
});
