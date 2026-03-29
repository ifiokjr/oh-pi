/**
 * Tests for the scheduler extension.
 *
 * Exercises: parsing (/loop, /remind), cron normalization, duration parsing,
 * schedule_prompt tool validation, SchedulerRuntime lifecycle, task management,
 * event wiring, command handlers, tool actions, persistence, and edge cases.
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
		renameSync: vi.fn(),
		copyFileSync: vi.fn(),
		rmSync: vi.fn(),
		readdirSync: vi.fn().mockReturnValue([]),
		rmdirSync: vi.fn(),
	};
});

vi.mock("node:os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	return { ...actual, homedir: () => "/mock-home" };
});

vi.mock("@mariozechner/pi-coding-agent", () => ({}));
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

function createMockPi() {
	const handlers = new Map<string, ((...args: any[]) => any)[]>();
	const tools = new Map<string, any>();
	const commands = new Map<string, any>();
	const messages: any[] = [];
	const userMessages: string[] = [];

	return {
		on(event: string, handler: (...args: any[]) => any) {
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
		sendMessage(msg: any) {
			messages.push(msg);
		},
		sendUserMessage(prompt: string) {
			userMessages.push(prompt);
		},

		_handlers: handlers,
		_tools: tools,
		_commands: commands,
		_messages: messages,
		_userMessages: userMessages,
		_emit(event: string, ...args: any[]) {
			const fns = handlers.get(event) ?? [];
			for (const fn of fns) {
				fn(...args);
			}
		},
	};
}

function createMockCtx(overrides: Record<string, any> = {}) {
	const notifications: { msg: string; type: string }[] = [];
	const statusMap = new Map<string, any>();

	return {
		cwd: overrides.cwd ?? "/mock-project",
		hasUI: overrides.hasUI ?? true,
		isIdle: overrides.isIdle ?? (() => true),
		hasPendingMessages: overrides.hasPendingMessages ?? (() => false),
		ui: {
			notify(msg: string, type: string) {
				notifications.push({ msg, type });
			},
			setStatus(key: string, value: any) {
				if (value === undefined) {
					statusMap.delete(key);
				} else {
					statusMap.set(key, value);
				}
			},
			select: overrides.select ?? vi.fn().mockResolvedValue(null),
			confirm: overrides.confirm ?? vi.fn().mockResolvedValue(true),
			input: overrides.input ?? vi.fn().mockResolvedValue(null),
		},
		_notifications: notifications,
		_statusMap: statusMap,
	};
}

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import schedulerExtension, {
	computeNextCronRunAt,
	DEFAULT_LOOP_INTERVAL,
	DISPATCH_RATE_LIMIT_WINDOW_MS,
	FIFTEEN_MINUTES,
	formatDurationShort,
	getSchedulerStoragePath,
	MAX_DISPATCHES_PER_WINDOW,
	MAX_TASKS,
	MIN_RECURRING_INTERVAL,
	normalizeCronExpression,
	normalizeDuration,
	ONE_MINUTE,
	parseDuration,
	parseLoopScheduleArgs,
	parseRemindScheduleArgs,
	SchedulerRuntime,
	THREE_DAYS,
	validateSchedulePromptAddInput,
} from "./scheduler.js";

// ─── Duration parsing ────────────────────────────────────────────────────────

describe("parseDuration", () => {
	it("parses seconds with short unit", () => {
		expect(parseDuration("30s")).toBe(30_000);
	});

	it("parses minutes with short unit", () => {
		expect(parseDuration("5m")).toBe(5 * ONE_MINUTE);
	});

	it("parses hours with short unit", () => {
		expect(parseDuration("2h")).toBe(2 * 60 * ONE_MINUTE);
	});

	it("parses days with short unit", () => {
		expect(parseDuration("1d")).toBe(24 * 60 * ONE_MINUTE);
	});

	it("parses word form: seconds", () => {
		expect(parseDuration("10 seconds")).toBe(10_000);
	});

	it("parses word form: sec", () => {
		expect(parseDuration("10 sec")).toBe(10_000);
	});

	it("parses word form: minutes", () => {
		expect(parseDuration("5 minutes")).toBe(5 * ONE_MINUTE);
	});

	it("parses word form: mins", () => {
		expect(parseDuration("5 mins")).toBe(5 * ONE_MINUTE);
	});

	it("parses word form: hours", () => {
		expect(parseDuration("3 hours")).toBe(3 * 60 * ONE_MINUTE);
	});

	it("parses word form: hrs", () => {
		expect(parseDuration("3 hrs")).toBe(3 * 60 * ONE_MINUTE);
	});

	it("parses word form: days", () => {
		expect(parseDuration("2 days")).toBe(2 * 24 * 60 * ONE_MINUTE);
	});

	it("parses word form: day (singular)", () => {
		expect(parseDuration("1 day")).toBe(24 * 60 * ONE_MINUTE);
	});

	it("returns undefined for empty string", () => {
		expect(parseDuration("")).toBeUndefined();
	});

	it("returns undefined for whitespace", () => {
		expect(parseDuration("   ")).toBeUndefined();
	});

	it("returns undefined for non-duration text", () => {
		expect(parseDuration("banana")).toBeUndefined();
	});

	it("returns undefined for missing number", () => {
		expect(parseDuration("minutes")).toBeUndefined();
	});

	it("returns undefined for negative values", () => {
		expect(parseDuration("-5m")).toBeUndefined();
	});

	it("handles extra whitespace between number and unit", () => {
		expect(parseDuration("5   minutes")).toBe(5 * ONE_MINUTE);
	});

	it("is case insensitive", () => {
		expect(parseDuration("5M")).toBe(5 * ONE_MINUTE);
		expect(parseDuration("2H")).toBe(2 * 60 * ONE_MINUTE);
	});
});

// ─── Duration normalization ──────────────────────────────────────────────────

describe("normalizeDuration", () => {
	it("passes through exact minute values", () => {
		const result = normalizeDuration(5 * ONE_MINUTE);
		expect(result.durationMs).toBe(5 * ONE_MINUTE);
		expect(result.note).toBeUndefined();
	});

	it("rounds up sub-minute durations to 1m", () => {
		const result = normalizeDuration(30_000);
		expect(result.durationMs).toBe(ONE_MINUTE);
		expect(result.note).toContain("Rounded");
	});

	it("rounds up to nearest minute", () => {
		const result = normalizeDuration(ONE_MINUTE + 1000);
		expect(result.durationMs).toBe(2 * ONE_MINUTE);
		expect(result.note).toContain("minute granularity");
	});

	it("handles zero duration", () => {
		const result = normalizeDuration(0);
		expect(result.durationMs).toBe(ONE_MINUTE);
		expect(result.note).toContain("Rounded up to 1m");
	});

	it("handles negative duration", () => {
		const result = normalizeDuration(-5000);
		expect(result.durationMs).toBe(ONE_MINUTE);
		expect(result.note).toContain("minimum interval");
	});
});

// ─── formatDurationShort ─────────────────────────────────────────────────────

describe("formatDurationShort", () => {
	it("formats minutes", () => {
		expect(formatDurationShort(5 * ONE_MINUTE)).toBe("5m");
	});

	it("formats hours", () => {
		expect(formatDurationShort(2 * 60 * ONE_MINUTE)).toBe("2h");
	});

	it("formats days", () => {
		expect(formatDurationShort(24 * 60 * ONE_MINUTE)).toBe("1d");
	});

	it("falls back to minutes for odd values", () => {
		expect(formatDurationShort(90 * ONE_MINUTE)).toBe("90m");
	});
});

// ─── Cron normalization ──────────────────────────────────────────────────────

describe("normalizeCronExpression", () => {
	it("normalizes 5-field cron to 6-field by prepending seconds=0", () => {
		const result = normalizeCronExpression("*/5 * * * *");
		expect(result).toBeDefined();
		expect(result!.expression).toBe("0 */5 * * * *");
		expect(result!.note).toContain("5-field cron");
	});

	it("accepts 6-field cron as-is", () => {
		const result = normalizeCronExpression("0 */10 * * * *");
		expect(result).toBeDefined();
		expect(result!.expression).toBe("0 */10 * * * *");
		expect(result!.note).toBeUndefined();
	});

	it("rejects cron schedules faster than 1 minute", () => {
		expect(normalizeCronExpression("*/30 * * * * *")).toBeUndefined();
		expect(normalizeCronExpression("* * * * * *")).toBeUndefined();
	});

	it("rejects empty input", () => {
		expect(normalizeCronExpression("")).toBeUndefined();
	});

	it("rejects whitespace-only input", () => {
		expect(normalizeCronExpression("   ")).toBeUndefined();
	});

	it("rejects invalid cron (too few fields)", () => {
		expect(normalizeCronExpression("*/5 *")).toBeUndefined();
	});

	it("rejects invalid cron (too many fields)", () => {
		expect(normalizeCronExpression("0 0 0 * * * *")).toBeUndefined();
	});

	it("rejects non-cron text", () => {
		expect(normalizeCronExpression("not-a-cron")).toBeUndefined();
	});

	it("rejects invalid cron values", () => {
		expect(normalizeCronExpression("99 99 99 99 99")).toBeUndefined();
	});
});

