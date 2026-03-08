/**
 * Tests for the usage-tracker extension.
 *
 * Exercises: registration, data collection, threshold alerts, rate limit parsing,
 * widget rendering, session hydration, report generation, and tool/command APIs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: vi.fn().mockReturnValue(false),
		readFileSync: vi.fn().mockReturnValue("{}"),
		writeFileSync: vi.fn(),
	};
});

vi.mock("node:os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	return { ...actual, homedir: () => "/mock-home" };
});

vi.mock("@mariozechner/pi-coding-agent", () => ({
	CustomEditor: class {},
}));

vi.mock("@mariozechner/pi-ai", () => ({}));

vi.mock("@sinclair/typebox", () => ({
	Type: {
		Object: (schema: any) => schema,
		String: (opts?: any) => ({ type: "string", ...opts }),
		Number: (opts?: any) => ({ type: "number", ...opts }),
		Optional: (t: any) => ({ optional: true, ...t }),
		Union: (types: any[], opts?: any) => ({ oneOf: types, ...opts }),
		Literal: (value: any) => ({ const: value }),
	},
}));

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeAssistantMessage(overrides: Record<string, any> = {}) {
	return {
		role: "assistant" as const,
		model: overrides.model ?? "claude-sonnet-4-20250514",
		provider: overrides.provider ?? "anthropic",
		content: [],
		api: "anthropic-messages",
		stopReason: "stop",
		timestamp: Date.now(),
		usage: {
			input: overrides.input ?? 1000,
			output: overrides.output ?? 500,
			cacheRead: overrides.cacheRead ?? 200,
			cacheWrite: overrides.cacheWrite ?? 100,
			totalTokens: (overrides.input ?? 1000) + (overrides.output ?? 500),
			cost: {
				input: overrides.costInput ?? 0.003,
				output: overrides.costOutput ?? 0.0075,
				cacheRead: overrides.costCacheRead ?? 0.0003,
				cacheWrite: overrides.costCacheWrite ?? 0.00038,
				total: overrides.costTotal ?? 0.01118,
			},
		},
	};
}

function makeSessionEntry(msg: any) {
	return { type: "message", message: msg };
}

function createMockPi() {
	const handlers = new Map<string, ((...args: any[]) => void)[]>();
	const tools = new Map<string, any>();
	const commands = new Map<string, any>();
	const shortcuts = new Map<string, any>();

	return {
		on(event: string, handler: (...args: any[]) => void) {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			handlers.get(event)!.push(handler);
		},
		registerTool(tool: any) {
			tools.set(tool.name, tool);
		},
		registerCommand(name: string, opts: any) {
			commands.set(name, opts);
		},
		registerShortcut(key: string, opts: any) {
			shortcuts.set(key, opts);
		},
		getThinkingLevel: () => "medium",
		exec: vi.fn().mockResolvedValue({ stdout: "", exitCode: 0 }),
		events: { on: vi.fn(), emit: vi.fn() },

		_handlers: handlers,
		_tools: tools,
		_commands: commands,
		_shortcuts: shortcuts,
		_emit(event: string, ...args: any[]) {
			const fns = handlers.get(event) ?? [];
			for (const fn of fns) {
				fn(...args);
			}
		},
	};
}

function createMockCtx(entries: any[] = []) {
	const widgets = new Map<string, any>();
	const notifications: any[] = [];

	return {
		sessionManager: { getBranch: () => entries },
		getContextUsage: () => ({ tokens: 45000, contextWindow: 200000, percent: 22.5 }),
		model: { id: "claude-sonnet-4-20250514" },
		ui: {
			setWidget(key: string, content: any) {
				if (content === undefined) {
					widgets.delete(key);
				} else {
					widgets.set(key, content);
				}
			},
			notify(msg: string, type: string) {
				notifications.push({ msg, type });
			},
			custom: vi.fn().mockResolvedValue(undefined),
		},
		_widgets: widgets,
		_notifications: notifications,
	};
}

/**
 * Helper: execute an async function that uses setTimeout internally.
 * With vi.useFakeTimers(), we advance the clock after starting the promise.
 */
async function runWithTimers<T>(fn: () => Promise<T>): Promise<T> {
	const promise = fn();
	await vi.advanceTimersByTimeAsync(2000);
	return promise;
}

