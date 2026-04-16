import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExtensionHarness } from "../../test-utils/extension-runtime-harness.js";

const { getAgentDir } = vi.hoisted(() => ({
	getAgentDir: vi.fn(() => "/mock-home/.pi/agent"),
}));

vi.mock("@mariozechner/pi-coding-agent", async () => {
	const actual = await vi.importActual<typeof import("@mariozechner/pi-coding-agent")>("@mariozechner/pi-coding-agent");
	return {
		...actual,
		getAgentDir,
	};
});

vi.mock("@mariozechner/pi-ai", async () => {
	const actual = await vi.importActual<typeof import("@mariozechner/pi-ai")>("@mariozechner/pi-ai");
	return {
		...actual,
		completeSimple: vi.fn(async () => ({
			role: "assistant",
			content: [
				{
					type: "text",
					text: JSON.stringify({
						intent: "design",
						complexity: 4,
						risk: "high",
						expectedTurns: "few",
						toolIntensity: "medium",
						contextBreadth: "medium",
						recommendedTier: "premium",
						recommendedThinking: "high",
						confidence: 0.91,
						reason: "Design-heavy task.",
					}),
				},
			],
			api: "openai-responses",
			provider: "openai",
			model: "gpt-5-mini",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		})),
	};
});

import adaptiveRoutingExtension from "./index.js";

function sampleModel(provider: string, id: string, name = id) {
	return {
		provider,
		id,
		name,
		api:
			provider === "anthropic"
				? "anthropic-messages"
				: provider === "google"
					? "google-generative-ai"
					: "openai-responses",
		baseUrl: "https://example.com",
		reasoning: true,
		input: ["text"],
		cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 32768,
	};
}

describe("adaptive routing extension", () => {
	let tempAgentDir: string;

	beforeEach(() => {
		vi.useFakeTimers();
		tempAgentDir = mkdtempSync(join(tmpdir(), "adaptive-routing-ext-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "extensions", "adaptive-routing"), { recursive: true });
	});

	afterEach(() => {
		vi.useRealTimers();
		rmSync(tempAgentDir, { recursive: true, force: true });
		vi.clearAllMocks();
	});

	it("keeps adaptive routing disabled by default when no config exists", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = sampleModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash") as never;
		harness.ctx.modelRegistry = {
			getAvailable: () => [
				sampleModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash"),
				sampleModel("anthropic", "claude-opus-4.6", "Claude Opus 4.6"),
			],
			getApiKey: async () => "key",
		} as never;

		adaptiveRoutingExtension(harness.pi as never);
		await harness.emitAsync(
			"before_agent_start",
			{ type: "before_agent_start", prompt: "Design a better settings page UI.", systemPrompt: "system" },
			harness.ctx,
		);

		expect(harness.ctx.model).toMatchObject({ provider: "google", id: "gemini-2.5-flash" });
		expect(harness.notifications.some((item) => item.msg.includes("Adaptive route suggestion"))).toBe(false);
		expect(harness.statusMap.has("adaptive-routing")).toBe(false);
	});

	it("defers session_start state refresh until after the startup window", async () => {
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			`${JSON.stringify({ mode: "shadow" }, null, 2)}\n`,
		);
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "state.json"),
			`${JSON.stringify({ mode: "shadow" }, null, 2)}\n`,
		);
		const harness = createExtensionHarness();

		adaptiveRoutingExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		expect(harness.statusMap.has("adaptive-routing")).toBe(false);

		await vi.advanceTimersByTimeAsync(250);
		expect(harness.statusMap.get("adaptive-routing")).toContain("shadow");
	});

	it("cancels deferred session_start refresh on session_shutdown", async () => {
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			`${JSON.stringify({ mode: "shadow" }, null, 2)}\n`,
		);
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "state.json"),
			`${JSON.stringify({ mode: "shadow" }, null, 2)}\n`,
		);
		const harness = createExtensionHarness();

		adaptiveRoutingExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
		await vi.advanceTimersByTimeAsync(250);

		expect(harness.statusMap.has("adaptive-routing")).toBe(false);
	});

	it("registers route commands and auto-applies a routed premium model", async () => {
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			`${JSON.stringify({ mode: "auto", models: { ranked: ["anthropic/claude-opus-4.6"] } }, null, 2)}\n`,
		);
		const harness = createExtensionHarness();
		harness.ctx.model = sampleModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash") as never;
		harness.ctx.modelRegistry = {
			getAvailable: () => [
				sampleModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash"),
				sampleModel("anthropic", "claude-opus-4.6", "Claude Opus 4.6"),
				sampleModel("openai", "gpt-5.4", "GPT-5.4"),
			],
			getApiKey: async () => "key",
		} as never;

		adaptiveRoutingExtension(harness.pi as never);
		expect(harness.commands.has("route")).toBe(true);
		expect(harness.commands.has("route:status")).toBe(true);

		await harness.emitAsync(
			"before_agent_start",
			{ type: "before_agent_start", prompt: "Design a better settings page UI.", systemPrompt: "system" },
			harness.ctx,
		);

		expect(harness.ctx.model).toMatchObject({ provider: "anthropic", id: "claude-opus-4.6" });
		expect(harness.statusMap.get("adaptive-routing")).toContain("auto");
	});

	it("suggests a route in shadow mode without changing the active model", async () => {
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			`${JSON.stringify({ mode: "shadow" }, null, 2)}\n`,
		);
		const harness = createExtensionHarness();
		harness.ctx.model = sampleModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash") as never;
		harness.ctx.modelRegistry = {
			getAvailable: () => [
				sampleModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash"),
				sampleModel("anthropic", "claude-opus-4.6", "Claude Opus 4.6"),
			],
			getApiKey: async () => "key",
		} as never;

		adaptiveRoutingExtension(harness.pi as never);
		await harness.emitAsync(
			"before_agent_start",
			{ type: "before_agent_start", prompt: "Design a better settings page UI.", systemPrompt: "system" },
			harness.ctx,
		);

		expect(harness.ctx.model).toMatchObject({ provider: "google", id: "gemini-2.5-flash" });
		expect(harness.notifications.some((item) => item.msg.includes("Adaptive route suggestion"))).toBe(true);
	});
});
