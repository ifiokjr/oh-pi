const runtimeMonitorMock = vi.hoisted(() => ({
	clearResults: vi.fn(),
	ensurePoller: vi.fn(),
	refreshWidget: vi.fn(),
	stop: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
	checkSubagentDepth: vi.fn(() => ({ blocked: false, depth: 0, maxDepth: 2 })),
	cleanupAllArtifactDirs: vi.fn(),
	cleanupOldArtifacts: vi.fn(),
	cleanupOldChainDirs: vi.fn(),
	createSubagentRuntimeMonitor: vi.fn(() => runtimeMonitorMock),
	discoverAgents: vi.fn(),
	discoverAgentsAll: vi.fn(() => ({ agents: [], builtin: [], user: [], project: [], chains: [] })),
	discoverAvailableSkills: vi.fn(() => [{ name: "git" }, { name: "context7" }]),
	ensureAccessibleDir: vi.fn(),
	executeAsyncChain: vi.fn(),
	executeAsyncSingle: vi.fn(),
	executeChain: vi.fn(),
	expandTildePath: vi.fn((value: string) => value),
	finalizeSingleOutput: vi.fn(({ truncatedOutput, fullOutput }: any) => ({
		displayOutput: truncatedOutput || fullOutput || "(no output)",
	})),
	findByPrefix: vi.fn(() => null),
	getArtifactsDir: vi.fn(() => "/tmp/artifacts"),
	getFinalOutput: vi.fn(() => "final output"),
	getStepAgents: vi.fn((step: any) =>
		"parallel" in step ? step.parallel.map((task: any) => task.agent) : [step.agent],
	),
	getSubagentSessionRoot: vi.fn(() => "/tmp/subagent-session-root"),
	handleManagementAction: vi.fn(),
	injectSingleOutputInstruction: vi.fn((task: string) => task),
	isAsyncAvailable: vi.fn(() => true),
	isParallelStep: vi.fn((step: any) => Boolean(step && typeof step === "object" && Array.isArray(step.parallel))),
	loadSubagentConfig: vi.fn(() => ({})),
	mapConcurrent: vi.fn((items: any[], concurrencyOrFn: any, maybeFn?: any) => {
		const mapper = typeof concurrencyOrFn === "function" ? concurrencyOrFn : maybeFn;
		return Promise.all(items.map((item, index) => mapper(item, index)));
	}),
	normalizeSkillInput: vi.fn((value: unknown) => value),
	readStatus: vi.fn(() => null),
	recordRun: vi.fn(),
	registerSubagentCommands: vi.fn(),
	renderSubagentResult: vi.fn(),
	renderWidget: vi.fn(),
	resolveExecutionAgentScope: vi.fn(() => "both"),
	resolveSingleOutputPath: vi.fn((output: string | undefined) => (output ? `/tmp/${output}` : undefined)),
	resolveStepBehavior: vi.fn(() => ({ skills: undefined })),
	resolveSubagentModelResolution: vi.fn(() => ({ model: undefined, source: "agent-default" })),
	runSync: vi.fn(),
}));