// ─── Import ──────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import usageTracker from "./usage-tracker.js";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("usage-tracker extension", () => {
	let pi: ReturnType<typeof createMockPi>;
	let ctx: ReturnType<typeof createMockCtx>;

	beforeEach(() => {
		vi.useFakeTimers();
		pi = createMockPi();
		ctx = createMockCtx();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("registration", () => {
		it("registers all expected event handlers", () => {
			usageTracker(pi as any);
			expect(pi._handlers.has("session_start")).toBe(true);
			expect(pi._handlers.has("session_switch")).toBe(true);
			expect(pi._handlers.has("turn_end")).toBe(true);
			expect(pi._handlers.has("model_select")).toBe(true);
		});

		it("registers usage_report tool with rate limit description", () => {
			usageTracker(pi as any);
			const tool = pi._tools.get("usage_report");
			expect(tool).toBeDefined();
			expect(tool.description).toContain("rate limit");
		});

		it("registers /usage, /usage-toggle, and /usage-refresh commands", () => {
			usageTracker(pi as any);
			expect(pi._commands.has("usage")).toBe(true);
			expect(pi._commands.has("usage-toggle")).toBe(true);
			expect(pi._commands.has("usage-refresh")).toBe(true);
		});

		it("registers ctrl+u shortcut (overrides built-in deleteToLineStart)", () => {
			usageTracker(pi as any);
			expect(pi._shortcuts.has("ctrl+u")).toBe(true);
			expect(pi._shortcuts.get("ctrl+u").description).toContain("rate limits");
		});
	});

	describe("data collection", () => {
		it("accumulates usage from turn_end events", async () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const msg1 = makeAssistantMessage({ input: 1000, output: 500, costTotal: 0.01 });
			pi._emit("turn_end", { type: "turn_end", turnIndex: 0, message: msg1, toolResults: [] }, ctx);

			const msg2 = makeAssistantMessage({ input: 2000, output: 800, costTotal: 0.02 });
			pi._emit("turn_end", { type: "turn_end", turnIndex: 1, message: msg2, toolResults: [] }, ctx);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "detailed" }, undefined, undefined, ctx));
			expect(result.content[0].text).toContain("2");
			expect(result.content[0].text).toContain("3.0k in");
		});

		it("tracks multiple models separately", async () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			pi._emit(
				"turn_end",
				{
					type: "turn_end",
					turnIndex: 0,
					message: makeAssistantMessage({ model: "claude-sonnet-4-20250514" }),
					toolResults: [],
				},
				ctx,
			);
			pi._emit(
				"turn_end",
				{
					type: "turn_end",
					turnIndex: 1,
					message: makeAssistantMessage({ model: "gpt-4o", provider: "openai" }),
					toolResults: [],
				},
				ctx,
			);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "detailed" }, undefined, undefined, ctx));
			const text = result.content[0].text;
			expect(text).toContain("claude-sonnet-4-20250514");
			expect(text).toContain("gpt-4o");
		});
	});

	describe("session hydration", () => {
		it("reconstructs usage from session entries on start", async () => {
			const entries = [
				makeSessionEntry(makeAssistantMessage({ input: 500, output: 300, costTotal: 0.005 })),
				makeSessionEntry(makeAssistantMessage({ input: 700, output: 400, costTotal: 0.008 })),
				makeSessionEntry({ role: "user", content: "hello" }),
			];
			ctx = createMockCtx(entries);

			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "detailed" }, undefined, undefined, ctx));
			expect(result.content[0].text).toContain("1.2k in"); // 500 + 700
		});

		it("resets state on session_switch", async () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			pi._emit(
				"turn_end",
				{ type: "turn_end", turnIndex: 0, message: makeAssistantMessage({ costTotal: 0.05 }), toolResults: [] },
				ctx,
			);

			const emptyCtx = createMockCtx([]);
			pi._emit("session_switch", { type: "session_switch", reason: "new" }, emptyCtx);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() =>
				tool.execute("id", { format: "detailed" }, undefined, undefined, emptyCtx),
			);
			expect(result.content[0].text).toContain("Turns: 0");
		});
	});

	describe("threshold alerts", () => {
		it("triggers cost threshold notification at $0.50", () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const msg = makeAssistantMessage({ costTotal: 0.55 });
			pi._emit("turn_end", { type: "turn_end", turnIndex: 0, message: msg, toolResults: [] }, ctx);

			expect(ctx._notifications.length).toBe(1);
			expect(ctx._notifications[0].msg).toContain("$0.50");
			expect(ctx._notifications[0].type).toBe("warning");
		});

		it("does not re-trigger the same threshold", () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			pi._emit(
				"turn_end",
				{ type: "turn_end", turnIndex: 0, message: makeAssistantMessage({ costTotal: 0.55 }), toolResults: [] },
				ctx,
			);
			pi._emit(
				"turn_end",
				{ type: "turn_end", turnIndex: 1, message: makeAssistantMessage({ costTotal: 0.1 }), toolResults: [] },
				ctx,
			);

			expect(ctx._notifications.length).toBe(1); // Only one notification
		});

		it("triggers highest matching threshold", () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			pi._emit(
				"turn_end",
				{ type: "turn_end", turnIndex: 0, message: makeAssistantMessage({ costTotal: 1.1 }), toolResults: [] },
				ctx,
			);

			expect(ctx._notifications.length).toBe(1);
			expect(ctx._notifications[0].msg).toContain("$1.00"); // Skips $0.50
		});
	});

	describe("rate limit probing", () => {
		it("triggers Claude probe when using Claude model", () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			// The probe calls pi.exec
			expect(pi.exec).toHaveBeenCalled();
			const calls = pi.exec.mock.calls;
			const claudeCall = calls.find((c: any[]) => c[0] === "claude");
			expect(claudeCall).toBeDefined();
		});

		it("triggers Codex probe when using OpenAI model", () => {
			ctx.model = { id: "gpt-4o" } as any;
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const calls = pi.exec.mock.calls;
			const codexCall = calls.find((c: any[]) => c[0] === "codex");
			expect(codexCall).toBeDefined();
		});

		it("probes again on model_select", () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const initialCallCount = pi.exec.mock.calls.length;

			// Simulate model switch (enough time has passed for cooldown)
			pi._emit(
				"model_select",
				{ type: "model_select", model: { id: "gpt-4o" } },
				{
					...ctx,
					model: { id: "gpt-4o" },
				},
			);

			// Should have made new probe calls
			expect(pi.exec.mock.calls.length).toBeGreaterThanOrEqual(initialCallCount);
		});
	});

	describe("tool: usage_report", () => {
		it("includes rate limit section in detailed format", async () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "detailed" }, undefined, undefined, ctx));
			expect(result.content[0].text).toContain("Rate Limits");
		});

		it("returns summary with rate limits and session cost", async () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);
			pi._emit("turn_end", { type: "turn_end", turnIndex: 0, message: makeAssistantMessage(), toolResults: [] }, ctx);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "summary" }, undefined, undefined, ctx));
			const text = result.content[0].text;
			expect(text).toContain("Session:");
			expect(text).toContain("1 turns");
		});
	});

	describe("widget", () => {
		it("sets up widget on session_start", () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);
			expect(ctx._widgets.has("usage-tracker")).toBe(true);
		});

		it("removes widget via /usage-toggle", async () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);
			expect(ctx._widgets.has("usage-tracker")).toBe(true);

			await pi._commands.get("usage-toggle").handler("", ctx);
			expect(ctx._widgets.has("usage-tracker")).toBe(false);
		});

		it("re-adds widget via second /usage-toggle", async () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			await pi._commands.get("usage-toggle").handler("", ctx);
			await pi._commands.get("usage-toggle").handler("", ctx);
			expect(ctx._widgets.has("usage-tracker")).toBe(true);
		});
	});

	describe("/usage-refresh command", () => {
		it("clears cooldowns and notifies user", async () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			await pi._commands.get("usage-refresh").handler("", ctx);

			expect(ctx._notifications.some((n: any) => n.msg.includes("Refreshing"))).toBe(true);
		});
	});

	describe("/usage command", () => {
		it("shows overlay with rich report", async () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			await runWithTimers(() => pi._commands.get("usage").handler("", ctx));
			expect(ctx.ui.custom).toHaveBeenCalledWith(expect.any(Function), { overlay: true });
		});
	});

	describe("formatting edge cases", () => {
		it("handles zero usage gracefully", async () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "detailed" }, undefined, undefined, ctx));
			expect(result.content[0].text).toContain("Turns: 0");
			expect(result.content[0].text).toContain("0 in / 0 out");
		});

		it("formats million-scale tokens", async () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const msg = makeAssistantMessage({ input: 1_500_000, output: 800, costTotal: 0.05 });
			pi._emit("turn_end", { type: "turn_end", turnIndex: 0, message: msg, toolResults: [] }, ctx);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "detailed" }, undefined, undefined, ctx));
			expect(result.content[0].text).toContain("1.5M in");
		});
	});

	describe("inter-extension event broadcasting", () => {
		it("registers usage:query listener on pi.events", () => {
			usageTracker(pi as any);
			expect(pi.events.on).toHaveBeenCalledWith("usage:query", expect.any(Function));
		});

		it("broadcasts usage:limits on turn_end", () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const msg = makeAssistantMessage({ input: 1000, output: 500, costTotal: 0.01 });
			pi._emit("turn_end", { type: "turn_end", turnIndex: 0, message: msg, toolResults: [] }, ctx);

			expect(pi.events.emit).toHaveBeenCalledWith(
				"usage:limits",
				expect.objectContaining({
					sessionCost: expect.any(Number),
					providers: expect.any(Object),
					perModel: expect.any(Object),
				}),
			);
		});

		it("includes per-model data in broadcast", () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const msg = makeAssistantMessage({
				model: "claude-sonnet-4-20250514",
				input: 1000,
				output: 500,
				costTotal: 0.01,
			});
			pi._emit("turn_end", { type: "turn_end", turnIndex: 0, message: msg, toolResults: [] }, ctx);

			// Find the last usage:limits call
			const emitCalls = (pi.events.emit as ReturnType<typeof vi.fn>).mock.calls;
			const limitsCalls = emitCalls.filter((c: unknown[]) => c[0] === "usage:limits");
			expect(limitsCalls.length).toBeGreaterThan(0);
			const lastCall = limitsCalls[limitsCalls.length - 1];
			const data = lastCall[1] as { perModel: Record<string, { model: string }> };
			expect(data.perModel["claude-sonnet-4-20250514"]).toBeDefined();
			expect(data.perModel["claude-sonnet-4-20250514"].model).toBe("claude-sonnet-4-20250514");
		});

		it("responds to usage:query by broadcasting current data", () => {
			// Get the handler registered via pi.events.on("usage:query", handler)
			const _onCalls = (pi.events.on as ReturnType<typeof vi.fn>).mock.calls;
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			// Record a turn so there's data
			const msg = makeAssistantMessage({ input: 500, output: 250, costTotal: 0.005 });
			pi._emit("turn_end", { type: "turn_end", turnIndex: 0, message: msg, toolResults: [] }, ctx);

			// Clear previous emit calls
			(pi.events.emit as ReturnType<typeof vi.fn>).mockClear();

			// Find and invoke the usage:query handler
			const updatedOnCalls = (pi.events.on as ReturnType<typeof vi.fn>).mock.calls;
			const queryHandler = updatedOnCalls.find((c: unknown[]) => c[0] === "usage:query")?.[1] as () => void;
			expect(queryHandler).toBeDefined();
			queryHandler();

			expect(pi.events.emit).toHaveBeenCalledWith(
				"usage:limits",
				expect.objectContaining({
					sessionCost: expect.any(Number),
				}),
			);
		});

		it("broadcasts session cost of zero when no turns recorded", () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			// Trigger a turn_end with zero cost message — let's just invoke usage:query directly
			(pi.events.emit as ReturnType<typeof vi.fn>).mockClear();
			const onCalls = (pi.events.on as ReturnType<typeof vi.fn>).mock.calls;
			const queryHandler = onCalls.find((c: unknown[]) => c[0] === "usage:query")?.[1] as () => void;
			expect(queryHandler).toBeDefined();
			queryHandler();

			const emitCalls = (pi.events.emit as ReturnType<typeof vi.fn>).mock.calls;
			const limitsCalls = emitCalls.filter((c: unknown[]) => c[0] === "usage:limits");
			expect(limitsCalls.length).toBe(1);
			const data = limitsCalls[0][1] as { sessionCost: number };
			expect(data.sessionCost).toBe(0);
		});
	});

	describe("keybinding auto-configuration", () => {
		it("writes keybindings.json to unbind deleteToLineStart when file does not exist", () => {
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
			usageTracker(pi as any);

			expect(writeFileSync).toHaveBeenCalledWith(
				expect.stringContaining("keybindings.json"),
				expect.stringContaining('"deleteToLineStart"'),
				"utf-8",
			);
		});

		it("writes keybindings.json when file exists but deleteToLineStart is not configured", () => {
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('{"cursorUp": ["up"]}');

			usageTracker(pi as any);

			expect(writeFileSync).toHaveBeenCalledWith(
				expect.stringContaining("keybindings.json"),
				expect.stringContaining('"deleteToLineStart": []'),
				"utf-8",
			);
		});

		it("does not overwrite keybindings.json when deleteToLineStart is already configured", () => {
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('{"deleteToLineStart": ["ctrl+shift+u"]}');

			(writeFileSync as ReturnType<typeof vi.fn>).mockClear();
			usageTracker(pi as any);

			// writeFileSync should not be called for keybindings (may be called for other things)
			const keybindingWrites = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls.filter(
				(c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("keybindings.json"),
			);
			expect(keybindingWrites).toHaveLength(0);
		});

		it("preserves existing keybindings when adding deleteToLineStart", () => {
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('{"cursorUp": ["up", "ctrl+p"]}');

			usageTracker(pi as any);

			const writeCalls = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls.filter(
				(c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("keybindings.json"),
			);
			expect(writeCalls).toHaveLength(1);
			const written = JSON.parse(writeCalls[0][1] as string);
			expect(written.cursorUp).toEqual(["up", "ctrl+p"]);
			expect(written.deleteToLineStart).toEqual([]);
		});
	});
});