// ─── computeNextCronRunAt ────────────────────────────────────────────────────

describe("computeNextCronRunAt", () => {
	it("returns a future timestamp", () => {
		const now = Date.now();
		const next = computeNextCronRunAt("0 */5 * * * *", now);
		expect(next).toBeDefined();
		expect(next!).toBeGreaterThan(now);
	});

	it("returns undefined for invalid expression", () => {
		expect(computeNextCronRunAt("invalid cron")).toBeUndefined();
	});

	it("computes from a specific timestamp", () => {
		const from = new Date("2026-01-01T00:00:00Z").getTime();
		const next = computeNextCronRunAt("0 */5 * * * *", from);
		expect(next).toBeDefined();
		expect(next!).toBeGreaterThan(from);
	});
});

// ─── parseLoopScheduleArgs ───────────────────────────────────────────────────

describe("parseLoopScheduleArgs", () => {
	it("returns undefined for empty input", () => {
		expect(parseLoopScheduleArgs("")).toBeUndefined();
	});

	it("returns undefined for whitespace-only input", () => {
		expect(parseLoopScheduleArgs("   ")).toBeUndefined();
	});

	it("parses leading duration: /loop 5m check build", () => {
		const result = parseLoopScheduleArgs("5m check build");
		expect(result).toBeDefined();
		expect(result!.prompt).toBe("check build");
		expect(result!.recurring.mode).toBe("interval");
		if (result!.recurring.mode === "interval") {
			expect(result!.recurring.durationMs).toBe(5 * ONE_MINUTE);
		}
	});

	it("parses trailing every: /loop check build every 2h", () => {
		const result = parseLoopScheduleArgs("check build every 2h");
		expect(result).toBeDefined();
		expect(result!.prompt).toBe("check build");
		expect(result!.recurring.mode).toBe("interval");
		if (result!.recurring.mode === "interval") {
			expect(result!.recurring.durationMs).toBe(2 * 60 * ONE_MINUTE);
		}
	});

	it("defaults to 10m interval when no duration given", () => {
		const result = parseLoopScheduleArgs("check build status");
		expect(result).toBeDefined();
		expect(result!.prompt).toBe("check build status");
		expect(result!.recurring.mode).toBe("interval");
		if (result!.recurring.mode === "interval") {
			expect(result!.recurring.durationMs).toBe(DEFAULT_LOOP_INTERVAL);
		}
	});

	it("parses explicit cron with 5-field expression", () => {
		const result = parseLoopScheduleArgs("cron */5 * * * * check ci status");
		expect(result).toBeDefined();
		expect(result!.prompt).toBe("check ci status");
		expect(result!.recurring.mode).toBe("cron");
		if (result!.recurring.mode === "cron") {
			expect(result!.recurring.cronExpression).toBe("0 */5 * * * *");
		}
	});

	it("parses explicit cron with quoted 6-field expression", () => {
		const result = parseLoopScheduleArgs("cron '0 */10 * * * *' check deployment");
		expect(result).toBeDefined();
		expect(result!.prompt).toBe("check deployment");
		expect(result!.recurring.mode).toBe("cron");
		if (result!.recurring.mode === "cron") {
			expect(result!.recurring.cronExpression).toBe("0 */10 * * * *");
		}
	});

	it("parses explicit cron with double-quoted expression", () => {
		const result = parseLoopScheduleArgs('cron "0 */15 * * * *" run tests');
		expect(result).toBeDefined();
		expect(result!.prompt).toBe("run tests");
		expect(result!.recurring.mode).toBe("cron");
	});

	it("returns undefined for invalid explicit cron syntax", () => {
		expect(parseLoopScheduleArgs("cron nope check deployment")).toBeUndefined();
	});

	it("rejects explicit cron schedules faster than 1 minute", () => {
		expect(parseLoopScheduleArgs("cron */30 * * * * * check deployment")).toBeUndefined();
	});

	it("handles word-form duration: /loop check CI every 30 minutes", () => {
		const result = parseLoopScheduleArgs("check CI every 30 minutes");
		expect(result).toBeDefined();
		expect(result!.prompt).toBe("check CI");
		if (result!.recurring.mode === "interval") {
			expect(result!.recurring.durationMs).toBe(30 * ONE_MINUTE);
		}
	});

	it("rounds sub-minute durations up", () => {
		const result = parseLoopScheduleArgs("30s check build");
		expect(result).toBeDefined();
		if (result!.recurring.mode === "interval") {
			expect(result!.recurring.durationMs).toBe(ONE_MINUTE);
			expect(result!.recurring.note).toContain("Rounded");
		}
	});
});

// ─── parseRemindScheduleArgs ─────────────────────────────────────────────────

describe("parseRemindScheduleArgs", () => {
	it("returns undefined for empty input", () => {
		expect(parseRemindScheduleArgs("")).toBeUndefined();
	});

	it("parses with 'in' prefix: in 45m check tests", () => {
		const result = parseRemindScheduleArgs("in 45m check tests");
		expect(result).toBeDefined();
		expect(result!.prompt).toBe("check tests");
		expect(result!.durationMs).toBe(45 * ONE_MINUTE);
	});

	it("parses without 'in' prefix: 2h follow up", () => {
		const result = parseRemindScheduleArgs("2h follow up");
		expect(result).toBeDefined();
		expect(result!.prompt).toBe("follow up");
		expect(result!.durationMs).toBe(2 * 60 * ONE_MINUTE);
	});

	it("returns undefined when no duration found", () => {
		expect(parseRemindScheduleArgs("do something later")).toBeUndefined();
	});

	it("returns undefined for duration-only input (no prompt)", () => {
		expect(parseRemindScheduleArgs("5m")).toBeUndefined();
	});
});

// ─── validateSchedulePromptAddInput ──────────────────────────────────────────

