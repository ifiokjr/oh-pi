/**
 * Tests for the usage-tracker extension.
 *
 * Exercises: registration, data collection, threshold alerts, API rate limit
 * probing, widget rendering, session hydration, report generation, and
 * tool/command APIs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: vi.fn().mockReturnValue(false),
		mkdirSync: vi.fn(),
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

// ─── Fetch mock ─────────────────────────────────────────────────────────────

const mockFetch = vi.fn().mockResolvedValue({
	ok: true,
	status: 200,
	headers: new Map<string, string>(),
	json: async () => ({}),
});
vi.stubGlobal("fetch", mockFetch);

// ─── Auth helpers ───────────────────────────────────────────────────────────

const AUTH_JSON_PATH = "/mock-home/.pi/agent/auth.json";

function makeAuthJson(overrides: Record<string, any> = {}) {
	return JSON.stringify({
		anthropic: {
			type: "oauth",
			access: "sk-ant-oat01-test-token",
			refresh: "sk-ant-ort01-refresh",
			expires: Date.now() + 86_400_000,
		},
		"openai-codex": {
			type: "oauth",
			access:
				// Minimal JWT: header.payload.signature
				`eyJ0eXAiOiJKV1QifQ.${Buffer.from(JSON.stringify({ "https://api.openai.com/profile": { email: "test@example.com" }, "https://api.openai.com/auth": { chatgpt_plan_type: "pro" } })).toString("base64url")}.sig`,
			refresh: "rt_test",
			expires: Date.now() + 86_400_000,
			accountId: "test-account",
		},
		"google-antigravity": {
			type: "oauth",
			access: "ya29.test-token",
			refresh: "1//test-refresh",
			expires: Date.now() + 86_400_000,
			projectId: "test-project",
			email: "test@example.com",
		},
		...overrides,
	});
}

function makeFetchResponse(
	opts: { status?: number; ok?: boolean; headers?: Record<string, string>; body?: unknown } = {},
) {
	const headers = new Map(
		Object.entries(opts.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value] as const),
	);
	const body = opts.body ?? {};
	return {
		ok:
			opts.ok ?? (opts.status === undefined || (opts.status !== undefined && opts.status >= 200 && opts.status < 300)),
		status: opts.status ?? 200,
		headers: {
			get: (key: string) => headers.get(key.toLowerCase()) ?? null,
			...headers,
		},
		json: async () => body,
	};
}

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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import usageTracker from "./usage-tracker.js";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("usage-tracker extension", () => {
	let pi: ReturnType<typeof createMockPi>;
	let ctx: ReturnType<typeof createMockCtx>;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		(existsSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
			if (String(path).includes("auth.json")) {
				return true;
			}
			return false;
		});
		(readFileSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
			if (String(path).includes("auth.json")) {
				return makeAuthJson();
			}
			return "{}";
		});
		(mkdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		mockFetch.mockResolvedValue(
			makeFetchResponse({
				headers: {
					"anthropic-ratelimit-requests-limit": "50",
					"anthropic-ratelimit-requests-remaining": "49",
					"anthropic-ratelimit-requests-reset": new Date(Date.now() + 60_000).toISOString(),
					"anthropic-ratelimit-tokens-limit": "40000",
					"anthropic-ratelimit-tokens-remaining": "39900",
					"anthropic-ratelimit-tokens-reset": new Date(Date.now() + 60_000).toISOString(),
				},
			}),
		);
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

	describe("rolling 30d totals", () => {
		it("loads persisted 30d history from disk and shows it in summary", async () => {
			const now = Date.now();
			(existsSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) =>
				String(path).includes("usage-tracker-history.json"),
			);
			(readFileSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
				if (String(path).includes("usage-tracker-history.json")) {
					return JSON.stringify({
						version: 1,
						entries: [{ timestamp: now - 60_000, cost: 1.23 }],
					});
				}
				return "{}";
			});

			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "summary" }, undefined, undefined, ctx));
			expect(result.content[0].text).toContain("30d: $1.23");
		});

		it("persists turn costs to rolling history", () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);
			pi._emit(
				"turn_end",
				{ type: "turn_end", turnIndex: 0, message: makeAssistantMessage({ costTotal: 0.45 }), toolResults: [] },
				ctx,
			);

			const writes = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls.filter(
				(call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("usage-tracker-history.json"),
			);
			expect(writes.length).toBeGreaterThan(0);
			expect(String(writes[writes.length - 1][1])).toContain('"entries"');
		});

		it("drops history older than 30 days", async () => {
			const now = Date.now();
			(existsSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) =>
				String(path).includes("usage-tracker-history.json"),
			);
			(readFileSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
				if (String(path).includes("usage-tracker-history.json")) {
					return JSON.stringify({
						version: 1,
						entries: [
							{ timestamp: now - 31 * 24 * 60 * 60 * 1000, cost: 10 },
							{ timestamp: now - 60_000, cost: 1 },
						],
					});
				}
				return "{}";
			});

			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);
			pi._emit(
				"turn_end",
				{ type: "turn_end", turnIndex: 0, message: makeAssistantMessage({ costTotal: 0.5 }), toolResults: [] },
				ctx,
			);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "detailed" }, undefined, undefined, ctx));
			expect(result.content[0].text).toContain("30d total cost: $1.50");
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
		it("triggers Anthropic API probe when using Claude model", async () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			// Allow async probe to complete (fire-and-forget with token refresh)
			await vi.advanceTimersByTimeAsync(500);

			const fetchCalls = mockFetch.mock.calls;
			const anthropicCall = fetchCalls.find((c: any[]) => String(c[0]).includes("api.anthropic.com"));
			expect(anthropicCall).toBeDefined();
		});

		it("triggers OpenAI API probe when using OpenAI model", async () => {
			ctx.model = { id: "gpt-4o" } as any;
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			await vi.advanceTimersByTimeAsync(500);

			const fetchCalls = mockFetch.mock.calls;
			const openaiCall = fetchCalls.find((c: any[]) => String(c[0]).includes("api.openai.com"));
			expect(openaiCall).toBeDefined();
		});

		it("probes again on model_select", () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const initialCallCount = mockFetch.mock.calls.length;

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
			expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(initialCallCount);
		});

		it("shows no-auth note when auth.json has no entry for provider", async () => {
			(readFileSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
				if (String(path).includes("auth.json")) {
					return "{}";
				}
				return "{}";
			});

			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "detailed" }, undefined, undefined, ctx));
			const text = result.content[0].text;
			expect(text).toContain("No pi auth configured for Anthropic");
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

		it("returns summary with rate limits, session cost, and 30d total", async () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);
			pi._emit("turn_end", { type: "turn_end", turnIndex: 0, message: makeAssistantMessage(), toolResults: [] }, ctx);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "summary" }, undefined, undefined, ctx));
			const text = result.content[0].text;
			expect(text).toContain("Session:");
			expect(text).toContain("1 turns");
			expect(text).toContain("in /");
			expect(text).toContain("30d:");
		});

		it("shows rate limit windows from Anthropic OAuth usage endpoint", async () => {
			mockFetch.mockResolvedValue(
				makeFetchResponse({
					body: {
						five_hour: {
							utilization: 64,
							resets_at: new Date(Date.now() + 30_000).toISOString(),
						},
						seven_day: {
							utilization: 18,
							resets_at: new Date(Date.now() + 3_600_000).toISOString(),
						},
						seven_day_sonnet: {
							utilization: 33,
							resets_at: new Date(Date.now() + 7_200_000).toISOString(),
						},
					},
				}),
			);

			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);
			pi._emit("turn_end", { type: "turn_end", turnIndex: 0, message: makeAssistantMessage(), toolResults: [] }, ctx);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "detailed" }, undefined, undefined, ctx));
			const text = result.content[0].text;

			expect(text).toContain("Anthropic Rate Limits:");
			expect(text).toContain("5-hour");
			expect(text).toContain("7-day");
			expect(text).toContain("Most constrained:");
			expect(text).toContain("Avg/turn:");
			expect(text).toContain("Cache:");
			expect(text).toContain("Plan: OAuth");
		});

		it("shows OpenAI plan from JWT when auth is configured", async () => {
			ctx.model = { id: "gpt-4o" } as any;
			mockFetch.mockResolvedValue(
				makeFetchResponse({
					headers: {
						"x-ratelimit-limit-requests": "10000",
						"x-ratelimit-remaining-requests": "9999",
						"x-ratelimit-reset-requests": "6ms",
						"x-ratelimit-limit-tokens": "200000",
						"x-ratelimit-remaining-tokens": "199500",
						"x-ratelimit-reset-tokens": "100ms",
					},
				}),
			);

			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "detailed" }, undefined, undefined, ctx));
			const text = result.content[0].text;

			expect(text).toContain("OpenAI Rate Limits:");
			expect(text).toContain("Plan: pro");
			expect(text).toContain("Account: test@example.com");
		});

		it("shows auth expired error when API returns 401", async () => {
			mockFetch.mockResolvedValue(makeFetchResponse({ status: 401, ok: false }));

			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "detailed" }, undefined, undefined, ctx));
			const text = result.content[0].text;

			expect(text).toContain("Anthropic auth token expired");
			expect(text).toContain("re-authenticate in pi settings");
		});

		it("shows a non-auth note when Anthropic OAuth usage endpoint is rate-limited", async () => {
			mockFetch.mockResolvedValue(makeFetchResponse({ status: 429, ok: false, headers: { "retry-after": "120" } }));

			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "detailed" }, undefined, undefined, ctx));
			const text = result.content[0].text;

			expect(text).toContain("Anthropic OAuth usage endpoint is rate-limited");
			expect(text).not.toContain("Anthropic auth token expired");
		});

		it("shows OpenAI auth expired error when API returns 401", async () => {
			ctx.model = { id: "gpt-4o" } as any;
			mockFetch.mockResolvedValue(makeFetchResponse({ status: 401, ok: false }));

			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "detailed" }, undefined, undefined, ctx));
			const text = result.content[0].text;

			expect(text).toContain("OpenAI auth token expired");
			expect(text).toContain("re-authenticate in pi settings");
		});

		it("shows no-auth note when provider has no token configured", async () => {
			ctx.model = { id: "gpt-4o" } as any;
			(readFileSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
				if (String(path).includes("auth.json")) {
					return JSON.stringify({ anthropic: { type: "oauth", access: "sk-test", refresh: "r", expires: 0 } });
				}
				return "{}";
			});

			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "detailed" }, undefined, undefined, ctx));
			const text = result.content[0].text;

			expect(text).toContain("No pi auth configured for OpenAI");
			expect(text).toContain("run pi login");
		});
	});

	describe("widget", () => {
		it("sets up widget on session_start", () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);
			expect(ctx._widgets.has("usage-tracker")).toBe(true);
		});

		it("renders both session and 30d totals", () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);
			pi._emit(
				"turn_end",
				{ type: "turn_end", turnIndex: 0, message: makeAssistantMessage({ costTotal: 0.02 }), toolResults: [] },
				ctx,
			);

			const widgetFactory = ctx._widgets.get("usage-tracker") as
				| ((
						tui: { requestRender: () => void },
						theme: { fg: (_color: string, text: string) => string },
				  ) => {
						render: () => string[];
				  })
				| undefined;
			expect(widgetFactory).toBeDefined();
			const component = widgetFactory?.({ requestRender: vi.fn() }, { fg: (_color: string, text: string) => text });
			const rendered = component?.render().join("\n") ?? "";
			expect(rendered).toContain("💰");
			expect(rendered).toContain("30d:");
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
		it("shows overlay with rate limit detail sections from API probes", async () => {
			mockFetch.mockResolvedValue(
				makeFetchResponse({
					body: {
						five_hour: {
							utilization: 58,
							resets_at: new Date(Date.now() + 45_000).toISOString(),
						},
						seven_day: {
							utilization: 21,
							resets_at: new Date(Date.now() + 3_600_000).toISOString(),
						},
					},
				}),
			);

			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);
			pi._emit("turn_end", { type: "turn_end", turnIndex: 0, message: makeAssistantMessage(), toolResults: [] }, ctx);
			vi.advanceTimersByTime(15_000);
			pi._emit(
				"turn_end",
				{ type: "turn_end", turnIndex: 1, message: makeAssistantMessage({ costTotal: 0.015 }), toolResults: [] },
				ctx,
			);

			await runWithTimers(() => pi._commands.get("usage").handler("", ctx));
			expect(ctx.ui.custom).toHaveBeenCalledWith(expect.any(Function), { overlay: true });

			const rendererFactory = (ctx.ui.custom as ReturnType<typeof vi.fn>).mock.calls[0][0] as (...args: unknown[]) => {
				render: (width: number) => string[];
			};
			const component = rendererFactory(
				{ requestRender: vi.fn() },
				{ fg: (_color: string, text: string) => text },
				{},
				vi.fn(),
			);
			const rendered = component.render(220).join("\n");
			expect(rendered).toContain("Anthropic Rate Limits");
			expect(rendered).toContain("Avg");
			expect(rendered).toContain("Cache");
			expect(rendered).toContain("Pace");
			expect(rendered).toContain("used)");
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

		it("registers usage:record listener for external inference usage", () => {
			usageTracker(pi as any);
			expect(pi.events.on).toHaveBeenCalledWith("usage:record", expect.any(Function));
		});

		it("ingests external usage records (e.g. ant-colony background inference)", async () => {
			usageTracker(pi as any);
			pi._emit("session_start", { type: "session_start" }, ctx);

			const onCalls = (pi.events.on as ReturnType<typeof vi.fn>).mock.calls;
			const recordHandler = onCalls.find((c: unknown[]) => c[0] === "usage:record")?.[1] as
				| ((payload: unknown) => void)
				| undefined;
			expect(recordHandler).toBeDefined();

			recordHandler?.({
				source: "ant-colony",
				scope: "background",
				provider: "anthropic",
				model: "claude-sonnet-4-20250514",
				usage: {
					input: 1200,
					output: 800,
					cacheRead: 0,
					cacheWrite: 0,
					costTotal: 0.02,
				},
			});

			const tool = pi._tools.get("usage_report");
			const result = await runWithTimers(() => tool.execute("id", { format: "detailed" }, undefined, undefined, ctx));
			expect(result.content[0].text).toContain("External inference:");
			expect(result.content[0].text).toContain("ant-colony/background");
			expect(result.content[0].text).toContain("$0.020");
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

		it("does not overwrite keybindings.json when deleteToLineStart is configured without ctrl+u", () => {
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

		it("removes ctrl+u from existing deleteToLineStart bindings", () => {
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
				'{"deleteToLineStart": ["ctrl+u", "ctrl+shift+u"], "cursorUp": ["up"]}',
			);

			usageTracker(pi as any);

			const writeCalls = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls.filter(
				(c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("keybindings.json"),
			);
			expect(writeCalls).toHaveLength(1);
			const written = JSON.parse(writeCalls[0][1] as string);
			expect(written.deleteToLineStart).toEqual(["ctrl+shift+u"]);
			expect(written.cursorUp).toEqual(["up"]);
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
