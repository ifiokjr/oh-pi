import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMonitorMock = vi.hoisted(() => ({
	refreshWidget: vi.fn(),
	ensurePoller: vi.fn(),
	stop: vi.fn(),
	clearResults: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
	discoverAgents: vi.fn(),
	discoverAgentsAll: vi.fn(() => ({
		agents: [],
		builtin: [],
		user: [],
		project: [],
		chains: [],
	})),
	resolveExecutionAgentScope: vi.fn(() => "both"),
	cleanupOldChainDirs: vi.fn(),
	getStepAgents: vi.fn((step: any) =>
		"parallel" in step ? step.parallel.map((task: any) => task.agent) : [step.agent],
	),
	isParallelStep: vi.fn((step: any) => Boolean(step && typeof step === "object" && Array.isArray(step.parallel))),
	resolveStepBehavior: vi.fn(() => ({ skills: undefined })),
	cleanupAllArtifactDirs: vi.fn(),
	cleanupOldArtifacts: vi.fn(),
	getArtifactsDir: vi.fn(() => "/tmp/artifacts"),
	checkSubagentDepth: vi.fn(() => ({ blocked: false, depth: 0, maxDepth: 2 })),
	findByPrefix: vi.fn(() => null),
	getFinalOutput: vi.fn(() => "final output"),
	mapConcurrent: vi.fn((items: any[], concurrencyOrFn: any, maybeFn?: any) => {
		const mapper = typeof concurrencyOrFn === "function" ? concurrencyOrFn : maybeFn;
		return Promise.all(items.map((item, index) => mapper(item, index)));
	}),
	readStatus: vi.fn(() => null),
	runSync: vi.fn(),
	renderWidget: vi.fn(),
	renderSubagentResult: vi.fn(),
	executeChain: vi.fn(),
	isAsyncAvailable: vi.fn(() => true),
	executeAsyncChain: vi.fn(),
	executeAsyncSingle: vi.fn(),
	discoverAvailableSkills: vi.fn(() => [{ name: "git" }, { name: "context7" }]),
	normalizeSkillInput: vi.fn((value: unknown) => value),
	finalizeSingleOutput: vi.fn(({ truncatedOutput, fullOutput }: any) => ({
		displayOutput: truncatedOutput || fullOutput || "(no output)",
	})),
	injectSingleOutputInstruction: vi.fn((task: string) => task),
	resolveSingleOutputPath: vi.fn((output: string | undefined) => (output ? `/tmp/${output}` : undefined)),
	recordRun: vi.fn(),
	handleManagementAction: vi.fn(),
	registerSubagentCommands: vi.fn(),
	ensureAccessibleDir: vi.fn(),
	expandTildePath: vi.fn((value: string) => value),
	getSubagentSessionRoot: vi.fn(() => "/tmp/subagent-session-root"),
	loadSubagentConfig: vi.fn(() => ({})),
	resolveSubagentModelResolution: vi.fn(() => ({
		model: undefined,
		source: "agent-default",
	})),
	createSubagentRuntimeMonitor: vi.fn(() => runtimeMonitorMock),
}));

