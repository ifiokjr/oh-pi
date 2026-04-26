import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createExtensionHarness } from "../../test-utils/extension-runtime-harness.js";

const { getAgentDir } = vi.hoisted(() => ({
	getAgentDir: vi.fn(() => "/mock-home/.pi/agent"),
}));

vi.mock<typeof import('@mariozechner/pi-coding-agent')>(import('@mariozechner/pi-coding-agent'), () => ({
	getAgentDir,
}));

vi.mock<typeof import('@ifi/oh-pi-core')>(import('@ifi/oh-pi-core'), async () => await import("../core/src/model-intelligence.js"));

vi.mock<typeof import('@mariozechner/pi-ai')>(import('@mariozechner/pi-ai'), () => ({
	completeSimple: vi.fn(async () => ({
		api: "openai-responses",
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
		model: "gpt-5-mini",
		provider: "openai",
		role: "assistant",
		stopReason: "stop",
		timestamp: Date.now(),
		usage: {
			cacheRead: 0,
			cacheWrite: 0,
			cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
			input: 0,
			output: 0,
			totalTokens: 0,
		},
	})),
}));

import adaptiveRoutingExtension, { resolveDelegatedAssignmentModel } from "./index.js";

function sampleModel(provider: string, id: string, name = id) {
	return {
		api:
			provider === "anthropic"
				? "anthropic-messages"
				: provider === "google"
					? "google-generative-ai"
					: "openai-responses",
		baseUrl: "https://example.com",
		contextWindow: 200000,
		cost: { cacheRead: 0, cacheWrite: 0, input: 1, output: 1 },
		id,
		input: ["text"],
		maxTokens: 32768,
		name,
		provider,
		reasoning: true,
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
		rmSync(tempAgentDir, { force: true, recursive: true });
		vi.clearAllMocks();
	});

	it("keeps adaptive routing disabled by default when no config exists", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = sampleModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash") as never;
		harness.ctx.modelRegistry = {
			getApiKey: async () => "key",
			getAvailable: () => [
				sampleModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash"),
				sampleModel("anthropic", "claude-opus-4.6", "Claude Opus 4.6"),
			],
		} as never;

		adaptiveRoutingExtension(harness.pi as never);
		await harness.emitAsync(
			"before_agent_start",
			{ prompt: "Design a better settings page UI.", systemPrompt: "system", type: "before_agent_start" },
			harness.ctx,
		);

		expect(harness.ctx.model).toMatchObject({ id: "gemini-2.5-flash", provider: "google" });
		expect(harness.notifications.some((item) => item.msg.includes("Adaptive route suggestion"))).toBeFalsy();
		expect(harness.statusMap.has("adaptive-routing")).toBeFalsy();
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
		expect(harness.statusMap.has("adaptive-routing")).toBeFalsy();

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

		expect(harness.statusMap.has("adaptive-routing")).toBeFalsy();
	});

	it("registers route commands and auto-applies a routed premium model", async () => {
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			`${JSON.stringify({ mode: "auto", models: { ranked: ["anthropic/claude-opus-4.6"] } }, null, 2)}\n`,
		);
		const harness = createExtensionHarness();
		harness.ctx.model = sampleModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash") as never;
		harness.ctx.modelRegistry = {
			getApiKey: async () => "key",
			getAvailable: () => [
				sampleModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash"),
				sampleModel("anthropic", "claude-opus-4.6", "Claude Opus 4.6"),
				sampleModel("openai", "gpt-5.4", "GPT-5.4"),
			],
		} as never;

		adaptiveRoutingExtension(harness.pi as never);
		expect(harness.commands.has("route")).toBeTruthy();
		expect(harness.commands.has("route:status")).toBeTruthy();

		await harness.emitAsync(
			"before_agent_start",
			{ prompt: "Design a better settings page UI.", systemPrompt: "system", type: "before_agent_start" },
			harness.ctx,
		);

		expect(harness.ctx.model).toMatchObject({ id: "claude-opus-4.6", provider: "anthropic" });
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
			getApiKey: async () => "key",
			getAvailable: () => [
				sampleModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash"),
				sampleModel("anthropic", "claude-opus-4.6", "Claude Opus 4.6"),
			],
		} as never;

		adaptiveRoutingExtension(harness.pi as never);
		await harness.emitAsync(
			"before_agent_start",
			{ prompt: "Design a better settings page UI.", systemPrompt: "system", type: "before_agent_start" },
			harness.ctx,
		);

		expect(harness.ctx.model).toMatchObject({ id: "gemini-2.5-flash", provider: "google" });
		expect(harness.notifications.some((item) => item.msg.includes("Adaptive route suggestion"))).toBeTruthy();
	});

	it("routes alias feedback commands through the colon form", async () => {
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			`${JSON.stringify({ mode: "auto" }, null, 2)}\n`,
		);
		const harness = createExtensionHarness();
		adaptiveRoutingExtension(harness.pi as never);

		await harness.commands.get("route:feedback")?.handler?.("", harness.ctx as never);
		expect(harness.notifications.at(-1)?.msg).toContain("Usage: /route feedback");

		await harness.commands.get("route:status")?.handler?.("", harness.ctx as never);
		expect(harness.notifications.at(-1)?.msg).toContain("adaptive routing");
	});

	it("shows delegated assignments with role overrides and disabled providers", async () => {
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			`${JSON.stringify(
				{
					delegatedModelSelection: {
						disabledProviders: ["google"],
						roleOverrides: {
							"colony:scout": {
								preferredModels: ["openai/gpt-5-mini"],
							},
						},
					},
					delegatedRouting: {
						categories: {
							"quick-discovery": {
								fallbackGroup: "cheap-router",
								preferredProviders: ["google", "openai"],
								taskProfile: "planning",
							},
						},
						enabled: true,
					},
					mode: "shadow",
				},
				null,
				2,
			)}\n`,
		);
		const harness = createExtensionHarness();
		harness.ctx.modelRegistry = {
			getAvailable: () => [
				sampleModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash"),
				sampleModel("openai", "gpt-5-mini", "GPT-5 Mini"),
			],
		} as never;
		let renderedLines: string[] = [];
		harness.ctx.ui.custom = vi.fn(async (factory) => {
			const component = factory({ requestRender() {} }, null, null, () => {});
			renderedLines = component.render(120);
			return null;
		}) as never;

		adaptiveRoutingExtension(harness.pi as never);
		const command = harness.commands.get("route");
		await command.handler("assignments", harness.ctx);

		expect(renderedLines).toStrictEqual(
			expect.arrayContaining([
				"Delegated Routing Assignments",
				expect.stringContaining("Disabled providers: google"),
				expect.stringContaining("Role overrides:"),
				expect.stringContaining("colony:scout"),
				expect.stringContaining("openai/gpt-5-mini"),
			]),
		);
	});

	it("shows delegated why details with ranked reasons", async () => {
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			`${JSON.stringify(
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
					mode: "shadow",
				},
				null,
				2,
			)}\n`,
		);
		const harness = createExtensionHarness();
		harness.ctx.modelRegistry = {
			getAvailable: () => [
				sampleModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash"),
				sampleModel("openai", "gpt-5-mini", "GPT-5 Mini"),
			],
		} as never;
		let renderedLines: string[] = [];
		harness.ctx.ui.custom = vi.fn(async (factory) => {
			const component = factory({ requestRender() {} }, null, null, () => {});
			renderedLines = component.render(120);
			return null;
		}) as never;

		adaptiveRoutingExtension(harness.pi as never);
		await harness.commands.get("route:why")?.handler?.("quick-discovery quickly scan the repo", harness.ctx as never);
		expect(renderedLines).toStrictEqual(
			expect.arrayContaining([
				"Delegated Routing Why",
				expect.stringContaining("selected: google/gemini-2.5-flash"),
				expect.stringContaining("ranked:"),
				expect.stringContaining("reasons:"),
			]),
		);
	});

	it("falls back to groq in delegated assignment inspection for quick-discovery", async () => {
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			`${JSON.stringify(
				{
					delegatedRouting: {
						categories: {
							"quick-discovery": {
								preferredProviders: ["openai", "google"],
							},
						},
						enabled: true,
					},
					mode: "shadow",
				},
				null,
				2,
			)}\n`,
		);
		const harness = createExtensionHarness();
		harness.ctx.modelRegistry = {
			getAvailable: () => [sampleModel("groq", "llama-3.3-70b-versatile", "Llama 3.3 70B Versatile")],
		} as never;
		let renderedLines: string[] = [];
		harness.ctx.ui.custom = vi.fn(async (factory) => {
			const component = factory({ requestRender() {} }, null, null, () => {});
			renderedLines = component.render(120);
			return null;
		}) as never;

		adaptiveRoutingExtension(harness.pi as never);
		await harness.commands.get("route:assignments")?.handler?.("", harness.ctx as never);
		expect(renderedLines).toStrictEqual(expect.arrayContaining([expect.stringContaining("groq/llama-3.3-70b-versatile")]));
	});

	it("resolves delegated quick-discovery fallbacks directly", () => {
		const resolved = resolveDelegatedAssignmentModel({
			availableModels: [
				{
					provider: "groq",
					id: "llama-3.3-70b-versatile",
					fullId: "groq/llama-3.3-70b-versatile",
					name: "Llama 3.3 70B Versatile",
				},
			],
			category: "quick-discovery",
			config: {
				delegatedModelSelection: {
					allowSmallContextForSmallTasks: true,
					disabledModels: [],
					disabledProviders: [],
					preferLowerUsage: true,
					roleOverrides: {},
				},
				delegatedRouting: { categories: {}, enabled: true },
				fallbackGroups: {},
				intents: {},
				mode: "shadow",
				models: { excluded: [], ranked: [] },
				providerReserves: {},
				routerModels: [],
				stickyTurns: 1,
				taskClasses: {},
				telemetry: { mode: "local", privacy: "minimal" },
			},
			policy: {
				candidates: undefined,
				defaultThinking: undefined,
				fallbackGroup: undefined,
				preferredProviders: ["openai", "google"],
			},
		});
		expect(resolved).toBe("groq/llama-3.3-70b-versatile");
	});

	it("returns the first unblocked model when no delegated preference matches", () => {
		const resolved = resolveDelegatedAssignmentModel({
			availableModels: [
				{
					provider: "google",
					id: "gemini-2.5-flash",
					fullId: "google/gemini-2.5-flash",
					name: "Gemini 2.5 Flash",
				},
			],
			category: "review-critical",
			config: {
				delegatedModelSelection: {
					allowSmallContextForSmallTasks: true,
					disabledModels: [],
					disabledProviders: [],
					preferLowerUsage: true,
					roleOverrides: {},
				},
				delegatedRouting: { categories: {}, enabled: true },
				fallbackGroups: {},
				intents: {},
				mode: "shadow",
				models: { excluded: [], ranked: [] },
				providerReserves: {},
				routerModels: [],
				stickyTurns: 1,
				taskClasses: {},
				telemetry: { mode: "local", privacy: "minimal" },
			},
			policy: {
				candidates: undefined,
				defaultThinking: undefined,
				fallbackGroup: undefined,
				preferredProviders: ["openai"],
			},
		});
		expect(resolved).toBe("google/gemini-2.5-flash");
	});

	it("records measured latency in routing stats after an outcome", async () => {
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			`${JSON.stringify({ mode: "auto", models: { ranked: ["openai/gpt-5.4"] } }, null, 2)}\n`,
		);
		const harness = createExtensionHarness();
		harness.ctx.model = sampleModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash") as never;
		harness.ctx.modelRegistry = {
			getApiKey: async () => "key",
			getAvailable: () => [sampleModel("google", "gemini-2.5-flash"), sampleModel("openai", "gpt-5.4")],
		} as never;
		let renderedLines: string[] = [];
		harness.ctx.ui.custom = vi.fn(async (factory) => {
			const component = factory({ requestRender() {} }, null, null, () => {});
			renderedLines = component.render(120);
			return null;
		}) as never;

		adaptiveRoutingExtension(harness.pi as never);
		await harness.emitAsync(
			"before_agent_start",
			{ prompt: "Design a better settings page UI.", systemPrompt: "system", type: "before_agent_start" },
			harness.ctx,
		);
		await vi.advanceTimersByTimeAsync(3200);
		await harness.emitAsync("agent_end", { type: "agent_end" }, harness.ctx);
		await harness.commands.get("route:stats")?.handler?.("", harness.ctx as never);

		expect(renderedLines).toStrictEqual(
			expect.arrayContaining([
				expect.stringContaining("Outcomes: 1"),
				expect.stringContaining("Avg duration:"),
				expect.stringContaining("openai/gpt-5.4"),
			]),
		);
	});
});
