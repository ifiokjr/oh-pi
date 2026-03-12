import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Nest } from "../extensions/ant-colony/nest.js";
import type { ColonyState } from "../extensions/ant-colony/types.js";

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
}

interface ColonyInvocation {
	opts: any;
	deferred: Deferred<ColonyState>;
	stableId: string;
}

const queenMocks = vi.hoisted(() => {
	interface HoistedDeferred<T> {
		promise: Promise<T>;
		resolve: (value: T) => void;
		reject: (reason?: unknown) => void;
	}

	function mkDeferred<T>(): HoistedDeferred<T> {
		let resolve!: (value: T) => void;
		let reject!: (reason?: unknown) => void;
		const promise = new Promise<T>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		return { promise, resolve, reject };
	}

	const stableIdFromGoal = (goal: string): string => {
		const slug = goal
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "");
		return `colony-${slug || "goal"}`;
	};

	const runInvocations: any[] = [];
	const resumeInvocations: any[] = [];
	const createUsageLimitsTrackerMock = vi.fn(() => ({
		requestSnapshot: () => null,
		dispose: vi.fn(),
	}));

	const runColonyMock = vi.fn((opts: any) => {
		const inv = { opts, deferred: mkDeferred<any>(), stableId: stableIdFromGoal(opts.goal) };
		runInvocations.push(inv);
		opts.callbacks?.onSignal?.({
			phase: "working",
			progress: 0.2,
			active: 1,
			cost: 0.01,
			message: "Mock colony running",
			colonyId: inv.stableId,
		});
		return inv.deferred.promise;
	});

	const resumeColonyMock = vi.fn((opts: any) => {
		const inv = { opts, deferred: mkDeferred<any>(), stableId: stableIdFromGoal(opts.goal) };
		resumeInvocations.push(inv);
		opts.callbacks?.onSignal?.({
			phase: "working",
			progress: 0.3,
			active: 1,
			cost: 0,
			message: "Mock resumed colony running",
			colonyId: inv.stableId,
		});
		return inv.deferred.promise;
	});

	return {
		runInvocations,
		resumeInvocations,
		runColonyMock,
		resumeColonyMock,
		createUsageLimitsTrackerMock,
	};
});

const runInvocations = queenMocks.runInvocations as ColonyInvocation[];
const resumeInvocations = queenMocks.resumeInvocations as ColonyInvocation[];
const runColonyMock = queenMocks.runColonyMock;
const resumeColonyMock = queenMocks.resumeColonyMock;
const createUsageLimitsTrackerMock = queenMocks.createUsageLimitsTrackerMock;

vi.mock("../extensions/ant-colony/queen.js", () => ({
	runColony: queenMocks.runColonyMock,
	resumeColony: queenMocks.resumeColonyMock,
	createUsageLimitsTracker: queenMocks.createUsageLimitsTrackerMock,
}));

vi.mock("../extensions/ant-colony/worktree.js", async (importActual) => {
	const actual = await importActual<typeof import("../extensions/ant-colony/worktree.js")>();

	const mkShared = (cwd: string) => ({
		mode: "shared" as const,
		originCwd: cwd,
		executionCwd: cwd,
		repoRoot: null,
		worktreeRoot: null,
		branch: null,
		baseBranch: null,
		note: null,
	});

	return {
		...actual,
		prepareColonyWorkspace: ({ cwd }: { cwd: string }) => mkShared(cwd),
		resumeColonyWorkspace: ({ cwd }: { cwd: string }) => mkShared(cwd),
		cleanupIsolatedWorktree: () => null,
	};
});

vi.mock("@sinclair/typebox", () => ({
	Type: {
		Object: (schema: any) => schema,
		String: (opts?: any) => ({ type: "string", ...opts }),
		Number: (opts?: any) => ({ type: "number", ...opts }),
		Optional: (t: any) => ({ optional: true, ...t }),
	},
}));

vi.mock("@mariozechner/pi-tui", () => ({
	Container: class {
		children: unknown[] = [];
		addChild(child: unknown) {
			this.children.push(child);
		}
	},
	Text: class {
		constructor(
			public text: string,
			public x = 0,
			public y = 0,
		) {}
	},
	matchesKey: (data: string, key: string) => {
		if (key !== "escape") {
			return false;
		}
		return data === "escape" || data === "\u001B";
	},
}));