vi.mock("node:fs", () => ({
	constants: { R_OK: 4, W_OK: 2 },
	existsSync: vi.fn(() => false),
	readFileSync: vi.fn(() => '{"id":"result-1","success":true,"summary":"done"}'),
	mkdirSync: vi.fn(),
	accessSync: vi.fn(),
	rmSync: vi.fn(),
	watch: vi.fn(() => ({
		on: vi.fn(),
		unref: vi.fn(),
		close: vi.fn(),
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
	discoverAgents: mocks.discoverAgents,
	discoverAgentsAll: mocks.discoverAgentsAll,
}));
vi.mock("../agent-scope.js", () => ({
	resolveExecutionAgentScope: mocks.resolveExecutionAgentScope,
}));
vi.mock("../settings.js", () => ({
	cleanupOldChainDirs: mocks.cleanupOldChainDirs,
	getStepAgents: mocks.getStepAgents,
	isParallelStep: mocks.isParallelStep,
	resolveStepBehavior: mocks.resolveStepBehavior,
}));
vi.mock("../chain-clarify.js", () => ({
	ChainClarifyComponent: class {},
}));
vi.mock("../artifacts.js", () => ({
	cleanupAllArtifactDirs: mocks.cleanupAllArtifactDirs,
	cleanupOldArtifacts: mocks.cleanupOldArtifacts,
	getArtifactsDir: mocks.getArtifactsDir,
}));
vi.mock("../types.js", () => ({
	ASYNC_DIR: "/tmp/pi-async-subagent-runs",
	RESULTS_DIR: "/tmp/pi-async-subagent-results",
	DEFAULT_ARTIFACT_CONFIG: { cleanupDays: 7 },
	DEFAULT_MAX_OUTPUT: { bytes: 200 * 1024, lines: 5000 },
	MAX_CONCURRENCY: 4,
	MAX_PARALLEL: 3,
	WIDGET_KEY: "subagent-async",
	checkSubagentDepth: mocks.checkSubagentDepth,
}));
vi.mock("../utils.js", () => ({
	readStatus: mocks.readStatus,
	findByPrefix: mocks.findByPrefix,
	getFinalOutput: mocks.getFinalOutput,
	mapConcurrent: mocks.mapConcurrent,
}));
vi.mock("../execution.js", () => ({
	runSync: mocks.runSync,
}));
vi.mock("../render.js", () => ({
	renderWidget: mocks.renderWidget,
	renderSubagentResult: mocks.renderSubagentResult,
}));
vi.mock("../schemas.js", () => ({
	SubagentParams: {},
	StatusParams: {},
}));
vi.mock("../chain-execution.js", () => ({
	executeChain: mocks.executeChain,
}));
vi.mock("../async-execution.js", () => ({
	isAsyncAvailable: mocks.isAsyncAvailable,
	executeAsyncChain: mocks.executeAsyncChain,
	executeAsyncSingle: mocks.executeAsyncSingle,
}));
vi.mock("../skills.js", () => ({
	discoverAvailableSkills: mocks.discoverAvailableSkills,
	normalizeSkillInput: mocks.normalizeSkillInput,
}));
vi.mock("../single-output.js", () => ({
	finalizeSingleOutput: mocks.finalizeSingleOutput,
	injectSingleOutputInstruction: mocks.injectSingleOutputInstruction,
	resolveSingleOutputPath: mocks.resolveSingleOutputPath,
}));
vi.mock("../agent-manager.js", () => ({
	AgentManagerComponent: class {},
}));
vi.mock("../run-history.js", () => ({
	recordRun: mocks.recordRun,
}));
vi.mock("../agent-management.js", () => ({
	handleManagementAction: mocks.handleManagementAction,
}));
vi.mock("../command-registration.js", () => ({
	registerSubagentCommands: mocks.registerSubagentCommands,
}));
vi.mock("../bootstrap.js", () => ({
	ensureAccessibleDir: mocks.ensureAccessibleDir,
	expandTildePath: mocks.expandTildePath,
	getSubagentSessionRoot: mocks.getSubagentSessionRoot,
	loadSubagentConfig: mocks.loadSubagentConfig,
}));
vi.mock("../runtime-monitor.js", () => ({
	createSubagentRuntimeMonitor: mocks.createSubagentRuntimeMonitor,
}));
vi.mock("../model-routing.js", () => ({
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
	const handlers = new Map<string, Array<(...args: any[]) => any>>();
	const eventHandlers = new Map<string, Array<(data: unknown) => void>>();
	const tools = new Map<string, any>();
	const shortcuts = new Map<string, any>();

	return {
		handlers,
		eventHandlers,
		tools,
		shortcuts,
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
		registerShortcut: vi.fn((name: string, spec: any) => {
			shortcuts.set(name, spec);
		}),
		sendUserMessage: vi.fn(),
		events: {
			on(event: string, handler: (data: unknown) => void) {
				if (!eventHandlers.has(event)) {
					eventHandlers.set(event, []);
				}
				eventHandlers.get(event)?.push(handler);
			},
			off: vi.fn(),
			emit(event: string, data: unknown) {
				for (const handler of eventHandlers.get(event) ?? []) {
					handler(data);
				}
			},
		},
	};
}

function createCtx() {
	return {
		cwd: "/repo",
		hasUI: true,
		model: { provider: "anthropic", id: "claude-sonnet-4" },
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
			theme: {
				fg: (_color: string, text: string) => text,
				bold: (text: string) => text,
			},
			setWidget: vi.fn(),
			notify: vi.fn(),
			custom: vi.fn(),
		},
		getContextUsage: () => undefined,
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
	mocks.discoverAgentsAll.mockReturnValue({
		agents: agentConfigs,
		builtin: [],
		user: [],
		project: [],
		chains: [],
	});
	mocks.resolveExecutionAgentScope.mockReturnValue("both");
	mocks.checkSubagentDepth.mockReturnValue({
		blocked: false,
		depth: 0,
		maxDepth: 2,
	});
	mocks.getArtifactsDir.mockReturnValue("/tmp/artifacts");
	mocks.isAsyncAvailable.mockReturnValue(true);
	mocks.normalizeSkillInput.mockImplementation((value: unknown) => value);
	mocks.handleManagementAction.mockReturnValue({
		content: [{ type: "text", text: "listed" }],
		details: { mode: "management", results: [] },
	});
	mocks.executeChain.mockResolvedValue({
		content: [{ type: "text", text: "chain complete" }],
		details: { mode: "chain", results: [] },
	});
	mocks.executeAsyncChain.mockResolvedValue({
		content: [{ type: "text", text: "async chain launched" }],
		details: { mode: "chain", results: [] },
	});
	mocks.executeAsyncSingle.mockResolvedValue({
		content: [{ type: "text", text: "async single launched" }],
		details: { mode: "single", results: [] },
	});
	mocks.runSync.mockResolvedValue({
		agent: "scout",
		exitCode: 0,
		messages: [{ role: "assistant", content: "final output" }],
		truncation: undefined,
		progressSummary: { durationMs: 12 },
	});
	mocks.resolveSubagentModelResolution.mockImplementation(
		(_agent: any, _models: any[], explicitModel?: string, options?: { currentModel?: string }) => {
			if (explicitModel) {
				return {
					model: explicitModel,
					source: "runtime-override",
					category: "explicit",
				};
			}
			if (options?.currentModel) {
				return {
					model: options.currentModel,
					source: "session-default",
					category: undefined,
				};
			}
			return { model: undefined, source: "agent-default", category: undefined };
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
		expect(mocks.handleManagementAction).toHaveBeenCalledWith(
			"list",
			{
				action: "list",
			},
			ctx,
		);
		expect(result.content[0]?.text).toBe("listed");

		const invalid = await tool.execute("tool-2", { action: "bogus" }, undefined, undefined, ctx);
		expect(invalid.isError).toBe(true);
		expect(invalid.content[0]?.text).toContain("Unknown action: bogus");
	});

	it("rejects nested subagent depth and invalid mode combinations", async () => {
		const pi = createMockPi();
		const ctx = createCtx();
		registerSubagentExtension(pi as never);
		const tool = pi.tools.get("subagent");

		mocks.checkSubagentDepth.mockReturnValueOnce({
			blocked: true,
			depth: 2,
			maxDepth: 2,
		});
		const blocked = await tool.execute("tool-1", { agent: "scout", task: "inspect" }, undefined, undefined, ctx);
		expect(blocked.isError).toBe(true);
		expect(blocked.content[0]?.text).toContain("Nested subagent call blocked");

		const invalid = await tool.execute("tool-2", {}, undefined, undefined, ctx);
		expect(invalid.isError).toBe(true);
		expect(invalid.content[0]?.text).toContain("Provide exactly one mode");
	});

	it("validates chain shapes before execution", async () => {
		const pi = createMockPi();
		const ctx = createCtx();
		registerSubagentExtension(pi as never);
		const tool = pi.tools.get("subagent");

		await expect(tool.execute("c0", { chain: [] }, undefined, undefined, ctx)).resolves.toMatchObject({
			isError: true,
			content: [
				{
					type: "text",
					text: "Provide exactly one mode. Agents: scout, planner, reviewer",
				},
			],
		});

		const firstStepMissingTask = await tool.execute("c1", { chain: [{ agent: "scout" }] }, undefined, undefined, ctx);
		expect(firstStepMissingTask.isError).toBe(true);
		expect(firstStepMissingTask.content[0]?.text).toBe("First step in chain must have a task");

		const firstParallelMissingTask = await tool.execute(
			"c2",
			{ chain: [{ parallel: [{ agent: "scout" }] }] },
			undefined,
			undefined,
			ctx,
		);
		expect(firstParallelMissingTask.isError).toBe(true);
		expect(firstParallelMissingTask.content[0]?.text).toContain("First parallel step: task 1 must have a task");

		const unknownAgent = await tool.execute(
			"c3",
			{ chain: [{ agent: "unknown", task: "inspect" }] },
			undefined,
			undefined,
			ctx,
		);
		expect(unknownAgent.isError).toBe(true);
		expect(unknownAgent.content[0]?.text).toBe("Unknown agent: unknown (step 1)");

		const emptyParallel = await tool.execute(
			"c4",
			{ chain: [{ parallel: [] }], task: "inspect" },
			undefined,
			undefined,
			ctx,
		);
		expect(emptyParallel.isError).toBe(true);
		expect(emptyParallel.content[0]?.text).toBe("Parallel step 1 must have at least one task");
	});

	it("routes chain clarify background launches through the async chain executor", async () => {
		const pi = createMockPi();
		const ctx = createCtx();
		registerSubagentExtension(pi as never);
		const tool = pi.tools.get("subagent");
		mocks.executeChain.mockResolvedValueOnce({
			content: [{ type: "text", text: "launching" }],
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
		expect(unavailable.isError).toBe(true);
		expect(unavailable.content[0]?.text).toContain("Background mode requires jiti");

		mocks.executeChain.mockResolvedValueOnce({
			content: [{ type: "text", text: "launching" }],
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
		expect(mocks.executeAsyncChain).toHaveBeenCalledTimes(1);
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
		expect(tooMany.isError).toBe(true);
		expect(tooMany.content[0]?.text).toBe("Max 3 tasks");

		const unknownAgent = await tool.execute(
			"p2",
			{ tasks: [{ agent: "unknown", task: "inspect" }] },
			undefined,
			undefined,
			ctx,
		);
		expect(unknownAgent.isError).toBe(true);
		expect(unknownAgent.content[0]?.text).toBe("Unknown agent: unknown");

		ctx.ui.custom = vi.fn().mockResolvedValue({
			confirmed: true,
			templates: ["inspect", "plan"],
			behaviorOverrides: [{}, { model: "openai/gpt-5", skills: false }],
			runInBackground: true,
		});
		const launched = await tool.execute(
			"p3",
			{
				tasks: [
					{ agent: "scout", task: "inspect" },
					{ agent: "planner", task: "plan" },
				],
				clarify: true,
			},
			undefined,
			undefined,
			ctx,
		);
		expect(mocks.executeAsyncChain).toHaveBeenCalledTimes(1);
		expect(mocks.executeAsyncChain.mock.calls[0]?.[1]?.chain).toEqual([
			{
				parallel: [
					expect.objectContaining({
						agent: "scout",
						task: "inspect",
						model: "anthropic/claude-sonnet-4",
					}),
					expect.objectContaining({
						agent: "planner",
						task: "plan",
						model: "openai/gpt-5",
						skill: false,
					}),
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
		expect(unknownAgent.isError).toBe(true);
		expect(unknownAgent.content[0]?.text).toBe("Unknown agent: unknown");

		ctx.ui.custom = vi.fn().mockResolvedValueOnce(undefined);
		const cancelled = await tool.execute(
			"s1",
			{ agent: "scout", task: "inspect", clarify: true },
			undefined,
			undefined,
			ctx,
		);
		expect(cancelled.content[0]?.text).toBe("Cancelled");

		ctx.ui.custom = vi.fn().mockResolvedValueOnce({
			confirmed: true,
			templates: ["inspect carefully"],
			behaviorOverrides: [
				{
					output: "notes.md",
					model: "openai/gpt-5",
					skills: ["git"],
				},
			],
			runInBackground: true,
		});
		const background = await tool.execute(
			"s2",
			{ agent: "scout", task: "inspect", clarify: true },
			undefined,
			undefined,
			ctx,
		);
		expect(mocks.executeAsyncSingle).toHaveBeenCalledTimes(1);
		expect(mocks.executeAsyncSingle.mock.calls[0]?.[1]).toMatchObject({
			agent: "scout",
			task: "inspect carefully",
			output: "notes.md",
			skills: ["git"],
		});
		expect(background.content[0]?.text).toBe("async single launched");

		mocks.runSync.mockResolvedValueOnce({
			agent: "scout",
			exitCode: 0,
			messages: [{ role: "assistant", content: "single output" }],
			truncation: undefined,
			progressSummary: { durationMs: 12 },
		});
		const success = await tool.execute(
			"s3",
			{ agent: "scout", task: "inspect", output: true },
			undefined,
			undefined,
			ctx,
		);
		expect(mocks.resolveSingleOutputPath).toHaveBeenCalledWith("scout.md", "/repo", undefined);
		expect(success.content[0]?.text).toBe("final output");

		mocks.runSync.mockResolvedValueOnce({
			agent: "scout",
			exitCode: 1,
			messages: [],
			truncation: { text: "truncated" },
			error: "boom",
			progressSummary: { durationMs: 5 },
		});
		const failure = await tool.execute("s4", { agent: "scout", task: "inspect" }, undefined, undefined, ctx);
		expect(failure.isError).toBe(true);
		expect(failure.content[0]?.text).toBe("boom");
	});

	it("reports async run status from result files and not-found cases", async () => {
		const pi = createMockPi();
		const ctx = createCtx();
		registerSubagentExtension(pi as never);
		const statusTool = pi.tools.get("subagent_status");

		const missing = await statusTool.execute("status-1", { id: "missing" }, undefined, undefined, ctx);
		expect(missing.isError).toBe(true);
		expect(missing.content[0]?.text).toBe("Async run not found. Provide id or dir.");

		mocks.findByPrefix
			.mockImplementationOnce(() => null)
			.mockImplementationOnce(() => "/tmp/pi-async-subagent-results/result-1.json");
		const found = await statusTool.execute("status-2", { id: "result-1" }, undefined, undefined, ctx);
		expect(found.content[0]?.text).toContain("Run: result-1");
		expect(found.content[0]?.text).toContain("State: complete");
	});
});