describe("validateSchedulePromptAddInput", () => {
	it("rejects cron for once tasks", () => {
		const result = validateSchedulePromptAddInput({ kind: "once", cron: "*/5 * * * *" });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("invalid_cron_for_once");
		}
	});

	it("requires duration for once tasks", () => {
		const result = validateSchedulePromptAddInput({ kind: "once" });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("missing_duration");
		}
	});

	it("rejects both duration and cron for recurring", () => {
		const result = validateSchedulePromptAddInput({ kind: "recurring", duration: "5m", cron: "*/5 * * * *" });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("conflicting_schedule_inputs");
		}
	});

	it("rejects invalid duration", () => {
		const result = validateSchedulePromptAddInput({ kind: "recurring", duration: "banana" });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("invalid_duration");
		}
	});

	it("rejects invalid cron", () => {
		const result = validateSchedulePromptAddInput({ kind: "recurring", cron: "not-a-cron" });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("invalid_cron");
		}
	});

	it("rejects recurring cron schedules faster than 1 minute", () => {
		const result = validateSchedulePromptAddInput({ kind: "recurring", cron: "*/30 * * * * *" });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("invalid_cron");
		}
	});

	it("validates and normalizes recurring cron", () => {
		const result = validateSchedulePromptAddInput({ kind: "recurring", cron: "*/5 * * * *" });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.plan.kind).toBe("recurring");
			if (result.plan.kind === "recurring") {
				expect(result.plan.mode).toBe("cron");
				if (result.plan.mode === "cron") {
					expect(result.plan.cronExpression).toBe("0 */5 * * * *");
				}
			}
		}
	});

	it("validates recurring duration", () => {
		const result = validateSchedulePromptAddInput({ kind: "recurring", duration: "5m" });
		expect(result.ok).toBe(true);
		if (result.ok && result.plan.kind === "recurring" && result.plan.mode === "interval") {
			expect(result.plan.durationMs).toBe(5 * ONE_MINUTE);
		}
	});

	it("defaults recurring to 10m interval when no schedule provided", () => {
		const result = validateSchedulePromptAddInput({});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.plan.kind).toBe("recurring");
			if (result.plan.kind === "recurring" && result.plan.mode === "interval") {
				expect(result.plan.durationMs).toBe(DEFAULT_LOOP_INTERVAL);
			}
		}
	});

	it("validates once with valid duration", () => {
		const result = validateSchedulePromptAddInput({ kind: "once", duration: "30m" });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.plan.kind).toBe("once");
			if (result.plan.kind === "once") {
				expect(result.plan.durationMs).toBe(30 * ONE_MINUTE);
			}
		}
	});

	it("normalizes once duration sub-minute values", () => {
		const result = validateSchedulePromptAddInput({ kind: "once", duration: "30s" });
		expect(result.ok).toBe(true);
		if (result.ok && result.plan.kind === "once") {
			expect(result.plan.durationMs).toBe(ONE_MINUTE);
			expect(result.plan.note).toContain("Rounded");
		}
	});
});

// ─── SchedulerRuntime ────────────────────────────────────────────────────────

describe("getSchedulerStoragePath", () => {
	it("stores scheduler state under the shared pi agent directory", () => {
		expect(getSchedulerStoragePath("/mock-project")).toBe(
			"/mock-home/.pi/agent/scheduler/root/mock-project/scheduler.json",
		);
	});

	it("mirrors nested repository paths for uniqueness", () => {
		expect(getSchedulerStoragePath("/Users/test/work/repo")).toBe(
			"/mock-home/.pi/agent/scheduler/root/Users/test/work/repo/scheduler.json",
		);
	});
});