import antColonyExtension from "../extensions/ant-colony/index.js";

function mkState(status: ColonyState["status"], goal: string, stableId: string): ColonyState {
	const now = Date.now();
	return {
		id: stableId,
		goal,
		status,
		tasks: [],
		ants: [],
		pheromones: [],
		concurrency: { current: 1, min: 1, max: 4, optimal: 1, history: [] },
		metrics: {
			tasksTotal: 4,
			tasksDone: status === "done" ? 4 : 1,
			tasksFailed: status === "failed" ? 1 : 0,
			antsSpawned: 2,
			totalCost: status === "done" ? 0.12 : 0.03,
			totalTokens: 1400,
			startTime: now - 10_000,
			throughputHistory: [],
		},
		maxCost: null,
		modelOverrides: {},
		createdAt: now - 10_000,
		finishedAt: now,
	};
}

function createMockPi() {
	const handlers = new Map<string, ((...args: any[]) => void)[]>();
	const eventHandlers = new Map<string, Set<(data?: unknown) => void>>();
	const commands = new Map<string, any>();
	const tools = new Map<string, any>();

	const pi = {
		on(event: string, handler: (...args: any[]) => void) {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			handlers.get(event)?.push(handler);
		},
		registerTool(tool: any) {
			tools.set(tool.name, tool);
		},
		registerCommand(name: string, opts: any) {
			commands.set(name, opts);
		},
		registerShortcut: vi.fn(),
		registerMessageRenderer: vi.fn(),
		sendMessage: vi.fn(),
		events: {
			on(event: string, handler: (data?: unknown) => void) {
				if (!eventHandlers.has(event)) {
					eventHandlers.set(event, new Set());
				}
				eventHandlers.get(event)?.add(handler);
			},
			off(event: string, handler: (data?: unknown) => void) {
				eventHandlers.get(event)?.delete(handler);
			},
			emit(event: string, data?: unknown) {
				for (const handler of eventHandlers.get(event) ?? []) {
					handler(data);
				}
			},
		},
		_handlers: handlers,
		_eventHandlers: eventHandlers,
		_commands: commands,
		_tools: tools,
		_emit(event: string, ...args: any[]) {
			for (const handler of handlers.get(event) ?? []) {
				handler(...args);
			}
		},
	};

	return pi;
}

function createCommandCtx(cwd: string) {
	const notifications: Array<{ msg: string; level: string }> = [];
	const ui = {
		notify(msg: string, level: string) {
			notifications.push({ msg, level });
		},
		setStatus: vi.fn(),
		custom: vi.fn().mockResolvedValue(undefined),
	};
	return {
		cwd,
		model: { provider: "anthropic", id: "claude-sonnet-4" },
		currentModel: "anthropic/claude-sonnet-4",
		modelRegistry: undefined,
		ui,
		_notifications: notifications,
	};
}

async function flushMicrotasks() {
	await Promise.resolve();
	await Promise.resolve();
}