vi.mock<typeof import("node:fs")>(import("node:fs"), () => ({
	accessSync: vi.fn(),
	constants: { R_OK: 4, W_OK: 2 },
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(() => '{"id":"result-1","success":true,"summary":"done"}'),
	readdirSync: vi.fn(() => []),
	rmSync: vi.fn(),
	unlinkSync: vi.fn(),
	watch: vi.fn(() => ({
		on: vi.fn(),
		unref: vi.fn(),
		close: vi.fn(),
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
	discoverAgents: mocks.discoverAgents,
	discoverAgentsAll: mocks.discoverAgentsAll,
}));
vi.mock<typeof import("../agent-scope.js")>(import("../agent-scope.js"), () => ({
	resolveExecutionAgentScope: mocks.resolveExecutionAgentScope,
}));
vi.mock<typeof import("../settings.js")>(import("../settings.js"), () => ({
	cleanupOldChainDirs: mocks.cleanupOldChainDirs,
	getStepAgents: mocks.getStepAgents,
	isParallelStep: mocks.isParallelStep,
	resolveStepBehavior: mocks.resolveStepBehavior,
}));
vi.mock<typeof import("../chain-clarify.js")>(import("../chain-clarify.js"), () => ({
	ChainClarifyComponent: class {},
}));
vi.mock<typeof import("../artifacts.js")>(import("../artifacts.js"), () => ({
	cleanupAllArtifactDirs: mocks.cleanupAllArtifactDirs,
	cleanupOldArtifacts: mocks.cleanupOldArtifacts,
	getArtifactsDir: mocks.getArtifactsDir,
}));
vi.mock<typeof import("../types.js")>(import("../types.js"), () => ({
	ASYNC_DIR: "/tmp/pi-async-subagent-runs",
	DEFAULT_ARTIFACT_CONFIG: { cleanupDays: 7 },
	DEFAULT_MAX_OUTPUT: { bytes: 200 * 1024, lines: 5000 },
	MAX_CONCURRENCY: 4,
	MAX_PARALLEL: 3,
	RESULTS_DIR: "/tmp/pi-async-subagent-results",
	WIDGET_KEY: "subagent-async",
	checkSubagentDepth: mocks.checkSubagentDepth,
}));
vi.mock<typeof import("../utils.js")>(import("../utils.js"), () => ({
	findByPrefix: mocks.findByPrefix,
	getFinalOutput: mocks.getFinalOutput,
	mapConcurrent: mocks.mapConcurrent,
	readStatus: mocks.readStatus,
}));
vi.mock<typeof import("../execution.js")>(import("../execution.js"), () => ({
	runSync: mocks.runSync,
}));
vi.mock<typeof import("../render.js")>(import("../render.js"), () => ({
	renderSubagentResult: mocks.renderSubagentResult,
	renderWidget: mocks.renderWidget,
}));
vi.mock<typeof import("../schemas.js")>(import("../schemas.js"), () => ({
	StatusParams: {},
	SubagentParams: {},
}));
vi.mock<typeof import("../chain-execution.js")>(import("../chain-execution.js"), () => ({
	executeChain: mocks.executeChain,
}));
vi.mock<typeof import("../async-execution.js")>(import("../async-execution.js"), () => ({
	executeAsyncChain: mocks.executeAsyncChain,
	executeAsyncSingle: mocks.executeAsyncSingle,
	isAsyncAvailable: mocks.isAsyncAvailable,
}));
vi.mock<typeof import("../skills.js")>(import("../skills.js"), () => ({
	discoverAvailableSkills: mocks.discoverAvailableSkills,
	normalizeSkillInput: mocks.normalizeSkillInput,
}));
vi.mock<typeof import("../single-output.js")>(import("../single-output.js"), () => ({
	finalizeSingleOutput: mocks.finalizeSingleOutput,
	injectSingleOutputInstruction: mocks.injectSingleOutputInstruction,
	resolveSingleOutputPath: mocks.resolveSingleOutputPath,
}));
vi.mock<typeof import("../agent-manager.js")>(import("../agent-manager.js"), () => ({
	AgentManagerComponent: class {},
}));
vi.mock<typeof import("../run-history.js")>(import("../run-history.js"), () => ({
	recordRun: mocks.recordRun,
}));
vi.mock<typeof import("../agent-management.js")>(import("../agent-management.js"), () => ({
	handleManagementAction: mocks.handleManagementAction,
}));
vi.mock<typeof import("../command-registration.js")>(import("../command-registration.js"), () => ({
	registerSubagentCommands: mocks.registerSubagentCommands,
}));
vi.mock<typeof import("../bootstrap.js")>(import("../bootstrap.js"), () => ({
	ensureAccessibleDir: mocks.ensureAccessibleDir,
	expandTildePath: mocks.expandTildePath,
	getSubagentSessionRoot: mocks.getSubagentSessionRoot,
	loadSubagentConfig: mocks.loadSubagentConfig,
}));
vi.mock<typeof import("../runtime-monitor.js")>(import("../runtime-monitor.js"), () => ({
	createSubagentRuntimeMonitor: mocks.createSubagentRuntimeMonitor,
}));
vi.mock<typeof import("../model-routing.js")>(import("../model-routing.js"), () => ({
	resolveSubagentModelResolution: mocks.resolveSubagentModelResolution,
	toAvailableModelRefs: (models: any[]) =>
		models.map((model) => ({
			...model,
			fullId: model.fullId ?? `${model.provider}/${model.id}`,
			input: model.input ?? ["text"],
		})),
}));

import registerSubagentExtension from "../index.js";

function createMockPi() {
	const handlers = new Map<string, ((...args: any[]) => any)[]>();
	const eventHandlers = new Map<string, ((data: unknown) => void)[]>();
	const tools = new Map<string, any>();
	const shortcuts = new Map<string, any>();

	return {
		eventHandlers,
		events: {
			emit(event: string, data: unknown) {
				for (const handler of eventHandlers.get(event) ?? []) {
					handler(data);
				}
			},
			off: vi.fn(),
			on(event: string, handler: (data: unknown) => void) {
				if (!eventHandlers.has(event)) {
					eventHandlers.set(event, []);
				}
				eventHandlers.get(event)?.push(handler);
			},
		},
		handlers,
		on(event: string, handler: (...args: any[]) => any) {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			handlers.get(event)?.push(handler);
		},
		registerCommand: vi.fn(),
		registerShortcut: vi.fn((name: string, spec: any) => {
			shortcuts.set(name, spec);
		}),
		registerTool: vi.fn((tool: any) => {
			tools.set(tool.name, tool);
		}),
		sendUserMessage: vi.fn(),
		shortcuts,
		tools,
	};
}

function createCtx() {
	return {
		cwd: "/repo",
		getContextUsage: () => undefined,
		hasUI: true,
		model: { id: "claude-sonnet-4", provider: "anthropic" },
		modelRegistry: {
			getAvailable: () => [
				{ provider: "anthropic", id: "claude-sonnet-4" },
				{ provider: "openai", id: "gpt-5" },
			],
		},
		sessionManager: {
			getSessionFile: () => "/tmp/session.jsonl",
			getSessionId: () => "session-1",
		},
		ui: {
			custom: vi.fn(),
			notify: vi.fn(),
			setWidget: vi.fn(),
			theme: {
				bold: (text: string) => text,
				fg: (_color: string, text: string) => text,
			},
		},
	};
}

const agentConfigs = [
	{ name: "scout", output: "scout.md" },
	{ name: "planner", output: "plan.md" },
	{ name: "reviewer" },
];

beforeEach(() => {
	for (const mock of Object.values(mocks)) {
		if (typeof mock === "function" && "mockReset" in mock) {
			(mock as ReturnType<typeof vi.fn>).mockReset();
		}
	}
	mocks.discoverAgents.mockReturnValue({ agents: agentConfigs });
	mocks.discoverAgentsAll.mockReturnValue({ agents: agentConfigs, builtin: [], chains: [], project: [], user: [] });
	mocks.resolveExecutionAgentScope.mockReturnValue("both");
	mocks.checkSubagentDepth.mockReturnValue({ blocked: false, depth: 0, maxDepth: 2 });
	mocks.getArtifactsDir.mockReturnValue("/tmp/artifacts");
	mocks.isAsyncAvailable.mockReturnValue(true);
	mocks.normalizeSkillInput.mockImplementation((value: unknown) => value);
	mocks.handleManagementAction.mockReturnValue({
		content: [{ text: "listed", type: "text" }],
		details: { mode: "management", results: [] },
	});
	mocks.executeChain.mockResolvedValue({
		content: [{ text: "chain complete", type: "text" }],
		details: { mode: "chain", results: [] },
	});
	mocks.executeAsyncChain.mockResolvedValue({
		content: [{ text: "async chain launched", type: "text" }],
		details: { mode: "chain", results: [] },
	});
	mocks.executeAsyncSingle.mockResolvedValue({
		content: [{ text: "async single launched", type: "text" }],
		details: { mode: "single", results: [] },
	});
	mocks.runSync.mockResolvedValue({
		agent: "scout",
		exitCode: 0,
		messages: [{ role: "assistant", content: "final output" }],
		progressSummary: { durationMs: 12 },
		truncation: undefined,
	});
	mocks.resolveSubagentModelResolution.mockImplementation(
		(_agent: any, _models: any[], explicitModel?: string, options?: { currentModel?: string }) => {
			if (explicitModel) {
				return { category: "explicit", model: explicitModel, source: "runtime-override" };
			}
			if (options?.currentModel) {
				return { category: undefined, model: options.currentModel, source: "session-default" };
			}
			return { category: undefined, model: undefined, source: "agent-default" };
		},
	);
	mocks.finalizeSingleOutput.mockImplementation(({ truncatedOutput, fullOutput }: any) => ({
		displayOutput: truncatedOutput || fullOutput || "(no output)",
	}));
	mocks.injectSingleOutputInstruction.mockImplementation((task: string) => task);
	mocks.resolveSingleOutputPath.mockImplementation((output: string | undefined) =>
		output ? `/tmp/${output}` : undefined,
	);
	mocks.findByPrefix.mockReturnValue(null);
	mocks.readStatus.mockReturnValue(null);
	mocks.loadSubagentConfig.mockReturnValue({});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("subagent entrypoint", () => {
	it("registers tools and delegates known management actions", async () => {
		const pi = createMockPi();
		const ctx = createCtx();
		registerSubagentExtension(pi as never);

		const tool = pi.tools.get("subagent");
		const result = await tool.execute("tool-1", { action: "list" }, undefined, undefined, ctx);
		expect(mocks.handleManagementAction).toHaveBeenCalledWith("list", { action: "list" }, ctx);
		expect(result.content[0]?.text).toBe("listed");

		const invalid = await tool.execute("tool-2", { action: "bogus" }, undefined, undefined, ctx);
		expect(invalid.isError).toBeTruthy();
		expect(invalid.content[0]?.text).toContain("Unknown action: bogus");
	});

	it("rejects nested subagent depth and invalid mode combinations", async () => {
		const pi = createMockPi();
		const ctx = createCtx();
		registerSubagentExtension(pi as never);
		const tool = pi.tools.get("subagent");

		mocks.checkSubagentDepth.mockReturnValueOnce({ blocked: true, depth: 2, maxDepth: 2 });
		const blocked = await tool.execute("tool-1", { agent: "scout", task: "inspect" }, undefined, undefined, ctx);
		expect(blocked.isError).toBeTruthy();
		expect(blocked.content[0]?.text).toContain("Nested subagent call blocked");

		const invalid = await tool.execute("tool-2", {}, undefined, undefined, ctx);
		expect(invalid.isError).toBeTruthy();
		expect(invalid.content[0]?.text).toContain("Provide exactly one mode");
	});

	it("validates chain shapes before execution", async () => {
		const pi = createMockPi();
		const ctx = createCtx();
		registerSubagentExtension(pi as never);
		const tool = pi.tools.get("subagent");

		await expect(tool.execute("c0", { chain: [] }, undefined, undefined, ctx)).resolves.toMatchObject({
			content: [{ type: "text", text: "Provide exactly one mode. Agents: scout, planner, reviewer" }],
			isError: true,
		});

		const firstStepMissingTask = await tool.execute("c1", { chain: [{ agent: "scout" }] }, undefined, undefined, ctx);
		expect(firstStepMissingTask.isError).toBeTruthy();
		expect(firstStepMissingTask.content[0]?.text).toBe("First step in chain must have a task");

		const firstParallelMissingTask = await tool.execute(
			"c2",
			{ chain: [{ parallel: [{ agent: "scout" }] }] },
			undefined,
			undefined,
			ctx,
		);
		expect(firstParallelMissingTask.isError).toBeTruthy();
		expect(firstParallelMissingTask.content[0]?.text).toContain("First parallel step: task 1 must have a task");

		const unknownAgent = await tool.execute(
			"c3",
			{ chain: [{ agent: "unknown", task: "inspect" }] },
			undefined,
			undefined,
			ctx,
		);
		expect(unknownAgent.isError).toBeTruthy();
		expect(unknownAgent.content[0]?.text).toBe("Unknown agent: unknown (step 1)");

		const emptyParallel = await tool.execute(
			"c4",
			{ chain: [{ parallel: [] }], task: "inspect" },
			undefined,
			undefined,
			ctx,
		);
		expect(emptyParallel.isError).toBeTruthy();
		expect(emptyParallel.content[0]?.text).toBe("Parallel step 1 must have at least one task");
	});

	it("routes chain clarify background launches through the async chain executor", async () => {
		const pi = createMockPi();
		const ctx = createCtx();
		registerSubagentExtension(pi as never);
		const tool = pi.tools.get("subagent");
		mocks.executeChain.mockResolvedValueOnce({
			content: [{ text: "launching", type: "text" }],
			details: { mode: "chain", results: [] },
			requestedAsync: {
				chain: [{ agent: "scout", task: "inspect" }],
				chainSkills: ["git"],
			},
		});

		mocks.isAsyncAvailable.mockReturnValueOnce(false);
		const unavailable = await tool.execute(
			"chain-1",
			{ chain: [{ agent: "scout", task: "inspect" }] },
			undefined,
			undefined,
			ctx,
		);
		expect(unavailable.isError).toBeTruthy();
		expect(unavailable.content[0]?.text).toContain("Background mode requires jiti");

		mocks.executeChain.mockResolvedValueOnce({
			content: [{ text: "launching", type: "text" }],
			details: { mode: "chain", results: [] },
			requestedAsync: {
				chain: [{ agent: "scout", task: "inspect" }],
				chainSkills: ["git"],
			},
		});
		const available = await tool.execute(
			"chain-2",
			{ chain: [{ agent: "scout", task: "inspect" }] },
			undefined,
			undefined,
			ctx,
		);
		expect(mocks.executeAsyncChain).toHaveBeenCalledOnce();
		expect(available.content[0]?.text).toBe("async chain launched");
	});

	it("validates parallel tasks and supports clarify-driven background launches", async () => {
		const pi = createMockPi();
		const ctx = createCtx();
		registerSubagentExtension(pi as never);
		const tool = pi.tools.get("subagent");

		const tooMany = await tool.execute(
			"p1",
			{
				tasks: [
					{ agent: "scout", task: "inspect" },
					{ agent: "planner", task: "plan" },
					{ agent: "reviewer", task: "review" },
					{ agent: "scout", task: "again" },
				],
			},
			undefined,
			undefined,
			ctx,
		);
		expect(tooMany.isError).toBeTruthy();
		expect(tooMany.content[0]?.text).toBe("Max 3 tasks");

		const unknownAgent = await tool.execute(
			"p2",
			{ tasks: [{ agent: "unknown", task: "inspect" }] },
			undefined,
			undefined,
			ctx,
		);
		expect(unknownAgent.isError).toBeTruthy();
		expect(unknownAgent.content[0]?.text).toBe("Unknown agent: unknown");

		ctx.ui.custom = vi.fn().mockResolvedValue({
			behaviorOverrides: [{}, { model: "openai/gpt-5", skills: false }],
			confirmed: true,
			runInBackground: true,
			templates: ["inspect", "plan"],
		});
		const launched = await tool.execute(
			"p3",
			{
				clarify: true,
				tasks: [
					{ agent: "scout", task: "inspect" },
					{ agent: "planner", task: "plan" },
				],
			},
			undefined,
			undefined,
			ctx,
		);
		expect(mocks.executeAsyncChain).toHaveBeenCalledOnce();
		expect(mocks.executeAsyncChain.mock.calls[0]?.[1]?.chain).toStrictEqual([
			{
				parallel: [
					expect.objectContaining({ agent: "scout", model: "anthropic/claude-sonnet-4", task: "inspect" }),
					expect.objectContaining({ agent: "planner", model: "openai/gpt-5", skill: false, task: "plan" }),
				],
			},
		]);
		expect(launched.content[0]?.text).toBe("async chain launched");
	});

	it("executes single runs, supports clarify cancellation/background, and reports failures", async () => {
		const pi = createMockPi();
		const ctx = createCtx();
		registerSubagentExtension(pi as never);
		const tool = pi.tools.get("subagent");

		const unknownAgent = await tool.execute("s0", { agent: "unknown", task: "inspect" }, undefined, undefined, ctx);
		expect(unknownAgent.isError).toBeTruthy();
		expect(unknownAgent.content[0]?.text).toBe("Unknown agent: unknown");

		ctx.ui.custom = vi.fn().mockResolvedValueOnce();
		const cancelled = await tool.execute(
			"s1",
			{ agent: "scout", clarify: true, task: "inspect" },
			undefined,
			undefined,
			ctx,
		);
		expect(cancelled.content[0]?.text).toBe("Cancelled");

		ctx.ui.custom = vi.fn().mockResolvedValueOnce({
			behaviorOverrides: [{ output: "notes.md", model: "openai/gpt-5", skills: ["git"] }],
			confirmed: true,
			runInBackground: true,
			templates: ["inspect carefully"],
		});
		const background = await tool.execute(
			"s2",
			{ agent: "scout", clarify: true, task: "inspect" },
			undefined,
			undefined,
			ctx,
		);
		expect(mocks.executeAsyncSingle).toHaveBeenCalledOnce();
		expect(mocks.executeAsyncSingle.mock.calls[0]?.[1]).toMatchObject({
			agent: "scout",
			output: "notes.md",
			skills: ["git"],
			task: "inspect carefully",
		});
		expect(background.content[0]?.text).toBe("async single launched");

		mocks.runSync.mockResolvedValueOnce({
			agent: "scout",
			exitCode: 0,
			messages: [{ role: "assistant", content: "single output" }],
			progressSummary: { durationMs: 12 },
			truncation: undefined,
		});
		const success = await tool.execute(
			"s3",
			{ agent: "scout", output: true, task: "inspect" },
			undefined,
			undefined,
			ctx,
		);
		expect(mocks.resolveSingleOutputPath).toHaveBeenCalledWith("scout.md", "/repo", undefined);
		expect(success.content[0]?.text).toBe("final output");

		mocks.runSync.mockResolvedValueOnce({
			agent: "scout",
			error: "boom",
			exitCode: 1,
			messages: [],
			progressSummary: { durationMs: 5 },
			truncation: { text: "truncated" },
		});
		const failure = await tool.execute("s4", { agent: "scout", task: "inspect" }, undefined, undefined, ctx);
		expect(failure.isError).toBeTruthy();
		expect(failure.content[0]?.text).toBe("boom");
	});

	it("reports async run status from result files and not-found cases", async () => {
		const pi = createMockPi();
		const ctx = createCtx();
		registerSubagentExtension(pi as never);
		const statusTool = pi.tools.get("subagent_status");

		const missing = await statusTool.execute("status-1", { id: "missing" }, undefined, undefined, ctx);
		expect(missing.isError).toBeTruthy();
		expect(missing.content[0]?.text).toBe("Async run not found. Provide id or dir.");

		mocks.findByPrefix.mockReturnValueOnce(null).mockReturnValueOnce("/tmp/pi-async-subagent-results/result-1.json");
		const found = await statusTool.execute("status-2", { id: "result-1" }, undefined, undefined, ctx);
		expect(found.content[0]?.text).toContain("Run: result-1");
		expect(found.content[0]?.text).toContain("State: complete");
	});
});
