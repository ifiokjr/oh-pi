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
	mockCleanupAllArtifactDirs: vi.fn(),
	mockCleanupOldArtifacts: vi.fn(),
	mockCleanupOldChainDirs: vi.fn(),
	mockCoalescerClear: vi.fn(),
	mockCoalescerSchedule: vi.fn(),
	mockLoadSubagentConfig: vi.fn(() => ({})),
	mockReadStatus: vi.fn(() => null),
	mockRenderWidget: vi.fn(),
	mockWatcherClose: vi.fn(),
}));

vi.mock<typeof import("node:fs")>(import("node:fs"), () => ({
	accessSync: vi.fn(),
	constants: { R_OK: 4, W_OK: 2 },
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(() => "{}"),
	readdirSync: vi.fn(() => []),
	rmSync: vi.fn(),
	unlinkSync: vi.fn(),
	watch: vi.fn(() => ({
		on: vi.fn(),
		unref: vi.fn(),
		close: mockWatcherClose,
	})),
}));

vi.mock<typeof import("@mariozechner/pi-coding-agent")>(import("@mariozechner/pi-coding-agent"), () => ({
	VERSION: "test",
	getAgentDir: () => "/tmp/pi-agent",
}));
vi.mock<typeof import("@mariozechner/pi-tui")>(import("@mariozechner/pi-tui"), () => ({
	Text: class {},
}));

