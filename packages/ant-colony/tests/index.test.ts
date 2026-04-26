import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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
		return { promise, reject, resolve };
	}

	const stableIdFromGoal = (goal: string): string => {
		const slug = goal
			.toLowerCase()
			.replaceAll(/[^a-z0-9]+/g, "-")
			.replaceAll(/(^-|-$)/g, "");
		return `colony-${slug || "goal"}`;
	};

	const runInvocations: any[] = [];
	const resumeInvocations: any[] = [];
	const createUsageLimitsTrackerMock = vi.fn(() => ({
		dispose: vi.fn(),
		requestSnapshot: () => null,
	}));

	const runColonyMock = vi.fn((opts: any) => {
		const inv = { deferred: mkDeferred<any>(), opts, stableId: stableIdFromGoal(opts.goal) };
		runInvocations.push(inv);
		opts.callbacks?.onSignal?.({
			active: 1,
			colonyId: inv.stableId,
			cost: 0.01,
			message: "Mock colony running",
			phase: "working",
			progress: 0.2,
		});
		return inv.deferred.promise;
	});

	const resumeColonyMock = vi.fn((opts: any) => {
		const inv = { deferred: mkDeferred<any>(), opts, stableId: stableIdFromGoal(opts.goal) };
		resumeInvocations.push(inv);
		opts.callbacks?.onSignal?.({
			active: 1,
			colonyId: inv.stableId,
			cost: 0,
			message: "Mock resumed colony running",
			phase: "working",
			progress: 0.3,
		});
		return inv.deferred.promise;
	});

	return {
		createUsageLimitsTrackerMock,
		resumeColonyMock,
		resumeInvocations,
		runColonyMock,
		runInvocations,
	};
});

const runInvocations = queenMocks.runInvocations as ColonyInvocation[];
const resumeInvocations = queenMocks.resumeInvocations as ColonyInvocation[];
const {runColonyMock} = queenMocks;
const {resumeColonyMock} = queenMocks;
const {createUsageLimitsTrackerMock} = queenMocks;

const storageMocks = vi.hoisted(() => ({
	resolveColonyStorageOptionsMock: vi.fn(),
	shouldManageProjectGitignoreMock: vi.fn(),
}));

vi.mock<typeof import('../extensions/ant-colony/queen.js')>(import('../extensions/ant-colony/queen.js'), () => ({
	createUsageLimitsTracker: queenMocks.createUsageLimitsTrackerMock,
	resumeColony: queenMocks.resumeColonyMock,
	runColony: queenMocks.runColonyMock,
}));

vi.mock<typeof import('../extensions/ant-colony/storage.js')>(import('../extensions/ant-colony/storage.js'), async (importActual) => {
	const actual = await importActual<typeof import("../extensions/ant-colony/storage.js")>();
	storageMocks.resolveColonyStorageOptionsMock.mockImplementation((options?: any) =>
		actual.resolveColonyStorageOptions(options),
	);
	storageMocks.shouldManageProjectGitignoreMock.mockImplementation((options?: any) =>
		actual.shouldManageProjectGitignore(options),
	);
	return {
		...actual,
		resolveColonyStorageOptions: storageMocks.resolveColonyStorageOptionsMock,
		shouldManageProjectGitignore: storageMocks.shouldManageProjectGitignoreMock,
	};
});

vi.mock<typeof import('../extensions/ant-colony/worktree.js')>(import('../extensions/ant-colony/worktree.js'), async (importActual) => {
	const actual = await importActual<typeof import("../extensions/ant-colony/worktree.js")>();

	const mkShared = (cwd: string) => ({
		baseBranch: null,
		branch: null,
		executionCwd: cwd,
		mode: "shared" as const,
		note: null,
		originCwd: cwd,
		repoRoot: null,
		worktreeRoot: null,
	});

	return {
		...actual,
		cleanupIsolatedWorktree: () => null,
		prepareColonyWorkspace: ({ cwd }: { cwd: string }) => mkShared(cwd),
		resumeColonyWorkspace: ({ cwd }: { cwd: string }) => mkShared(cwd),
	};
});

vi.mock<typeof import('@sinclair/typebox')>(import('@sinclair/typebox'), () => ({
	Type: {
		Number: (opts?: any) => ({ type: "number", ...opts }),
		Object: (schema: any) => schema,
		Optional: (t: any) => ({ optional: true, ...t }),
		String: (opts?: any) => ({ type: "string", ...opts }),
	},
}));