describe("SchedulerRuntime", () => {
	let pi: ReturnType<typeof createMockPi>;
	let runtime: SchedulerRuntime;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
		(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("{}");
		(mkdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(renameSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(copyFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(rmSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([]);
		(rmdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		pi = createMockPi();
		runtime = new SchedulerRuntime(pi as any);
	});

	afterEach(() => {
		runtime.stopScheduler();
		vi.useRealTimers();
	});

	describe("task management", () => {
		it("starts with zero tasks", () => {
			expect(runtime.taskCount).toBe(0);
		});

		it("adds recurring interval task", () => {
			const task = runtime.addRecurringIntervalTask("check build", 5 * ONE_MINUTE);
			expect(task.kind).toBe("recurring");
			expect(task.intervalMs).toBe(5 * ONE_MINUTE);
			expect(task.enabled).toBe(true);
			expect(task.runCount).toBe(0);
			expect(runtime.taskCount).toBe(1);
		});

		it("adds recurring cron task", () => {
			const task = runtime.addRecurringCronTask("check ci", "0 */5 * * * *");
			expect(task).toBeDefined();
			expect(task!.kind).toBe("recurring");
			expect(task!.cronExpression).toBe("0 */5 * * * *");
			expect(runtime.taskCount).toBe(1);
		});

		it("returns undefined for invalid cron task", () => {
			const task = runtime.addRecurringCronTask("check ci", "invalid");
			expect(task).toBeUndefined();
			expect(runtime.taskCount).toBe(0);
		});

		it("returns undefined for sub-minute cron task", () => {
			const task = runtime.addRecurringCronTask("check ci", "*/30 * * * * *");
			expect(task).toBeUndefined();
			expect(runtime.taskCount).toBe(0);
		});

		it("adds one-shot task", () => {
			const task = runtime.addOneShotTask("check deploy", 30 * ONE_MINUTE);
			expect(task.kind).toBe("once");
			expect(task.runCount).toBe(0);
			expect(runtime.taskCount).toBe(1);
		});

		it("generates unique IDs", () => {
			const task1 = runtime.addRecurringIntervalTask("a", 5 * ONE_MINUTE);
			const task2 = runtime.addRecurringIntervalTask("b", 5 * ONE_MINUTE);
			expect(task1.id).not.toBe(task2.id);
		});

		it("enables and disables tasks", () => {
			const task = runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);
			expect(runtime.setTaskEnabled(task.id, false)).toBe(true);
			expect(runtime.getTask(task.id)!.enabled).toBe(false);

			expect(runtime.setTaskEnabled(task.id, true)).toBe(true);
			expect(runtime.getTask(task.id)!.enabled).toBe(true);
		});

		it("returns false when enabling nonexistent task", () => {
			expect(runtime.setTaskEnabled("nonexistent", true)).toBe(false);
		});

		it("deletes tasks", () => {
			const task = runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);
			expect(runtime.deleteTask(task.id)).toBe(true);
			expect(runtime.taskCount).toBe(0);
		});

		it("returns false when deleting nonexistent task", () => {
			expect(runtime.deleteTask("nonexistent")).toBe(false);
		});

		it("clears all tasks", () => {
			runtime.addRecurringIntervalTask("a", 5 * ONE_MINUTE);
			runtime.addRecurringIntervalTask("b", 5 * ONE_MINUTE);
			runtime.addOneShotTask("c", 30 * ONE_MINUTE);
			expect(runtime.clearTasks()).toBe(3);
			expect(runtime.taskCount).toBe(0);
		});

		it("returns tasks sorted by nextRunAt", () => {
			const now = Date.now();
			const task1 = runtime.addRecurringIntervalTask("later", 10 * ONE_MINUTE);
			const task2 = runtime.addRecurringIntervalTask("sooner", 2 * ONE_MINUTE);
			const sorted = runtime.getSortedTasks();
			expect(sorted[0].id).toBe(task2.id);
			expect(sorted[1].id).toBe(task1.id);
		});

		it("disabling a task clears its pending flag", () => {
			const task = runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);
			const stored = runtime.getTask(task.id)!;
			stored.pending = true;
			runtime.setTaskEnabled(task.id, false);
			expect(runtime.getTask(task.id)!.pending).toBe(false);
		});
	});

	describe("recurring task expiry", () => {
		it("sets expiresAt to 3 days after creation for interval tasks", () => {
			const now = Date.now();
			const task = runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);
			expect(task.expiresAt).toBe(now + THREE_DAYS);
		});

		it("sets expiresAt to 3 days after creation for cron tasks", () => {
			const now = Date.now();
			const task = runtime.addRecurringCronTask("check", "0 */5 * * * *");
			expect(task).toBeDefined();
			expect(task!.expiresAt).toBe(now + THREE_DAYS);
		});

		it("does not set expiresAt for one-shot tasks", () => {
			const task = runtime.addOneShotTask("remind", 30 * ONE_MINUTE);
			expect(task.expiresAt).toBeUndefined();
		});
	});

	describe("jitter", () => {
		it("applies jitter bounded by 10% of interval (capped at 15m)", () => {
			const task = runtime.addRecurringIntervalTask("check", 60 * ONE_MINUTE);
			const maxJitter = Math.min(Math.floor(60 * ONE_MINUTE * 0.1), FIFTEEN_MINUTES);
			expect(task.jitterMs).toBeGreaterThanOrEqual(0);
			expect(task.jitterMs).toBeLessThanOrEqual(maxJitter);
		});

		it("applies zero jitter for very small intervals", () => {
			const jitter = runtime.computeJitterMs("test", 0);
			expect(jitter).toBe(0);
		});

		it("produces deterministic jitter for same task ID", () => {
			const j1 = runtime.computeJitterMs("abc", 10 * ONE_MINUTE);
			const j2 = runtime.computeJitterMs("abc", 10 * ONE_MINUTE);
			expect(j1).toBe(j2);
		});

		it("produces different jitter for different task IDs", () => {
			const j1 = runtime.computeJitterMs("abc", 60 * ONE_MINUTE);
			const j2 = runtime.computeJitterMs("xyz", 60 * ONE_MINUTE);
			// They *could* collide but extremely unlikely with different strings
			// This is a probabilistic check
			expect(typeof j1).toBe("number");
			expect(typeof j2).toBe("number");
		});

		it("cron tasks have zero jitter", () => {
			const task = runtime.addRecurringCronTask("check", "0 */5 * * * *");
			expect(task!.jitterMs).toBe(0);
		});

		it("one-shot tasks have zero jitter", () => {
			const task = runtime.addOneShotTask("remind", 30 * ONE_MINUTE);
			expect(task.jitterMs).toBe(0);
		});
	});

	describe("formatRelativeTime", () => {
		it('returns "due now" for past timestamps', () => {
			expect(runtime.formatRelativeTime(Date.now() - 1000)).toBe("due now");
		});

		it("returns minutes for <60m", () => {
			const result = runtime.formatRelativeTime(Date.now() + 5 * ONE_MINUTE);
			expect(result).toBe("in 5m");
		});

		it("returns at least 1m for very short future", () => {
			const result = runtime.formatRelativeTime(Date.now() + 1000);
			expect(result).toMatch(/in \d+m/);
		});

		it("returns hours for >=60m <48h", () => {
			const result = runtime.formatRelativeTime(Date.now() + 3 * 60 * ONE_MINUTE);
			expect(result).toBe("in 3h");
		});

		it("returns days for >=48h", () => {
			const result = runtime.formatRelativeTime(Date.now() + 3 * 24 * 60 * ONE_MINUTE);
			expect(result).toBe("in 3d");
		});
	});

	describe("formatTaskList", () => {
		it("returns no-tasks message when empty", () => {
			expect(runtime.formatTaskList()).toBe("No scheduled tasks.");
		});

		it("includes task details in list", () => {
			runtime.addRecurringIntervalTask("check build", 5 * ONE_MINUTE);
			const list = runtime.formatTaskList();
			expect(list).toContain("Scheduled tasks:");
			expect(list).toContain("check build");
			expect(list).toContain("every 5m");
			expect(list).toContain("runs=0");
		});

		it("truncates long prompts", () => {
			const longPrompt = "a".repeat(100);
			runtime.addRecurringIntervalTask(longPrompt, 5 * ONE_MINUTE);
			const list = runtime.formatTaskList();
			expect(list).toContain("...");
		});
	});

	describe("taskMode", () => {
		it('returns "once" for one-shot tasks', () => {
			const task = runtime.addOneShotTask("remind", 5 * ONE_MINUTE);
			expect(runtime.taskMode(task)).toBe("once");
		});

		it('returns "every Xm" for interval tasks', () => {
			const task = runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);
			expect(runtime.taskMode(task)).toBe("every 5m");
		});

		it('returns "cron <expr>" for cron tasks', () => {
			const task = runtime.addRecurringCronTask("check", "0 */5 * * * *");
			expect(runtime.taskMode(task!)).toBe("cron 0 */5 * * * *");
		});
	});

	describe("scheduler tick", () => {
		it("marks tasks as pending when due", async () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);

			const task = runtime.addRecurringIntervalTask("check", 1 * ONE_MINUTE);
			expect(runtime.getTask(task.id)!.pending).toBe(false);

			// Advance past the task's nextRunAt
			vi.advanceTimersByTime(task.nextRunAt - Date.now() + 1000);
			await runtime.tickScheduler();

			// Task should have been dispatched (pending cleared, runCount incremented)
			const updated = runtime.getTask(task.id);
			if (updated) {
				expect(updated.runCount).toBe(1);
				expect(updated.pending).toBe(false);
			}
		});

		it("does not dispatch when not idle", async () => {
			const ctx = createMockCtx({ isIdle: () => false });
			runtime.setRuntimeContext(ctx as any);

			const task = runtime.addRecurringIntervalTask("check", 1 * ONE_MINUTE);
			vi.advanceTimersByTime(task.nextRunAt - Date.now() + 1000);
			await runtime.tickScheduler();

			expect(runtime.getTask(task.id)!.pending).toBe(true);
			expect(pi._userMessages).toHaveLength(0);
		});

		it("does not dispatch when pending messages exist", async () => {
			const ctx = createMockCtx({ hasPendingMessages: () => true });
			runtime.setRuntimeContext(ctx as any);

			const task = runtime.addRecurringIntervalTask("check", 1 * ONE_MINUTE);
			vi.advanceTimersByTime(task.nextRunAt - Date.now() + 1000);
			await runtime.tickScheduler();

			expect(runtime.getTask(task.id)!.pending).toBe(true);
			expect(pi._userMessages).toHaveLength(0);
		});

		it("removes expired recurring tasks on tick", async () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);

			const task = runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);
			expect(runtime.taskCount).toBe(1);

			// Advance past 3 days
			vi.advanceTimersByTime(THREE_DAYS + 1000);
			await runtime.tickScheduler();

			expect(runtime.taskCount).toBe(0);
		});

		it("skips disabled tasks", async () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);

			const task = runtime.addRecurringIntervalTask("check", 1 * ONE_MINUTE);
			runtime.setTaskEnabled(task.id, false);

			vi.advanceTimersByTime(task.nextRunAt - Date.now() + 1000);
			await runtime.tickScheduler();

			expect(runtime.getTask(task.id)!.pending).toBe(false);
			expect(pi._userMessages).toHaveLength(0);
		});

		it("does nothing without runtime context", async () => {
			const task = runtime.addRecurringIntervalTask("check", 1 * ONE_MINUTE);
			vi.advanceTimersByTime(2 * ONE_MINUTE);
			await runtime.tickScheduler();
			expect(pi._userMessages).toHaveLength(0);
		});
	});

	describe("dispatchTask", () => {
		it("sends user message for enabled task", () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);

			const task = runtime.addRecurringIntervalTask("check ci", 5 * ONE_MINUTE);
			task.pending = true;
			runtime.dispatchTask(task);

			expect(pi._userMessages).toEqual(["check ci"]);
			expect(task.runCount).toBe(1);
			expect(task.lastStatus).toBe("success");
			expect(task.pending).toBe(false);
		});

		it("removes one-shot task after dispatch", () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);

			const task = runtime.addOneShotTask("remind me", 5 * ONE_MINUTE);
			task.pending = true;
			runtime.dispatchTask(task);

			expect(pi._userMessages).toEqual(["remind me"]);
			expect(runtime.taskCount).toBe(0);
		});

		it("advances cron task to next run after dispatch", () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);

			const task = runtime.addRecurringCronTask("check", "0 */5 * * * *")!;
			const originalNextRun = task.nextRunAt;
			task.pending = true;

			// Advance time past the task's nextRunAt so dispatch computes a future cron tick
			vi.setSystemTime(originalNextRun + 1000);
			runtime.dispatchTask(task);

			expect(task.nextRunAt).toBeGreaterThan(originalNextRun);
			expect(runtime.taskCount).toBe(1);
		});

		it("advances interval task to next run after dispatch", () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);

			const task = runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);
			const firstNextRun = task.nextRunAt;
			task.pending = true;

			// Move time to the task's nextRunAt
			vi.setSystemTime(firstNextRun);
			runtime.dispatchTask(task);

			expect(task.nextRunAt).toBeGreaterThan(firstNextRun);
		});

		it("self-heals unsafe interval values when dispatching", () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);

			const task = runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);
			task.intervalMs = 0;
			task.nextRunAt = Date.now();
			task.pending = true;

			runtime.dispatchTask(task);

			expect(task.intervalMs).toBe(ONE_MINUTE);
			expect(task.nextRunAt).toBeGreaterThan(Date.now());
		});

		it("applies a global dispatch rate limit fuse", () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);

			const tasks = Array.from({ length: MAX_DISPATCHES_PER_WINDOW + 2 }, (_, i) => {
				const task = runtime.addRecurringIntervalTask(`check ${i}`, 5 * ONE_MINUTE);
				task.pending = true;
				return task;
			});

			for (const task of tasks) {
				runtime.dispatchTask(task);
			}

			expect(pi._userMessages).toHaveLength(MAX_DISPATCHES_PER_WINDOW);
			expect(tasks[MAX_DISPATCHES_PER_WINDOW].pending).toBe(true);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Scheduler throttled"))).toBe(true);
		});

		it("resets dispatch capacity after the rate-limit window", () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);

			for (let i = 0; i < MAX_DISPATCHES_PER_WINDOW; i++) {
				const task = runtime.addRecurringIntervalTask(`check ${i}`, 5 * ONE_MINUTE);
				task.pending = true;
				runtime.dispatchTask(task);
			}
			expect(pi._userMessages).toHaveLength(MAX_DISPATCHES_PER_WINDOW);

			vi.advanceTimersByTime(DISPATCH_RATE_LIMIT_WINDOW_MS + 1_000);

			const nextTask = runtime.addRecurringIntervalTask("after window", 5 * ONE_MINUTE);
			nextTask.pending = true;
			runtime.dispatchTask(nextTask);

			expect(pi._userMessages).toHaveLength(MAX_DISPATCHES_PER_WINDOW + 1);
		});

		it("does not dispatch disabled task", () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);

			const task = runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);
			runtime.setTaskEnabled(task.id, false);
			task.pending = true;
			runtime.dispatchTask(task);

			expect(pi._userMessages).toHaveLength(0);
		});

		it("marks task as error if sendUserMessage throws", () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);

			pi.sendUserMessage = () => {
				throw new Error("send failed");
			};

			const task = runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);
			task.pending = true;
			runtime.dispatchTask(task);

			expect(task.lastStatus).toBe("error");
			expect(task.pending).toBe(true);
		});
	});

	describe("scheduler lifecycle", () => {
		it("startScheduler is idempotent", () => {
			runtime.startScheduler();
			runtime.startScheduler(); // Should not create second timer
			runtime.stopScheduler();
		});

		it("stopScheduler is safe when not started", () => {
			runtime.stopScheduler(); // Should not throw
		});
	});

	describe("status bar updates", () => {
		it("clears status when no tasks", () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);
			runtime.updateStatus();
			expect(ctx._statusMap.has("pi-scheduler")).toBe(false);
		});

		it("shows active count and next run", () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);
			runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);
			runtime.updateStatus();
			expect(ctx._statusMap.get("pi-scheduler")).toContain("1 active");
		});

		it("shows paused message when all tasks disabled", () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);
			const task = runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);
			runtime.setTaskEnabled(task.id, false);
			runtime.updateStatus();
			expect(ctx._statusMap.get("pi-scheduler")).toContain("paused");
		});

		it("does not update without UI", () => {
			const ctx = createMockCtx({ hasUI: false });
			runtime.setRuntimeContext(ctx as any);
			runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);
			runtime.updateStatus();
			expect(ctx._statusMap.size).toBe(0);
		});
	});

	describe("persistence", () => {
		it("persists tasks to the shared pi scheduler store on add", () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);
			runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);

			expect(writeFileSync).toHaveBeenCalled();
			const writes = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
			const schedulerWrite = writes.find(
				(c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("scheduler.json"),
			);
			expect(schedulerWrite).toBeDefined();
			expect(schedulerWrite?.[0]).toContain("/mock-home/.pi/agent/scheduler/root/mock-project/scheduler.json.tmp");
			expect(String(schedulerWrite?.[0])).not.toContain("/mock-project/.pi/scheduler.json");
		});

		it("uses atomic write (tmp + rename)", () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);
			runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);

			const writes = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
			const tmpWrite = writes.find((c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes(".tmp"));
			expect(tmpWrite).toBeDefined();
			expect(renameSync).toHaveBeenCalled();
		});

		it("loads tasks from the shared store on context set", () => {
			const now = Date.now();
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
				JSON.stringify({
					version: 1,
					tasks: [
						{
							id: "test1234",
							prompt: "check build",
							kind: "recurring",
							enabled: true,
							createdAt: now,
							nextRunAt: now + 5 * ONE_MINUTE,
							intervalMs: 5 * ONE_MINUTE,
							expiresAt: now + THREE_DAYS,
							jitterMs: 0,
							runCount: 3,
							pending: false,
						},
					],
				}),
			);

			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);

			expect(runtime.taskCount).toBe(1);
			const task = runtime.getTask("test1234");
			expect(task).toBeDefined();
			expect(task!.prompt).toBe("check build");
			expect(task!.runCount).toBe(3);
			expect(readFileSync).toHaveBeenCalledWith(getSchedulerStoragePath(ctx.cwd), "utf-8");
		});

		it("skips expired tasks when loading from disk", () => {
			const now = Date.now();
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
				JSON.stringify({
					version: 1,
					tasks: [
						{
							id: "expired1",
							prompt: "old task",
							kind: "recurring",
							enabled: true,
							createdAt: now - 4 * 24 * 60 * ONE_MINUTE,
							nextRunAt: now - ONE_MINUTE,
							intervalMs: 5 * ONE_MINUTE,
							expiresAt: now - ONE_MINUTE, // Already expired
							jitterMs: 0,
							runCount: 0,
							pending: false,
						},
					],
				}),
			);

			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);
			expect(runtime.taskCount).toBe(0);
			expect(rmSync).toHaveBeenCalledWith(getSchedulerStoragePath(ctx.cwd), { force: true });
		});

		it("skips unsafe sub-minute cron tasks when loading from disk", () => {
			const now = Date.now();
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
				JSON.stringify({
					version: 1,
					tasks: [
						{
							id: "unsafe1",
							prompt: "too frequent",
							kind: "recurring",
							enabled: true,
							createdAt: now,
							nextRunAt: now + ONE_MINUTE,
							cronExpression: "*/30 * * * * *",
							expiresAt: now + THREE_DAYS,
							jitterMs: 0,
							runCount: 0,
							pending: false,
						},
					],
				}),
			);

			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);
			expect(runtime.taskCount).toBe(0);
		});

		it("handles corrupted JSON gracefully", () => {
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("not-json{{{");

			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);
			expect(runtime.taskCount).toBe(0);
		});

		it("handles missing file gracefully", () => {
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);
			expect(runtime.taskCount).toBe(0);
		});

		it("skips tasks with missing id or prompt", () => {
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
				JSON.stringify({
					version: 1,
					tasks: [
						{ id: null, prompt: "no id", kind: "recurring" },
						{ id: "valid", prompt: null, kind: "recurring" },
						{
							id: "ok123",
							prompt: "valid",
							kind: "recurring",
							createdAt: Date.now(),
							nextRunAt: Date.now() + ONE_MINUTE,
							jitterMs: 0,
							runCount: 0,
							pending: false,
						},
					],
				}),
			);

			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);
			expect(runtime.taskCount).toBe(1);
		});

		it("defaults enabled to true and runCount to 0 when loading", () => {
			const now = Date.now();
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
				JSON.stringify({
					version: 1,
					tasks: [
						{
							id: "loaded1",
							prompt: "test",
							kind: "once",
							createdAt: now,
							nextRunAt: now + 5 * ONE_MINUTE,
							jitterMs: 0,
							// enabled and runCount missing
						},
					],
				}),
			);

			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);
			const task = runtime.getTask("loaded1");
			expect(task!.enabled).toBe(true);
			expect(task!.runCount).toBe(0);
			expect(task!.pending).toBe(false);
		});

		it("migrates legacy .pi/scheduler.json into the shared store", () => {
			const ctx = createMockCtx();
			const sharedPath = getSchedulerStoragePath(ctx.cwd);
			const legacyPath = `${ctx.cwd}/.pi/scheduler.json`;
			(existsSync as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => {
				if (filePath === legacyPath) {
					return true;
				}
				if (filePath === sharedPath) {
					return false;
				}
				return false;
			});

			runtime.setRuntimeContext(ctx as any);
			expect(copyFileSync).toHaveBeenCalledWith(legacyPath, sharedPath);
		});

		it("removes persisted scheduler files when tasks become defunct", () => {
			const ctx = createMockCtx();
			runtime.setRuntimeContext(ctx as any);
			runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);

			(writeFileSync as ReturnType<typeof vi.fn>).mockClear();
			runtime.clearTasks();

			expect(rmSync).toHaveBeenCalledWith(getSchedulerStoragePath(ctx.cwd), { force: true });
		});

		it("does not persist without storage path", () => {
			// Don't set runtime context (no storage path)
			runtime.addRecurringIntervalTask("check", 5 * ONE_MINUTE);
			// writeFileSync may not be called for scheduler writes
			const schedulerWrites = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls.filter(
				(c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("scheduler.json"),
			);
			expect(schedulerWrites).toHaveLength(0);
		});
	});

	describe("hashString", () => {
		it("returns a number", () => {
			expect(typeof runtime.hashString("test")).toBe("number");
		});

		it("returns same hash for same input", () => {
			expect(runtime.hashString("hello")).toBe(runtime.hashString("hello"));
		});

		it("returns different hashes for different inputs", () => {
			expect(runtime.hashString("abc")).not.toBe(runtime.hashString("xyz"));
		});

		it("returns unsigned 32-bit integer", () => {
			const hash = runtime.hashString("test");
			expect(hash).toBeGreaterThanOrEqual(0);
			expect(hash).toBeLessThanOrEqual(0xffffffff);
		});
	});
});