vi.mock<typeof import("../agents.js")>(import("../agents.js"), () => ({
	discoverAgents: () => ({ agents: [] }),
	discoverAgentsAll: () => ({ agents: [] }),
}));
vi.mock<typeof import("../agent-scope.js")>(import("../agent-scope.js"), () => ({
	resolveExecutionAgentScope: () => "both",
}));
vi.mock<typeof import("../settings.js")>(import("../settings.js"), () => ({
	cleanupOldChainDirs: mockCleanupOldChainDirs,
	getStepAgents: vi.fn(() => []),
	isParallelStep: vi.fn(() => false),
	resolveStepBehavior: vi.fn(() => ({})),
}));
vi.mock<typeof import("../chain-clarify.js")>(import("../chain-clarify.js"), () => ({
	ChainClarifyComponent: class {},
}));
vi.mock<typeof import("../artifacts.js")>(import("../artifacts.js"), () => ({
	cleanupAllArtifactDirs: mockCleanupAllArtifactDirs,
	cleanupOldArtifacts: mockCleanupOldArtifacts,
	getArtifactsDir: vi.fn(() => "/tmp/artifacts"),
}));
vi.mock<typeof import("../types.js")>(import("../types.js"), () => ({
	ASYNC_DIR: "/tmp/pi-async-subagent-runs",
	DEFAULT_ARTIFACT_CONFIG: { cleanupDays: 7 },
	DEFAULT_MAX_OUTPUT: { bytes: 200 * 1024, lines: 5000 },
	MAX_CONCURRENCY: 4,
	MAX_PARALLEL: 8,
	POLL_INTERVAL_MS: 250,
	RESULTS_DIR: "/tmp/pi-async-subagent-results",
	WIDGET_KEY: "subagent-async",
	checkSubagentDepth: () => ({ blocked: false, depth: 0, maxDepth: 2 }),
}));
vi.mock<typeof import("../utils.js")>(import("../utils.js"), () => ({
	findByPrefix: vi.fn(),
	getFinalOutput: vi.fn(() => ""),
	mapConcurrent: async <T, R>(items: T[], fn: (item: T) => Promise<R>) => Promise.all(items.map((item) => fn(item))),
	readStatus: mockReadStatus,
}));
vi.mock<typeof import("../completion-dedupe.js")>(import("../completion-dedupe.js"), () => ({
	buildCompletionKey: vi.fn(() => "key"),
	markSeenWithTtl: vi.fn(() => false),
}));
vi.mock<typeof import("../file-coalescer.js")>(import("../file-coalescer.js"), () => ({
	createFileCoalescer: vi.fn(() => ({
		clear: mockCoalescerClear,
		schedule: mockCoalescerSchedule,
	})),
}));
vi.mock<typeof import("../execution.js")>(import("../execution.js"), () => ({
	runSync: vi.fn(),
}));
vi.mock<typeof import("../render.js")>(import("../render.js"), () => ({
	renderSubagentResult: vi.fn(),
	renderWidget: mockRenderWidget,
}));
vi.mock<typeof import("../schemas.js")>(import("../schemas.js"), () => ({
	StatusParams: {},
	SubagentParams: {},
}));
vi.mock<typeof import("../chain-execution.js")>(import("../chain-execution.js"), () => ({
	executeChain: vi.fn(),
}));
vi.mock<typeof import("../async-execution.js")>(import("../async-execution.js"), () => ({
	executeAsyncChain: vi.fn(),
	executeAsyncSingle: vi.fn(),
	isAsyncAvailable: vi.fn(() => true),
}));
vi.mock<typeof import("../skills.js")>(import("../skills.js"), () => ({
	discoverAvailableSkills: vi.fn(() => []),
	normalizeSkillInput: vi.fn((value) => value),
}));
vi.mock<typeof import("../single-output.js")>(import("../single-output.js"), () => ({
	finalizeSingleOutput: vi.fn(),
	injectSingleOutputInstruction: vi.fn((value) => value),
	resolveSingleOutputPath: vi.fn(),
}));
vi.mock<typeof import("../agent-manager.js")>(import("../agent-manager.js"), () => ({
	AgentManagerComponent: class {},
}));
vi.mock<typeof import("../run-history.js")>(import("../run-history.js"), () => ({
	recordRun: vi.fn(),
}));
vi.mock<typeof import("../agent-management.js")>(import("../agent-management.js"), () => ({
	handleManagementAction: vi.fn(),
}));
vi.mock<typeof import("../bootstrap.js")>(import("../bootstrap.js"), () => ({
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
		events: {
			emit(event: string, data: unknown) {
				for (const handler of eventHandlers.get(event) ?? []) {
					handler(data);
				}
			},
			on(event: string, handler: (data: unknown) => void) {
				if (!eventHandlers.has(event)) {
					eventHandlers.set(event, []);
				}
				eventHandlers.get(event)?.push(handler);
			},
		},
		on(event: string, handler: (...args: any[]) => any) {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			handlers.get(event)?.push(handler);
		},
		registerCommand: vi.fn(),
		registerShortcut: vi.fn(),
		registerTool: vi.fn((tool: any) => {
			tools.set(tool.name, tool);
		}),
		sendUserMessage: vi.fn(),
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
			setWidget: vi.fn(),
			theme: {
				bold: (text: string) => text,
				fg: (_color: string, text: string) => text,
			},
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
		mockLoadSubagentConfig.mockReturnValue({ asyncByDefault: true, defaultSessionDir: "/tmp/custom-session-root" });

		registerSubagentExtension(pi as any);
		const tool = pi._tools.get("subagent");
		expect(tool).toBeDefined();

		await tool.execute("tool-1", { action: "list" }, undefined, undefined, ctx);
		await tool.execute("tool-2", { action: "list" }, undefined, undefined, ctx);

		expect(mockLoadSubagentConfig).toHaveBeenCalledOnce();
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
		expect(mockCleanupOldChainDirs).toHaveBeenCalledOnce();
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
			pi._emitEvent("subagent:started", { agent: "scout", asyncDir: `/tmp/job-${i}`, id: `job-${i}` });
		}

		expect(setIntervalSpy).toHaveBeenCalledOnce();

		await pi._emit("session_shutdown");
		expect(clearIntervalSpy).toHaveBeenCalledOnce();
		expect(mockWatcherClose).toHaveBeenCalledOnce();
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
				pi._emitEvent("subagent:started", { agent: "scout", asyncDir: `/tmp/${id}`, id });
				pi._emitEvent("subagent:complete", { asyncDir: `/tmp/${id}`, id, success: true });
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
