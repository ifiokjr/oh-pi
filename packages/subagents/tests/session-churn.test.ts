import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockRenderWidget,
	mockReadStatus,
	mockWatcherClose,
	mockCoalescerClear,
	mockCoalescerSchedule,
	mockCleanupAllArtifactDirs,
	mockCleanupOldArtifacts,
	mockCleanupOldChainDirs,
	mockLoadSubagentConfig,
} = vi.hoisted(() => ({
	mockRenderWidget: vi.fn(),
	mockReadStatus: vi.fn(() => null),
	mockWatcherClose: vi.fn(),
	mockCoalescerClear: vi.fn(),
	mockCoalescerSchedule: vi.fn(),
	mockCleanupAllArtifactDirs: vi.fn(),
	mockCleanupOldArtifacts: vi.fn(),
	mockCleanupOldChainDirs: vi.fn(),
	mockLoadSubagentConfig: vi.fn(() => ({})),
}));

vi.mock("node:fs", () => ({
	constants: { R_OK: 4, W_OK: 2 },
	existsSync: vi.fn(() => false),
	readFileSync: vi.fn(() => "{}"),
	mkdirSync: vi.fn(),
	accessSync: vi.fn(),
	rmSync: vi.fn(),
	watch: vi.fn(() => ({
		on: vi.fn(),
		unref: vi.fn(),
		close: mockWatcherClose,
	})),
	readdirSync: vi.fn(() => []),
	unlinkSync: vi.fn(),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	getAgentDir: () => "/tmp/pi-agent",
	VERSION: "test",
}));
vi.mock("@mariozechner/pi-tui", () => ({
	Text: class {},
}));

vi.mock("../agents.js", () => ({
	discoverAgents: () => ({ agents: [] }),
	discoverAgentsAll: () => ({ agents: [] }),
}));
vi.mock("../agent-scope.js", () => ({
	resolveExecutionAgentScope: () => "both",
}));
vi.mock("../settings.js", () => ({
	cleanupOldChainDirs: mockCleanupOldChainDirs,
	getStepAgents: vi.fn(() => []),
	isParallelStep: vi.fn(() => false),
	resolveStepBehavior: vi.fn(() => ({})),
}));
vi.mock("../chain-clarify.js", () => ({
	ChainClarifyComponent: class {},
}));
vi.mock("../artifacts.js", () => ({
	cleanupAllArtifactDirs: mockCleanupAllArtifactDirs,
	cleanupOldArtifacts: mockCleanupOldArtifacts,
	getArtifactsDir: vi.fn(() => "/tmp/artifacts"),
}));
vi.mock("../types.js", () => ({
	ASYNC_DIR: "/tmp/pi-async-subagent-runs",
	RESULTS_DIR: "/tmp/pi-async-subagent-results",
	DEFAULT_ARTIFACT_CONFIG: { cleanupDays: 7 },
	DEFAULT_MAX_OUTPUT: { bytes: 200 * 1024, lines: 5000 },
	MAX_CONCURRENCY: 4,
	MAX_PARALLEL: 8,
	POLL_INTERVAL_MS: 250,
	WIDGET_KEY: "subagent-async",
	checkSubagentDepth: () => ({ blocked: false, depth: 0, maxDepth: 2 }),
}));
vi.mock("../utils.js", () => ({
	readStatus: mockReadStatus,
	findByPrefix: vi.fn(),
	getFinalOutput: vi.fn(() => ""),
	mapConcurrent: async <T, R>(items: T[], fn: (item: T) => Promise<R>) => Promise.all(items.map((item) => fn(item))),
}));
vi.mock("../completion-dedupe.js", () => ({
	buildCompletionKey: vi.fn(() => "key"),
	markSeenWithTtl: vi.fn(() => false),
}));
vi.mock("../file-coalescer.js", () => ({
	createFileCoalescer: vi.fn(() => ({
		schedule: mockCoalescerSchedule,
		clear: mockCoalescerClear,
	})),
}));
vi.mock("../execution.js", () => ({
	runSync: vi.fn(),
}));
vi.mock("../render.js", () => ({
	renderWidget: mockRenderWidget,
	renderSubagentResult: vi.fn(),
}));
vi.mock("../schemas.js", () => ({
	SubagentParams: {},
	StatusParams: {},
}));
vi.mock("../chain-execution.js", () => ({
	executeChain: vi.fn(),
}));
vi.mock("../async-execution.js", () => ({
	isAsyncAvailable: vi.fn(() => true),
	executeAsyncChain: vi.fn(),
	executeAsyncSingle: vi.fn(),
}));
vi.mock("../skills.js", () => ({
	discoverAvailableSkills: vi.fn(() => []),
	normalizeSkillInput: vi.fn((value) => value),
}));
vi.mock("../single-output.js", () => ({
	finalizeSingleOutput: vi.fn(),
	injectSingleOutputInstruction: vi.fn((value) => value),
	resolveSingleOutputPath: vi.fn(),
}));
vi.mock("../agent-manager.js", () => ({
	AgentManagerComponent: class {},
}));
vi.mock("../run-history.js", () => ({
	recordRun: vi.fn(),
}));
vi.mock("../agent-management.js", () => ({
	handleManagementAction: vi.fn(),
}));
vi.mock("../bootstrap.js", () => ({
	ensureAccessibleDir: vi.fn(),
	expandTildePath: vi.fn((value: string) => value),
	getSubagentSessionRoot: vi.fn(() => "/tmp/subagent-session-root"),
	loadSubagentConfig: mockLoadSubagentConfig,
}));

