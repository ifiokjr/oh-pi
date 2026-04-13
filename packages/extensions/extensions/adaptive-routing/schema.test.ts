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
		expect(readAdaptiveRoutingConfig()).toEqual(DEFAULT_ADAPTIVE_ROUTING_CONFIG);
		expect(getAdaptiveRoutingConfigPath()).toBe("/mock-home/.pi/agent/extensions/adaptive-routing/config.json");
	});

	it("normalizes invalid config values back to safe defaults", () => {
		const config = normalizeAdaptiveRoutingConfig({
			mode: "banana",
			stickyTurns: 999,
			telemetry: { mode: "bogus", privacy: "bad" },
			models: { ranked: ["openai/gpt-5.4", 7, " "] },
			providerReserves: {
				openai: { minRemainingPct: 120, applyToTiers: ["premium", "fake"] },
			},
			taskClasses: {
				quick: { defaultThinking: "bad", candidates: ["google/gemini-2.5-flash"] },
			},
		}) as never;

		expect(config.mode).toBe(DEFAULT_ADAPTIVE_ROUTING_CONFIG.mode);
		expect(config.stickyTurns).toBe(20);
		expect(config.telemetry).toEqual(DEFAULT_ADAPTIVE_ROUTING_CONFIG.telemetry);
		expect(config.models.ranked).toEqual(["openai/gpt-5.4"]);
		expect(config.providerReserves.openai?.minRemainingPct).toBe(100);
		expect(config.providerReserves.openai?.applyToTiers).toEqual(["premium"]);
		expect(config.taskClasses.quick?.defaultThinking).toBe(
			DEFAULT_ADAPTIVE_ROUTING_CONFIG.taskClasses.quick?.defaultThinking,
		);
	});

	it("warns once and falls back when config JSON is invalid", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "adaptive-routing-config-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "extensions", "adaptive-routing"), { recursive: true });
		writeFileSync(join(tempAgentDir, "extensions", "adaptive-routing", "config.json"), "{ broken json", "utf-8");

		try {
			const first = readAdaptiveRoutingConfig();
			const second = readAdaptiveRoutingConfig();
			expect(first).toEqual(DEFAULT_ADAPTIVE_ROUTING_CONFIG);
			expect(second).toEqual(DEFAULT_ADAPTIVE_ROUTING_CONFIG);
			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to parse config"));
		} finally {
			rmSync(tempAgentDir, { recursive: true, force: true });
		}
	});

	it("reads config from the shared pi agent directory", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "adaptive-routing-config-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "extensions", "adaptive-routing"), { recursive: true });
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			`${JSON.stringify({ mode: "auto", models: { ranked: ["anthropic/claude-opus-4.6"] } }, null, 2)}\n`,
			"utf-8",
		);

		try {
			const config = readAdaptiveRoutingConfig();
			expect(config.mode).toBe("auto");
			expect(config.models.ranked).toEqual(["anthropic/claude-opus-4.6"]);
		} finally {
			rmSync(tempAgentDir, { recursive: true, force: true });
		}
	});
});

describe("adaptive routing candidate normalization", () => {
	it("normalizes available models into stable route candidates", () => {
		const candidates = normalizeRouteCandidates([
			{
				provider: "openai",
				id: "gpt-5.4",
				name: "GPT-5.4",
				api: "openai-responses",
				baseUrl: "https://api.openai.com/v1",
				reasoning: true,
				input: ["text"],
				cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 200000,
				maxTokens: 32768,
			},
			{
				provider: "google",
				id: "gemini-2.5-flash",
				name: "Gemini 2.5 Flash",
				api: "google-generative-ai",
				baseUrl: "https://generativelanguage.googleapis.com",
				reasoning: true,
				input: ["text", "image"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1048576,
				maxTokens: 65536,
			},
		] as never);

		expect(candidates).toHaveLength(2);
		expect(candidates[0]).toMatchObject({
			fullId: "openai/gpt-5.4",
			maxThinkingLevel: "xhigh",
			costKnown: true,
		});
		expect(candidates[1]).toMatchObject({
			fullId: "google/gemini-2.5-flash",
			costKnown: false,
		});
		expect(candidates[1]?.tags).toContain("cheap");
	});

	it("derives fallback groups and max thinking levels consistently", () => {
		const premiumModel = {
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
		};
		const nonReasoningModel = {
			provider: "openai",
			id: "gpt-4o",
			name: "GPT-4o",
			api: "openai-responses",
			baseUrl: "https://api.openai.com/v1",
			reasoning: false,
			input: ["text", "image"],
			cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128000,
			maxTokens: 16384,
		};

		expect(deriveMaxThinkingLevel(premiumModel as never)).toBe("xhigh");
		expect(deriveMaxThinkingLevel(nonReasoningModel as never)).toBe("off");
		expect(deriveFallbackGroups(premiumModel as never)).toEqual(["design-premium", "peak-reasoning"]);
	});
});
