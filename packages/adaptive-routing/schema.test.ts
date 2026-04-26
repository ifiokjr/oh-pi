import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";


const { getAgentDir } = vi.hoisted(() => ({
	getAgentDir: vi.fn(() => "/mock-home/.pi/agent"),
}));

vi.mock<typeof import('@mariozechner/pi-coding-agent')>(import('@mariozechner/pi-coding-agent'), () => ({
	getAgentDir,
}));

import { getAdaptiveRoutingConfigPath, normalizeAdaptiveRoutingConfig, readAdaptiveRoutingConfig } from "./config.js";
import { DEFAULT_ADAPTIVE_ROUTING_CONFIG } from "./defaults.js";
import { deriveFallbackGroups, deriveMaxThinkingLevel, normalizeRouteCandidates } from "./normalize.js";

describe("adaptive routing config", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
		vi.clearAllMocks();
	});

	it("uses defaults when config is missing", () => {
		expect(readAdaptiveRoutingConfig()).toStrictEqual(DEFAULT_ADAPTIVE_ROUTING_CONFIG);
		expect(getAdaptiveRoutingConfigPath()).toBe("/mock-home/.pi/agent/extensions/adaptive-routing/config.json");
	});

	it("normalizes invalid config values back to safe defaults", () => {
		const config = normalizeAdaptiveRoutingConfig({
			delegatedModelSelection: {
				allowSmallContextForSmallTasks: "true",
				disabledProviders: ["openai", 7],
				roleOverrides: {
					"subagent:planner": {
						minContextWindow: "nan",
						preferredModels: ["google/gemini-3.1-pro", 2],
						taskProfile: "wrong",
					},
				},
			},
			delegatedRouting: {
				categories: {
					"quick-discovery": {
						minContextWindow: 12,
						requireReasoning: "yes",
						taskProfile: "bogus",
					},
				},
			},
			mode: "banana",
			models: { ranked: ["openai/gpt-5.4", 7, " "] },
			providerReserves: {
				openai: { applyToTiers: ["premium", "fake"], minRemainingPct: 120 },
			},
			stickyTurns: 999,
			taskClasses: {
				quick: { candidates: ["google/gemini-2.5-flash"], defaultThinking: "bad" },
			},
			telemetry: { mode: "bogus", privacy: "bad" },
		});

		expect(config.mode).toBe(DEFAULT_ADAPTIVE_ROUTING_CONFIG.mode);
		expect(config.stickyTurns).toBe(20);
		expect(config.telemetry).toStrictEqual(DEFAULT_ADAPTIVE_ROUTING_CONFIG.telemetry);
		expect(config.models.ranked).toStrictEqual(["openai/gpt-5.4"]);
		expect(config.providerReserves.openai?.minRemainingPct).toBe(100);
		expect(config.providerReserves.openai?.applyToTiers).toStrictEqual(["premium"]);
		expect(config.taskClasses.quick?.defaultThinking).toBe(
			DEFAULT_ADAPTIVE_ROUTING_CONFIG.taskClasses.quick?.defaultThinking,
		);
		expect(config.delegatedRouting.categories["quick-discovery"]?.taskProfile).toBe(
			DEFAULT_ADAPTIVE_ROUTING_CONFIG.delegatedRouting.categories["quick-discovery"]?.taskProfile,
		);
		expect(config.delegatedRouting.categories["quick-discovery"]?.minContextWindow).toBe(1024);
		expect(config.delegatedModelSelection.disabledProviders).toStrictEqual(["openai"]);
		expect(config.delegatedModelSelection.allowSmallContextForSmallTasks).toBe(
			DEFAULT_ADAPTIVE_ROUTING_CONFIG.delegatedModelSelection.allowSmallContextForSmallTasks,
		);
		expect(config.delegatedModelSelection.roleOverrides["subagent:planner"]?.preferredModels).toStrictEqual([
			"google/gemini-3.1-pro",
		]);
		expect(config.delegatedModelSelection.roleOverrides["subagent:planner"]?.taskProfile).toBeUndefined();
	});

	it("warns once and falls back when config JSON is invalid", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "adaptive-routing-config-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "extensions", "adaptive-routing"), { recursive: true });
		writeFileSync(join(tempAgentDir, "extensions", "adaptive-routing", "config.json"), "{ broken json", "utf8");

		try {
			const first = readAdaptiveRoutingConfig();
			const second = readAdaptiveRoutingConfig();
			expect(first).toStrictEqual(DEFAULT_ADAPTIVE_ROUTING_CONFIG);
			expect(second).toStrictEqual(DEFAULT_ADAPTIVE_ROUTING_CONFIG);
			expect(warnSpy).toHaveBeenCalledOnce();
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to parse config"));
		} finally {
			rmSync(tempAgentDir, { force: true, recursive: true });
		}
	});

	it("reads config from the shared pi agent directory", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "adaptive-routing-config-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "extensions", "adaptive-routing"), { recursive: true });
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			`${JSON.stringify({ mode: "auto", models: { ranked: ["anthropic/claude-opus-4.6"] } }, null, 2)}\n`,
			"utf8",
		);

		try {
			const config = readAdaptiveRoutingConfig();
			expect(config.mode).toBe("auto");
			expect(config.models.ranked).toStrictEqual(["anthropic/claude-opus-4.6"]);
			expect(config.delegatedModelSelection.preferLowerUsage).toBeTruthy();
		} finally {
			rmSync(tempAgentDir, { force: true, recursive: true });
		}
	});
});

describe("adaptive routing candidate normalization", () => {
	it("normalizes available models into stable route candidates", () => {
		const candidates = normalizeRouteCandidates([
			{
				api: "openai-responses",
				baseUrl: "https://api.openai.com/v1",
				contextWindow: 200000,
				cost: { cacheRead: 0, cacheWrite: 0, input: 1, output: 2 },
				id: "gpt-5.4",
				input: ["text"],
				maxTokens: 32768,
				name: "GPT-5.4",
				provider: "openai",
				reasoning: true,
			},
			{
				api: "google-generative-ai",
				baseUrl: "https://generativelanguage.googleapis.com",
				contextWindow: 1048576,
				cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
				id: "gemini-2.5-flash",
				input: ["text", "image"],
				maxTokens: 65536,
				name: "Gemini 2.5 Flash",
				provider: "google",
				reasoning: true,
			},
		] as never);

		expect(candidates).toHaveLength(2);
		expect(candidates[0]).toMatchObject({
			costKnown: true,
			fullId: "openai/gpt-5.4",
			maxThinkingLevel: "xhigh",
		});
		expect(candidates[1]).toMatchObject({
			costKnown: false,
			fullId: "google/gemini-2.5-flash",
		});
		expect(candidates[1]?.tags).toContain("cheap");
	});

	it("derives fallback groups and max thinking levels consistently", () => {
		const premiumModel = {
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
		};
		const nonReasoningModel = {
			api: "openai-responses",
			baseUrl: "https://api.openai.com/v1",
			contextWindow: 128000,
			cost: { cacheRead: 0, cacheWrite: 0, input: 1, output: 1 },
			id: "gpt-4o",
			input: ["text", "image"],
			maxTokens: 16384,
			name: "GPT-4o",
			provider: "openai",
			reasoning: false,
		};

		expect(deriveMaxThinkingLevel(premiumModel as never)).toBe("xhigh");
		expect(deriveMaxThinkingLevel(nonReasoningModel as never)).toBe("off");
		expect(deriveFallbackGroups(premiumModel as never)).toStrictEqual(["design-premium", "peak-reasoning"]);
	});
});