import registerSubagentExtension from "../index.js";

function createMockPi() {
	const handlers = new Map<string, ((...args: any[]) => any)[]>();
	const eventHandlers = new Map<string, ((data: unknown) => void)[]>();
	const tools = new Map<string, any>();

	return {
		on(event: string, handler: (...args: any[]) => any) {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			handlers.get(event)?.push(handler);
		},
		registerTool: vi.fn((tool: any) => {
			tools.set(tool.name, tool);
		}),
		registerCommand: vi.fn(),
		registerShortcut: vi.fn(),
		sendUserMessage: vi.fn(),
		events: {
			on(event: string, handler: (data: unknown) => void) {
				if (!eventHandlers.has(event)) {
					eventHandlers.set(event, []);
				}
				eventHandlers.get(event)?.push(handler);
			},
			emit(event: string, data: unknown) {
				for (const handler of eventHandlers.get(event) ?? []) {
					handler(data);
				}
			},
		},
		async _emit(event: string, ...args: any[]) {
			for (const handler of handlers.get(event) ?? []) {
				await handler(...args);
			}
		},
		_emitEvent(event: string, data: unknown) {
			for (const handler of eventHandlers.get(event) ?? []) {
				handler(data);
			}
		},
		_tools: tools,
	};
}

function createCtx() {
	return {
		cwd: "/tmp/project",
		hasUI: true,
		sessionManager: {
			getSessionFile: () => "/tmp/session.jsonl",
		},
		ui: {
			theme: {
				fg: (_color: string, text: string) => text,
				bold: (text: string) => text,
			},
			setWidget: vi.fn(),
		},
	};
}