describe("ant-colony extension commands", () => {
	let cwd: string;
	let pi: ReturnType<typeof createMockPi>;
	let ctx: ReturnType<typeof createCommandCtx>;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "colony-index-test-"));
		fs.writeFileSync(path.join(cwd, ".gitignore"), "");
		runInvocations.length = 0;
		resumeInvocations.length = 0;
		runColonyMock.mockClear();
		resumeColonyMock.mockClear();
		createUsageLimitsTrackerMock.mockClear();

		pi = createMockPi();
		antColonyExtension(pi as any);
		ctx = createCommandCtx(cwd);
	});

	afterEach(() => {
		for (const inv of runInvocations) {
			inv.deferred.resolve(mkState("failed", inv.opts.goal, inv.stableId));
		}
		for (const inv of resumeInvocations) {
			inv.deferred.resolve(mkState("failed", inv.opts.goal, inv.stableId));
		}
		try {
			fs.rmSync(cwd, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	});

	it("/colony-stop all aborts all running colonies", async () => {
		const colonyCmd = pi._commands.get("colony");
		await colonyCmd.handler("First swarm goal", ctx);
		await colonyCmd.handler("Second swarm goal", ctx);

		expect(runInvocations).toHaveLength(2);
		expect(runInvocations[0].opts.signal.aborted).toBe(false);
		expect(runInvocations[1].opts.signal.aborted).toBe(false);

		const stopCmd = pi._commands.get("colony-stop");
		await stopCmd.handler("all", ctx);

		expect(runInvocations[0].opts.signal.aborted).toBe(true);
		expect(runInvocations[1].opts.signal.aborted).toBe(true);
		expect(ctx._notifications.at(-1)?.msg).toContain("Abort signal sent to 2 colonies");
	});

	it("/colony-status accepts stable colony IDs", async () => {
		const colonyCmd = pi._commands.get("colony");
		await colonyCmd.handler("Status goal", ctx);

		const stableId = runInvocations[0].stableId;
		const statusCmd = pi._commands.get("colony-status");
		await statusCmd.handler(stableId, ctx);

		const msg = ctx._notifications.at(-1)?.msg ?? "";
		expect(msg).toContain(`stable: ${stableId}`);
		expect(msg).toContain("Status goal");
	});

	it("emits COMPLETE for success and FAILED for failure reports", async () => {
		const colonyCmd = pi._commands.get("colony");
		await colonyCmd.handler("Success mission", ctx);
		await colonyCmd.handler("Failure mission", ctx);

		runInvocations[0].deferred.resolve(mkState("done", "Success mission", runInvocations[0].stableId));
		runInvocations[1].deferred.resolve(mkState("failed", "Failure mission", runInvocations[1].stableId));
		await flushMicrotasks();

		const reportCalls = pi.sendMessage.mock.calls
			.map((call: [any]) => call[0])
			.filter((msg: any) => msg?.customType === "ant-colony-report")
			.map((msg: any) => String(msg.content));

		expect(reportCalls.some((content: string) => content.includes("[COLONY_SIGNAL:COMPLETE]"))).toBe(true);
		expect(reportCalls.some((content: string) => content.includes("[COLONY_SIGNAL:FAILED]"))).toBe(true);
	});

	it("/colony-resume without args resumes all resumable colonies", async () => {
		vi.spyOn(Nest, "findAllResumable").mockReturnValue([
			{ colonyId: "colony-resume-a", state: mkState("working", "Resume goal A", "colony-resume-a") },
			{ colonyId: "colony-resume-b", state: mkState("scouting", "Resume goal B", "colony-resume-b") },
		]);

		const resumeCmd = pi._commands.get("colony-resume");
		await resumeCmd.handler("", ctx);

		expect(resumeColonyMock).toHaveBeenCalledTimes(2);
		expect(ctx._notifications.filter((n) => n.msg.includes("Resuming:")).length).toBe(2);
	});
});

describe("index-level telemetry propagation", () => {
	it("passes eventBus into ant_colony runtime tool execution", async () => {
		runInvocations.length = 0;
		const pi = createMockPi();
		antColonyExtension(pi as any);

		const antColonyTool = pi._tools.get("ant_colony");
		expect(antColonyTool?.execute).toBeTypeOf("function");

		const ctx = {
			hasUI: false,
			cwd: process.cwd(),
			model: { provider: "test", id: "model" },
			modelRegistry: {},
		};

		const executePromise = antColonyTool.execute("id", { goal: "test telemetry" }, undefined, undefined, ctx);

		expect(runInvocations).toHaveLength(1);
		expect(runInvocations[0].opts.eventBus).toBe(pi.events);

		runInvocations[0].deferred.resolve(mkState("done", "test telemetry", runInvocations[0].stableId));
		await executePromise;
	});

	it("wires event-bus handlers for runtime callback propagation on session_start", () => {
		const pi = createMockPi();
		antColonyExtension(pi as any);
		const ctx = {
			ui: {
				setStatus: vi.fn(),
				notify: vi.fn(),
				custom: vi.fn().mockResolvedValue(undefined),
			},
		};

		pi._emit("session_start", {}, ctx);

		expect(pi._eventHandlers.has("ant-colony:render")).toBe(true);
		expect(pi._eventHandlers.has("ant-colony:clear-ui")).toBe(true);
		expect(pi._eventHandlers.has("ant-colony:notify")).toBe(true);
	});
});