vi.mock<typeof import('@mariozechner/pi-tui')>(import('@mariozechner/pi-tui'), () => ({
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
		ants: [],
		concurrency: { current: 1, history: [], max: 4, min: 1, optimal: 1 },
		createdAt: now - 10_000,
		finishedAt: now,
		goal,
		id: stableId,
		maxCost: null,
		metrics: {
			antsSpawned: 2,
			startTime: now - 10_000,
			tasksDone: status === "done" ? 4 : 1,
			tasksFailed: status === "failed" ? 1 : 0,
			tasksTotal: 4,
			throughputHistory: [],
			totalCost: status === "done" ? 0.12 : 0.03,
			totalTokens: 1400,
		},
		modelOverrides: {},
		pheromones: [],
		status,
		tasks: [],
	};
}

function createMockPi() {
	const handlers = new Map<string, ((...args: any[]) => void)[]>();
	const eventHandlers = new Map<string, Set<(data?: unknown) => void>>();
	const commands = new Map<string, any>();
	const tools = new Map<string, any>();

	const pi = {
		_commands: commands,
		_emit(event: string, ...args: any[]) {
			for (const handler of handlers.get(event) ?? []) {
				handler(...args);
			}
		},
		_eventHandlers: eventHandlers,
		_handlers: handlers,
		_tools: tools,
		events: {
			emit(event: string, data?: unknown) {
				for (const handler of eventHandlers.get(event) ?? []) {
					handler(data);
				}
			},
			off(event: string, handler: (data?: unknown) => void) {
				eventHandlers.get(event)?.delete(handler);
			},
			on(event: string, handler: (data?: unknown) => void) {
				if (!eventHandlers.has(event)) {
					eventHandlers.set(event, new Set());
				}
				eventHandlers.get(event)?.add(handler);
			},
		},
		on(event: string, handler: (...args: any[]) => void) {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			handlers.get(event)?.push(handler);
		},
		registerCommand(name: string, opts: any) {
			commands.set(name, opts);
		},
		registerMessageRenderer: vi.fn(),
		registerShortcut: vi.fn(),
		registerTool(tool: any) {
			tools.set(tool.name, tool);
		},
		sendMessage: vi.fn(),
	};

	return pi;
}

function createCommandCtx(cwd: string) {
	const notifications: { msg: string; level: string }[] = [];
	const ui = {
		custom: vi.fn().mockResolvedValue(undefined),
		notify(msg: string, level: string) {
			notifications.push({ msg, level });
		},
		setStatus: vi.fn(),
	};
	return {
		_notifications: notifications,
		currentModel: "anthropic/claude-sonnet-4",
		cwd,
		model: { id: "claude-sonnet-4", provider: "anthropic" },
		modelRegistry: undefined,
		ui,
	};
}

async function flushMicrotasks() {
	await Promise.resolve();
	await Promise.resolve();
}

function withSharedStorageEnv(): () => void {
	const previous = process.env.PI_ANT_COLONY_STORAGE_MODE;
	process.env.PI_ANT_COLONY_STORAGE_MODE = "shared";
	return () => {
		if (previous == null) {
			process.env.PI_ANT_COLONY_STORAGE_MODE = undefined;
		} else {
			process.env.PI_ANT_COLONY_STORAGE_MODE = previous;
		}
	};
}

describe("ant-colony extension commands", () => {
	let cwd: string;
	let pi: ReturnType<typeof createMockPi>;
	let ctx: ReturnType<typeof createCommandCtx>;
	let restoreStorageEnv: (() => void) | undefined;

	beforeEach(() => {
		restoreStorageEnv = withSharedStorageEnv();
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
		restoreStorageEnv?.();
		for (const inv of runInvocations) {
			inv.deferred.resolve(mkState("failed", inv.opts.goal, inv.stableId));
		}
		for (const inv of resumeInvocations) {
			inv.deferred.resolve(mkState("failed", inv.opts.goal, inv.stableId));
		}
		try {
			fs.rmSync(cwd, { force: true, recursive: true });
		} catch {
			/* Ignore */
		}
	});

	it("registers a non-conflicting shortcut for the colony details panel", () => {
		expect(pi.registerShortcut).toHaveBeenCalledWith(
			"ctrl+shift+c",
			expect.objectContaining({ description: "Show ant colony details" }),
		);
		expect(pi.registerShortcut).not.toHaveBeenCalledWith("ctrl+shift+a", expect.anything());
	});

	it("does not modify .gitignore when shared storage is active", async () => {
		const colonyCmd = pi._commands.get("colony");
		await colonyCmd.handler("Keep repo clean", ctx);

		expect(fs.readFileSync(path.join(cwd, ".gitignore"), "utf8")).toBe("");
	});

	it("/colony-stop all aborts all running colonies", async () => {
		const colonyCmd = pi._commands.get("colony");
		await colonyCmd.handler("First swarm goal", ctx);
		await colonyCmd.handler("Second swarm goal", ctx);

		expect(runInvocations).toHaveLength(2);
		expect(runInvocations[0].opts.signal.aborted).toBeFalsy();
		expect(runInvocations[1].opts.signal.aborted).toBeFalsy();

		const stopCmd = pi._commands.get("colony-stop");
		await stopCmd.handler("all", ctx);

		expect(runInvocations[0].opts.signal.aborted).toBeTruthy();
		expect(runInvocations[1].opts.signal.aborted).toBeTruthy();
		expect(ctx._notifications.at(-1)?.msg).toContain("Abort signal sent to 2 colonies");
	});

	it("/colony-status accepts stable colony IDs", async () => {
		const colonyCmd = pi._commands.get("colony");
		await colonyCmd.handler("Status goal", ctx);

		const {stableId} = runInvocations[0];
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

		expect(reportCalls.some((content: string) => content.includes("[COLONY_SIGNAL:COMPLETE]"))).toBeTruthy();
		expect(reportCalls.some((content: string) => content.includes("[COLONY_SIGNAL:FAILED]"))).toBeTruthy();
	});

	it("/colony-resume without args resumes all resumable colonies", async () => {
		vi.spyOn(Nest, "findAllResumable").mockReturnValue([
			{ colonyId: "colony-resume-a", state: mkState("working", "Resume goal A", "colony-resume-a") },
			{ colonyId: "colony-resume-b", state: mkState("scouting", "Resume goal B", "colony-resume-b") },
		]);

		const resumeCmd = pi._commands.get("colony-resume");
		await resumeCmd.handler("", ctx);

		expect(resumeColonyMock).toHaveBeenCalledTimes(2);
		expect(ctx._notifications.filter((n) => n.msg.includes("Resuming:"))).toHaveLength(2);
	});

	it("bg_colony_status requires explicit requests and rate limits manual snapshots", async () => {
		const colonyCmd = pi._commands.get("colony");
		await colonyCmd.handler("Manual status goal", ctx);

		const statusTool = pi._tools.get("bg_colony_status");
		const passive = await statusTool.execute("tool-1", {}, undefined, undefined, {
			sessionManager: {
				getBranch: () => [{ message: { content: "keep working", role: "user" }, type: "message" }],
			},
		});
		expect(passive.isError).toBeTruthy();
		expect(passive.content[0]?.text).toContain("Passive mode is active");

		const explicitCtx = {
			sessionManager: {
				getBranch: () => [{ message: { content: "show colony status now", role: "user" }, type: "message" }],
			},
		};
		const snapshot = await statusTool.execute("tool-2", {}, undefined, undefined, explicitCtx);
		expect(snapshot.isError).toBe(false);
		expect(snapshot.content[0]?.text).toContain("Manual status goal");
		expect(snapshot.content[0]?.text).toContain("Workspace:");

		const rateLimited = await statusTool.execute("tool-3", {}, undefined, undefined, explicitCtx);
		expect(rateLimited.isError).toBeTruthy();
		expect(rateLimited.content[0]?.text).toContain("Manual status snapshot is rate-limited");
	});

	it("ant_colony tool launches background colonies, renders summaries, and rejects missing models", async () => {
		const antColonyTool = pi._tools.get("ant_colony");
		const launched = await antColonyTool.execute(
			"tool-1",
			{ goal: "Tool-driven colony", maxAnts: 3, maxCost: 1 },
			undefined,
			undefined,
			{
				cwd,
				hasUI: true,
				model: { id: "claude-sonnet-4", provider: "anthropic" },
				modelRegistry: undefined,
				sessionManager: { getSessionFile: () => null },
			},
		);
		expect(launched.content[0]?.text).toContain("[COLONY_SIGNAL:LAUNCHED]");
		expect(launched.content[0]?.text).toContain("Tool-driven colony");

		const theme = {
			bold: (text: string) => text,
			fg: (_color: string, text: string) => text,
		};
		const renderedCall = antColonyTool.renderCall({ goal: "Tool-driven colony", maxAnts: 3, maxCost: 1 }, theme);
		expect(renderedCall.text).toContain("ant_colony");
		expect(renderedCall.text).toContain("×3");
		expect(renderedCall.text).toContain("$1");

		const renderedResult = antColonyTool.renderResult(launched, {}, theme);
		expect(renderedResult.children).toHaveLength(3);
		expect(renderedResult.children[0]?.text).toContain("Colony launched in background");

		const missingModel = await antColonyTool.execute("tool-2", { goal: "No model" }, undefined, undefined, {
			cwd,
			hasUI: false,
			model: undefined,
		});
		expect(missingModel.isError).toBeTruthy();
		expect(missingModel.content[0]?.text).toContain("no model available");
	});

	it("registers progress and report message renderers", () => {
		const progressRenderer = pi.registerMessageRenderer.mock.calls.find(
			(call) => call[0] === "ant-colony-progress",
		)?.[1];
		const reportRenderer = pi.registerMessageRenderer.mock.calls.find((call) => call[0] === "ant-colony-report")?.[1];
		const theme = {
			bold: (text: string) => text,
			fg: (_color: string, text: string) => text,
		};

		const progress = progressRenderer?.({ content: "[COLONY_SIGNAL:FAILED] colony failed loudly" }, theme);
		expect(progress?.text).toContain("failed");
		expect(progress?.text).toContain("colony failed loudly");

		const report = reportRenderer?.(
			{ content: "done\n**Duration:** 4s\n- ✅ Completed task\n- input: 20\n- output: 10" },
			theme,
		);
		expect(report.children.length).toBeGreaterThan(0);
		expect(report.children[0]?.text).toContain("Ant Colony Report");
	});
});

describe("index-level telemetry propagation", () => {
	let restoreStorageEnv: (() => void) | undefined;

	beforeEach(() => {
		storageMocks.resolveColonyStorageOptionsMock.mockClear();
		storageMocks.shouldManageProjectGitignoreMock.mockClear();
		restoreStorageEnv = withSharedStorageEnv();
	});

	afterEach(() => {
		restoreStorageEnv?.();
	});

	it("does not resolve colony storage options during extension registration", () => {
		const pi = createMockPi();
		antColonyExtension(pi as any);

		expect(storageMocks.resolveColonyStorageOptionsMock).not.toHaveBeenCalled();
	});

	it("passes eventBus into ant_colony runtime tool execution", async () => {
		runInvocations.length = 0;
		const pi = createMockPi();
		antColonyExtension(pi as any);

		const antColonyTool = pi._tools.get("ant_colony");
		expect(antColonyTool?.execute).toBeTypeOf("function");

		const ctx = {
			cwd: process.cwd(),
			hasUI: false,
			model: { id: "model", provider: "test" },
			modelRegistry: {},
		};

		const executePromise = antColonyTool.execute("id", { goal: "test telemetry" }, undefined, undefined, ctx);

		expect(storageMocks.resolveColonyStorageOptionsMock).toHaveBeenCalledOnce();
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
				custom: vi.fn().mockResolvedValue(undefined),
				notify: vi.fn(),
				setStatus: vi.fn(),
			},
		};

		pi._emit("session_start", {}, ctx);

		expect(pi._eventHandlers.has("ant-colony:render")).toBeTruthy();
		expect(pi._eventHandlers.has("ant-colony:clear-ui")).toBeTruthy();
		expect(pi._eventHandlers.has("ant-colony:notify")).toBeTruthy();
	});

	it("coalesces identical ant-colony status refreshes", async () => {
		const pi = createMockPi();
		antColonyExtension(pi as any);
		const ctx = {
			cwd: process.cwd(),
			model: { id: "model", provider: "test" },
			modelRegistry: {},
			ui: {
				custom: vi.fn().mockResolvedValue(undefined),
				notify: vi.fn(),
				setStatus: vi.fn(),
			},
		};

		pi._emit("session_start", {}, ctx);
		const colonyCommand = pi._commands.get("colony");
		await colonyCommand.handler("status churn", ctx);
		ctx.ui.setStatus.mockClear();

		pi.events.emit("ant-colony:render");
		pi.events.emit("ant-colony:render");

		expect(ctx.ui.setStatus).toHaveBeenCalledOnce();
	});
});