beforeEach(() => {
	vi.useFakeTimers();
	mockRenderWidget.mockReset();
	mockReadStatus.mockReset();
	mockReadStatus.mockReturnValue(null);
	mockWatcherClose.mockReset();
	mockCoalescerClear.mockReset();
	mockCoalescerSchedule.mockReset();
	mockCleanupAllArtifactDirs.mockReset();
	mockCleanupOldArtifacts.mockReset();
	mockCleanupOldChainDirs.mockReset();
	mockLoadSubagentConfig.mockReset();
	mockLoadSubagentConfig.mockReturnValue({});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("subagent session churn", () => {
	it("does not load subagent config during extension registration", () => {
		const pi = createMockPi();

		registerSubagentExtension(pi as any);

		expect(mockLoadSubagentConfig).not.toHaveBeenCalled();
	});

	it("loads subagent config lazily on tool execution", async () => {
		const pi = createMockPi();
		const ctx = createCtx();
		mockLoadSubagentConfig.mockReturnValue({
			asyncByDefault: true,
			defaultSessionDir: "/tmp/custom-session-root",
		});

		registerSubagentExtension(pi as any);
		const tool = pi._tools.get("subagent");
		expect(tool).toBeDefined();

		await tool.execute("tool-1", { action: "list" }, undefined, undefined, ctx);
		await tool.execute("tool-2", { action: "list" }, undefined, undefined, ctx);

		expect(mockLoadSubagentConfig).toHaveBeenCalledTimes(1);
	});

	it("does not run global cleanup during extension registration", () => {
		const pi = createMockPi();

		registerSubagentExtension(pi as any);

		expect(mockCleanupOldChainDirs).not.toHaveBeenCalled();
		expect(mockCleanupAllArtifactDirs).not.toHaveBeenCalled();
	});

	it("defers startup cleanup until after the startup window", async () => {
		const pi = createMockPi();
		const ctx = createCtx();

		registerSubagentExtension(pi as any);
		await pi._emit("session_start", {}, ctx);
		expect(mockCleanupOldChainDirs).not.toHaveBeenCalled();
		expect(mockCleanupAllArtifactDirs).not.toHaveBeenCalled();
		expect(mockCleanupOldArtifacts).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(250);
		expect(mockCleanupOldChainDirs).toHaveBeenCalledTimes(1);
		expect(mockCleanupAllArtifactDirs).toHaveBeenCalledWith(7);
		expect(mockCleanupOldArtifacts).toHaveBeenCalledWith("/tmp/artifacts", 7);
	});

	it("cancels deferred startup cleanup on session_shutdown", async () => {
		const pi = createMockPi();
		const ctx = createCtx();

		registerSubagentExtension(pi as any);
		await pi._emit("session_start", {}, ctx);
		await pi._emit("session_shutdown");
		await vi.advanceTimersByTimeAsync(250);

		expect(mockCleanupOldChainDirs).not.toHaveBeenCalled();
		expect(mockCleanupAllArtifactDirs).not.toHaveBeenCalled();
		expect(mockCleanupOldArtifacts).not.toHaveBeenCalled();
	});

	it("keeps a single poller while many async jobs are added in one session", async () => {
		const pi = createMockPi();
		const ctx = createCtx();
		const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
		const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

		registerSubagentExtension(pi as any);
		await pi._emit("session_start", {}, ctx);

		for (let i = 0; i < 25; i++) {
			pi._emitEvent("subagent:started", {
				id: `job-${i}`,
				asyncDir: `/tmp/job-${i}`,
				agent: "scout",
			});
		}

		expect(setIntervalSpy).toHaveBeenCalledTimes(1);

		await pi._emit("session_shutdown");
		expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
		expect(mockWatcherClose).toHaveBeenCalledTimes(1);
	});

	it("clears cleanup timers and pollers across repeated session resets", async () => {
		const pi = createMockPi();
		const ctx = createCtx();
		const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
		const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
		const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

		registerSubagentExtension(pi as any);

		for (let cycle = 0; cycle < 10; cycle++) {
			await pi._emit("session_start", {}, ctx);
			for (let i = 0; i < 3; i++) {
				const id = `cycle-${cycle}-job-${i}`;
				pi._emitEvent("subagent:started", {
					id,
					asyncDir: `/tmp/${id}`,
					agent: "scout",
				});
				pi._emitEvent("subagent:complete", {
					id,
					success: true,
					asyncDir: `/tmp/${id}`,
				});
			}
			await pi._emit("session_switch", {}, ctx);
			await vi.advanceTimersByTimeAsync(250);
		}

		expect(setIntervalSpy).toHaveBeenCalledTimes(10);
		expect(clearIntervalSpy).toHaveBeenCalledTimes(10);
		expect(setTimeoutSpy).toHaveBeenCalledTimes(40);
		expect(clearTimeoutSpy).toHaveBeenCalledTimes(40);
		expect(mockCoalescerClear).toHaveBeenCalledTimes(20);
	});
});