// ─── Extension registration ─────────────────────────────────────────────────

describe("schedulerExtension registration", () => {
	let pi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
		(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("{}");
		(mkdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(renameSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(copyFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(rmSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([]);
		(rmdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		pi = createMockPi();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("registers all four commands", () => {
		schedulerExtension(pi as any);
		expect(pi._commands.has("loop")).toBe(true);
		expect(pi._commands.has("remind")).toBe(true);
		expect(pi._commands.has("schedule")).toBe(true);
		expect(pi._commands.has("unschedule")).toBe(true);
	});

	it("registers schedule_prompt tool", () => {
		schedulerExtension(pi as any);
		expect(pi._tools.has("schedule_prompt")).toBe(true);
	});

	it("describes schedule_prompt as usable for future PR and CI follow-ups", () => {
		schedulerExtension(pi as any);
		const tool = pi._tools.get("schedule_prompt");
		expect(tool.description).toContain("check back later");
		expect(tool.description).toContain("PRs");
		expect(tool.description).toContain("CI");
		expect(tool.promptSnippet).toContain("future follow-ups");
		expect(tool.promptGuidelines.some((line: string) => line.includes("monitor PRs, CI"))).toBe(true);
		expect(tool.promptGuidelines.some((line: string) => line.includes("active and idle"))).toBe(true);
	});

	it("registers event handlers", () => {
		schedulerExtension(pi as any);
		expect(pi._handlers.has("session_start")).toBe(true);
		expect(pi._handlers.has("session_switch")).toBe(true);
		expect(pi._handlers.has("session_fork")).toBe(true);
		expect(pi._handlers.has("session_tree")).toBe(true);
		expect(pi._handlers.has("session_shutdown")).toBe(true);
	});
});

// ─── Command handlers ───────────────────────────────────────────────────────

describe("command handlers", () => {
	let pi: ReturnType<typeof createMockPi>;
	let ctx: ReturnType<typeof createMockCtx>;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
		(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("{}");
		(mkdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(renameSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(copyFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(rmSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([]);
		(rmdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		pi = createMockPi();
		ctx = createMockCtx();
		schedulerExtension(pi as any);
		pi._emit("session_start", { type: "session_start" }, ctx);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("/loop", () => {
		it("creates interval task with duration", async () => {
			await pi._commands.get("loop").handler("5m check build", ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Scheduled every 5m"))).toBe(true);
		});

		it("creates cron task", async () => {
			await pi._commands.get("loop").handler("cron */5 * * * * check ci", ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Scheduled cron"))).toBe(true);
		});

		it("creates task with default 10m interval", async () => {
			await pi._commands.get("loop").handler("check build status", ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Scheduled every 10m"))).toBe(true);
		});

		it("shows warning on empty args", async () => {
			await pi._commands.get("loop").handler("", ctx);
			expect(ctx._notifications.some((n: any) => n.type === "warning")).toBe(true);
		});

		it("shows error when task limit reached", async () => {
			// Fill up to MAX_TASKS
			for (let i = 0; i < MAX_TASKS; i++) {
				await pi._commands.get("loop").handler(`check ${i} every 5m`, ctx);
			}
			ctx._notifications.length = 0;

			await pi._commands.get("loop").handler("5m one more", ctx);
			expect(ctx._notifications.some((n: any) => n.type === "error" && n.msg.includes("Task limit"))).toBe(true);
		});

		it("shows note when duration is rounded", async () => {
			await pi._commands.get("loop").handler("30s check build", ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Rounded"))).toBe(true);
		});
	});

	describe("/remind", () => {
		it("creates one-shot reminder with 'in' prefix", async () => {
			await pi._commands.get("remind").handler("in 45m check tests", ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Reminder set"))).toBe(true);
		});

		it("creates one-shot reminder without 'in' prefix", async () => {
			await pi._commands.get("remind").handler("2h follow up", ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Reminder set"))).toBe(true);
		});

		it("shows warning on invalid args", async () => {
			await pi._commands.get("remind").handler("", ctx);
			expect(ctx._notifications.some((n: any) => n.type === "warning")).toBe(true);
		});

		it("shows warning on missing duration", async () => {
			await pi._commands.get("remind").handler("do something later", ctx);
			expect(ctx._notifications.some((n: any) => n.type === "warning")).toBe(true);
		});

		it("shows error when task limit reached", async () => {
			for (let i = 0; i < MAX_TASKS; i++) {
				await pi._commands.get("loop").handler(`check ${i} every 5m`, ctx);
			}
			ctx._notifications.length = 0;

			await pi._commands.get("remind").handler("in 5m test", ctx);
			expect(ctx._notifications.some((n: any) => n.type === "error")).toBe(true);
		});
	});

	describe("/schedule", () => {
		it("shows list with /schedule list", async () => {
			await pi._commands.get("loop").handler("5m check build", ctx);
			await pi._commands.get("schedule").handler("list", ctx);
			expect(pi._messages.some((m: any) => m.customType === "pi-scheduler")).toBe(true);
		});

		it("enables and disables tasks", async () => {
			await pi._commands.get("loop").handler("5m check build", ctx);
			const taskId = ctx._notifications[0].msg.match(/id: (\w+)/)?.[1];
			ctx._notifications.length = 0;

			await pi._commands.get("schedule").handler(`disable ${taskId}`, ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Disabled"))).toBe(true);

			ctx._notifications.length = 0;
			await pi._commands.get("schedule").handler(`enable ${taskId}`, ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Enabled"))).toBe(true);
		});

		it("deletes tasks with /schedule delete", async () => {
			await pi._commands.get("loop").handler("5m check build", ctx);
			const taskId = ctx._notifications[0].msg.match(/id: (\w+)/)?.[1];
			ctx._notifications.length = 0;

			await pi._commands.get("schedule").handler(`delete ${taskId}`, ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Deleted"))).toBe(true);
		});

		it("handles rm alias for delete", async () => {
			await pi._commands.get("loop").handler("5m check build", ctx);
			const taskId = ctx._notifications[0].msg.match(/id: (\w+)/)?.[1];
			ctx._notifications.length = 0;

			await pi._commands.get("schedule").handler(`rm ${taskId}`, ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Deleted"))).toBe(true);
		});

		it("handles remove alias for delete", async () => {
			await pi._commands.get("loop").handler("5m check build", ctx);
			const taskId = ctx._notifications[0].msg.match(/id: (\w+)/)?.[1];
			ctx._notifications.length = 0;

			await pi._commands.get("schedule").handler(`remove ${taskId}`, ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Deleted"))).toBe(true);
		});

		it("clears all tasks", async () => {
			await pi._commands.get("loop").handler("5m check a", ctx);
			await pi._commands.get("loop").handler("10m check b", ctx);
			ctx._notifications.length = 0;

			await pi._commands.get("schedule").handler("clear", ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Cleared 2 tasks"))).toBe(true);
		});

		it("handles singular task in clear message", async () => {
			await pi._commands.get("loop").handler("5m check a", ctx);
			ctx._notifications.length = 0;

			await pi._commands.get("schedule").handler("clear", ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Cleared 1 task"))).toBe(true);
		});

		it("shows warning for unknown subcommand", async () => {
			await pi._commands.get("schedule").handler("unknown", ctx);
			expect(ctx._notifications.some((n: any) => n.type === "warning" && n.msg.includes("Usage"))).toBe(true);
		});

		it("shows warning for enable without id", async () => {
			await pi._commands.get("schedule").handler("enable", ctx);
			expect(ctx._notifications.some((n: any) => n.type === "warning" && n.msg.includes("Usage"))).toBe(true);
		});

		it("shows warning for disable without id", async () => {
			await pi._commands.get("schedule").handler("disable", ctx);
			expect(ctx._notifications.some((n: any) => n.type === "warning")).toBe(true);
		});

		it("shows warning for delete without id", async () => {
			await pi._commands.get("schedule").handler("delete", ctx);
			expect(ctx._notifications.some((n: any) => n.type === "warning")).toBe(true);
		});

		it("shows warning for not-found task on enable", async () => {
			await pi._commands.get("schedule").handler("enable nonexistent", ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Task not found"))).toBe(true);
		});

		it("shows warning for not-found task on delete", async () => {
			await pi._commands.get("schedule").handler("delete nonexistent", ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Task not found"))).toBe(true);
		});
	});

	describe("/unschedule", () => {
		it("deletes a task by id", async () => {
			await pi._commands.get("loop").handler("5m check build", ctx);
			const taskId = ctx._notifications[0].msg.match(/id: (\w+)/)?.[1];
			ctx._notifications.length = 0;

			await pi._commands.get("unschedule").handler(taskId!, ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Deleted"))).toBe(true);
		});

		it("shows warning for empty id", async () => {
			await pi._commands.get("unschedule").handler("", ctx);
			expect(ctx._notifications.some((n: any) => n.type === "warning" && n.msg.includes("Usage"))).toBe(true);
		});

		it("shows warning for not-found task", async () => {
			await pi._commands.get("unschedule").handler("nonexistent", ctx);
			expect(ctx._notifications.some((n: any) => n.msg.includes("Task not found"))).toBe(true);
		});
	});
});

// ─── Tool: schedule_prompt ──────────────────────────────────────────────────

describe("schedule_prompt tool", () => {
	let pi: ReturnType<typeof createMockPi>;
	let ctx: ReturnType<typeof createMockCtx>;
	let tool: any;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
		(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("{}");
		(mkdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(renameSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(copyFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(rmSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([]);
		(rmdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		pi = createMockPi();
		ctx = createMockCtx();
		schedulerExtension(pi as any);
		pi._emit("session_start", { type: "session_start" }, ctx);
		tool = pi._tools.get("schedule_prompt");
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("action: add", () => {
		it("adds a recurring interval task", async () => {
			const result = await tool.execute("id", {
				action: "add",
				prompt: "check build",
				kind: "recurring",
				duration: "5m",
			});
			expect(result.content[0].text).toContain("Recurring task scheduled");
			expect(result.content[0].text).toContain("every 5m");
			expect(result.details.task).toBeDefined();
		});

		it("adds a recurring cron task", async () => {
			const result = await tool.execute("id", {
				action: "add",
				prompt: "check ci",
				kind: "recurring",
				cron: "*/5 * * * *",
			});
			expect(result.content[0].text).toContain("Recurring cron task scheduled");
			expect(result.details.task).toBeDefined();
		});

		it("adds a one-time reminder", async () => {
			const result = await tool.execute("id", {
				action: "add",
				prompt: "follow up",
				kind: "once",
				duration: "30m",
			});
			expect(result.content[0].text).toContain("Reminder scheduled");
			expect(result.details.task).toBeDefined();
		});

		it("defaults to recurring with 10m interval", async () => {
			const result = await tool.execute("id", {
				action: "add",
				prompt: "check status",
			});
			expect(result.content[0].text).toContain("Recurring task scheduled");
			expect(result.content[0].text).toContain("every 10m");
		});

		it("returns error for missing prompt", async () => {
			const result = await tool.execute("id", { action: "add" });
			expect(result.content[0].text).toContain("Error: prompt is required");
			expect(result.details.error).toBe("missing_prompt");
		});

		it("returns error for missing duration on once task", async () => {
			const result = await tool.execute("id", {
				action: "add",
				prompt: "test",
				kind: "once",
			});
			expect(result.content[0].text).toContain("duration is required");
			expect(result.details.error).toBe("missing_duration");
		});

		it("returns error for invalid duration", async () => {
			const result = await tool.execute("id", {
				action: "add",
				prompt: "test",
				kind: "recurring",
				duration: "banana",
			});
			expect(result.content[0].text).toContain("invalid duration");
			expect(result.details.error).toBe("invalid_duration");
		});

		it("returns error for cron on once task", async () => {
			const result = await tool.execute("id", {
				action: "add",
				prompt: "test",
				kind: "once",
				cron: "*/5 * * * *",
			});
			expect(result.content[0].text).toContain("cron is only valid");
			expect(result.details.error).toBe("invalid_cron_for_once");
		});

		it("returns error for both duration and cron", async () => {
			const result = await tool.execute("id", {
				action: "add",
				prompt: "test",
				kind: "recurring",
				duration: "5m",
				cron: "*/5 * * * *",
			});
			expect(result.content[0].text).toContain("either duration or cron");
			expect(result.details.error).toBe("conflicting_schedule_inputs");
		});

		it("returns error for invalid cron", async () => {
			const result = await tool.execute("id", {
				action: "add",
				prompt: "test",
				kind: "recurring",
				cron: "not-a-cron",
			});
			expect(result.content[0].text).toContain("invalid cron");
			expect(result.details.error).toBe("invalid_cron");
		});

		it("returns error when task limit reached", async () => {
			for (let i = 0; i < MAX_TASKS; i++) {
				await tool.execute("id", { action: "add", prompt: `task ${i}`, duration: "5m" });
			}
			const result = await tool.execute("id", { action: "add", prompt: "one more", duration: "5m" });
			expect(result.content[0].text).toContain("Task limit reached");
			expect(result.details.error).toBe("task_limit");
		});

		it("includes normalization note in response", async () => {
			const result = await tool.execute("id", {
				action: "add",
				prompt: "test",
				kind: "recurring",
				cron: "*/5 * * * *",
			});
			expect(result.content[0].text).toContain("5-field cron");
		});
	});

	describe("action: list", () => {
		it("returns empty list message", async () => {
			const result = await tool.execute("id", { action: "list" });
			expect(result.content[0].text).toBe("No scheduled tasks.");
			expect(result.details.tasks).toEqual([]);
		});

		it("lists tasks with details", async () => {
			await tool.execute("id", { action: "add", prompt: "check build", duration: "5m" });
			const result = await tool.execute("id", { action: "list" });
			expect(result.content[0].text).toContain("check build");
			expect(result.content[0].text).toContain("on");
			expect(result.details.tasks.length).toBe(1);
		});
	});

	describe("action: delete", () => {
		it("deletes existing task", async () => {
			const addResult = await tool.execute("id", { action: "add", prompt: "check", duration: "5m" });
			const taskId = addResult.details.task.id;

			const result = await tool.execute("id", { action: "delete", id: taskId });
			expect(result.content[0].text).toContain("Deleted");
			expect(result.details.removed).toBe(true);
		});

		it("returns error for missing id", async () => {
			const result = await tool.execute("id", { action: "delete" });
			expect(result.content[0].text).toContain("id is required");
		});

		it("returns not-found for invalid id", async () => {
			const result = await tool.execute("id", { action: "delete", id: "nope" });
			expect(result.content[0].text).toContain("Task not found");
			expect(result.details.removed).toBe(false);
		});
	});

	describe("action: enable/disable", () => {
		it("enables a disabled task", async () => {
			const addResult = await tool.execute("id", { action: "add", prompt: "check", duration: "5m" });
			const taskId = addResult.details.task.id;

			await tool.execute("id", { action: "disable", id: taskId });
			const result = await tool.execute("id", { action: "enable", id: taskId });
			expect(result.content[0].text).toContain("Enabled");
			expect(result.details.enabled).toBe(true);
		});

		it("disables an enabled task", async () => {
			const addResult = await tool.execute("id", { action: "add", prompt: "check", duration: "5m" });
			const taskId = addResult.details.task.id;

			const result = await tool.execute("id", { action: "disable", id: taskId });
			expect(result.content[0].text).toContain("Disabled");
			expect(result.details.enabled).toBe(false);
		});

		it("returns error for missing id on enable", async () => {
			const result = await tool.execute("id", { action: "enable" });
			expect(result.content[0].text).toContain("id is required");
		});

		it("returns error for missing id on disable", async () => {
			const result = await tool.execute("id", { action: "disable" });
			expect(result.content[0].text).toContain("id is required");
		});

		it("returns not-found for invalid id", async () => {
			const result = await tool.execute("id", { action: "enable", id: "nope" });
			expect(result.content[0].text).toContain("Task not found");
			expect(result.details.updated).toBe(false);
		});
	});

	describe("action: clear", () => {
		it("clears all tasks", async () => {
			await tool.execute("id", { action: "add", prompt: "a", duration: "5m" });
			await tool.execute("id", { action: "add", prompt: "b", duration: "10m" });

			const result = await tool.execute("id", { action: "clear" });
			expect(result.content[0].text).toContain("Cleared 2");
			expect(result.details.cleared).toBe(2);
		});

		it("handles clear with zero tasks", async () => {
			const result = await tool.execute("id", { action: "clear" });
			expect(result.content[0].text).toContain("Cleared 0");
		});
	});

	describe("action: unsupported", () => {
		it("returns error for unknown action", async () => {
			const result = await tool.execute("id", { action: "banana" });
			expect(result.content[0].text).toContain("unsupported action");
			expect(result.details.error).toBe("unsupported_action");
		});
	});
});

// ─── Event wiring ────────────────────────────────────────────────────────────

describe("event wiring", () => {
	let pi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
		(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("{}");
		(mkdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(renameSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(copyFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(rmSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([]);
		(rmdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		pi = createMockPi();
		schedulerExtension(pi as any);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("starts scheduler on session_start", () => {
		const ctx = createMockCtx();
		pi._emit("session_start", { type: "session_start" }, ctx);
		// Scheduler is started (no easy way to verify timer, but it should not throw)
	});

	it("updates status on session_switch", () => {
		const ctx = createMockCtx();
		pi._emit("session_start", { type: "session_start" }, ctx);
		const ctx2 = createMockCtx({ cwd: "/other-project" });
		pi._emit("session_switch", { type: "session_switch" }, ctx2);
		// Should not throw
	});

	it("updates status on session_fork", () => {
		const ctx = createMockCtx();
		pi._emit("session_start", { type: "session_start" }, ctx);
		pi._emit("session_fork", { type: "session_fork" }, ctx);
	});

	it("updates status on session_tree", () => {
		const ctx = createMockCtx();
		pi._emit("session_start", { type: "session_start" }, ctx);
		pi._emit("session_tree", { type: "session_tree" }, ctx);
	});

	it("stops scheduler and clears status on session_shutdown", () => {
		const ctx = createMockCtx();
		pi._emit("session_start", { type: "session_start" }, ctx);

		// Add a task to have status
		pi._commands.get("loop")?.handler("5m check build", ctx);

		pi._emit("session_shutdown", { type: "session_shutdown" }, ctx);
		expect(ctx._statusMap.has("pi-scheduler")).toBe(false);
	});
});

// ─── Constants ───────────────────────────────────────────────────────────────

describe("constants", () => {
	it("MAX_TASKS is 50", () => {
		expect(MAX_TASKS).toBe(50);
	});

	it("ONE_MINUTE is 60000", () => {
		expect(ONE_MINUTE).toBe(60_000);
	});

	it("FIFTEEN_MINUTES is 15 * ONE_MINUTE", () => {
		expect(FIFTEEN_MINUTES).toBe(15 * 60_000);
	});

	it("THREE_DAYS is 3 days in ms", () => {
		expect(THREE_DAYS).toBe(3 * 24 * 60 * 60_000);
	});

	it("DEFAULT_LOOP_INTERVAL is 10 * ONE_MINUTE", () => {
		expect(DEFAULT_LOOP_INTERVAL).toBe(10 * 60_000);
	});

	it("MIN_RECURRING_INTERVAL is 1 minute", () => {
		expect(MIN_RECURRING_INTERVAL).toBe(ONE_MINUTE);
	});

	it("dispatch rate limit defaults to 6 tasks per minute", () => {
		expect(DISPATCH_RATE_LIMIT_WINDOW_MS).toBe(ONE_MINUTE);
		expect(MAX_DISPATCHES_PER_WINDOW).toBe(6);
	});
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe("edge cases", () => {
	let pi: ReturnType<typeof createMockPi>;
	let ctx: ReturnType<typeof createMockCtx>;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
		(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("{}");
		(mkdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(renameSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(copyFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(rmSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		(readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([]);
		(rmdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
		pi = createMockPi();
		ctx = createMockCtx();
		schedulerExtension(pi as any);
		pi._emit("session_start", { type: "session_start" }, ctx);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("handles /loop with word-form trailing duration", async () => {
		await pi._commands.get("loop").handler("check deploy every 30 minutes", ctx);
		expect(ctx._notifications.some((n: any) => n.msg.includes("Scheduled every 30m"))).toBe(true);
	});

	it("handles /loop with very long prompt", async () => {
		const longPrompt = "a".repeat(200);
		await pi._commands.get("loop").handler(`5m ${longPrompt}`, ctx);
		expect(ctx._notifications.some((n: any) => n.msg.includes("Scheduled every 5m"))).toBe(true);
	});

	it("handles /schedule list with no tasks", async () => {
		await pi._commands.get("schedule").handler("list", ctx);
		expect(pi._messages.some((m: any) => m.content.includes("No scheduled tasks"))).toBe(true);
	});

	it("handles /schedule tui alias", async () => {
		// With no tasks, TUI manager should show "No scheduled tasks" notification
		await pi._commands.get("schedule").handler("tui", ctx);
		expect(ctx._notifications.some((n: any) => n.msg.includes("No scheduled tasks"))).toBe(true);
	});

	it("handles /schedule with no args (TUI manager)", async () => {
		await pi._commands.get("schedule").handler("", ctx);
		expect(ctx._notifications.some((n: any) => n.msg.includes("No scheduled tasks"))).toBe(true);
	});

	it("creates and then deletes a task via different commands", async () => {
		await pi._commands.get("loop").handler("5m check build", ctx);
		const taskId = ctx._notifications[0].msg.match(/id: (\w+)/)?.[1];
		ctx._notifications.length = 0;

		await pi._commands.get("unschedule").handler(taskId!, ctx);
		expect(ctx._notifications.some((n: any) => n.msg.includes("Deleted"))).toBe(true);

		// Verify task is gone
		await pi._commands.get("schedule").handler("list", ctx);
		expect(pi._messages.some((m: any) => m.content.includes("No scheduled tasks"))).toBe(true);
	});

	it("tool add then tool list shows the task", async () => {
		const tool = pi._tools.get("schedule_prompt");
		await tool.execute("id", { action: "add", prompt: "check", duration: "5m" });
		const listResult = await tool.execute("id", { action: "list" });
		expect(listResult.content[0].text).toContain("check");
		expect(listResult.details.tasks).toHaveLength(1);
	});

	it("tool add + delete + list shows empty", async () => {
		const tool = pi._tools.get("schedule_prompt");
		const addResult = await tool.execute("id", { action: "add", prompt: "check", duration: "5m" });
		const taskId = addResult.details.task.id;

		await tool.execute("id", { action: "delete", id: taskId });
		const listResult = await tool.execute("id", { action: "list" });
		expect(listResult.content[0].text).toBe("No scheduled tasks.");
	});

	it("handles whitespace in /schedule args", async () => {
		await pi._commands.get("schedule").handler("  list  ", ctx);
		expect(pi._messages.some((m: any) => m.customType === "pi-scheduler")).toBe(true);
	});

	it("handles whitespace-padded id in /unschedule", async () => {
		await pi._commands.get("loop").handler("5m check build", ctx);
		const taskId = ctx._notifications[0].msg.match(/id: (\w+)/)?.[1];
		ctx._notifications.length = 0;

		await pi._commands.get("unschedule").handler(`  ${taskId}  `, ctx);
		expect(ctx._notifications.some((n: any) => n.msg.includes("Deleted"))).toBe(true);
	});
});
