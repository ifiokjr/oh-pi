

const asyncMocks = vi.hoisted(() => {
	const createRequire = () => {
		const requireFn = ((specifier: string) => {
			throw new Error(`Unexpected require: ${specifier}`);
		}) as ((specifier: string) => never) & { resolve: (specifier: string) => string };
		requireFn.resolve = (specifier: string) => `/virtual/${specifier}`;
		return requireFn;
	};

	return {
		applyThinkingSuffix: vi.fn((model: string | undefined, thinking: string | undefined) =>
			model && thinking && thinking !== "off" ? `${model}:${thinking}` : model,
		),
		buildSkillInjection: vi.fn(
			(skills: Array<{ name: string }>) => `INJECT:${skills.map((skill) => skill.name).join(",")}`,
		),
		createRequire,
		existsSync: vi.fn((filePath: string) => filePath.includes("jiti-cli.mjs")),
		injectSingleOutputInstruction: vi.fn((task: string, outputPath?: string) =>
			outputPath ? `${task}\nWRITE ${outputPath}` : task,
		),
		isParallelStep: vi.fn((step: any) => Boolean(step?.parallel)),
		mkdirSync: vi.fn(),
		mkdtempSync: vi.fn(() => "/tmp/pi-async-cfg-123"),
		normalizeSkillInput: vi.fn((value: unknown) => value),
		realpathSync: vi.fn(() => "/virtual/pi/bin/pi.js"),
		resolvePiPackageRoot: vi.fn(() => "/virtual/pi-root"),
		resolveSingleOutputPath: vi.fn((output: string | false | undefined, _runtimeCwd: string, cwd?: string) => {
			if (!output || output === false) {
				return undefined;
			}
			return `${cwd ?? "/repo"}/${output}`;
		}),
		resolveSkills: vi.fn((skillNames: string[]) => ({
			resolved: skillNames.map((name) => ({ name })),
			missing: [],
		})),
		resolveStepBehavior: vi.fn((_agent: any, stepOverrides: any, chainSkills: string[]) => ({
			skills: stepOverrides.skills ?? chainSkills,
		})),
		resolveSubagentModelResolution: vi.fn((_agent: any, _models: any[], explicitModel?: string) => ({
			model: explicitModel,
			source: explicitModel ? "runtime-override" : "agent-default",
			category: explicitModel ? "explicit" : undefined,
		})),
		spawn: vi.fn(() => ({ pid: 4242, unref: vi.fn() })),
		writeFileSync: vi.fn(),
	};
});

vi.mock<typeof import('node:child_process')>(import('node:child_process'), () => ({ spawn: asyncMocks.spawn }));
vi.mock<typeof import('node:fs')>(import('node:fs'), () => ({
	existsSync: asyncMocks.existsSync,
	mkdirSync: asyncMocks.mkdirSync,
	mkdtempSync: asyncMocks.mkdtempSync,
	realpathSync: asyncMocks.realpathSync,
	writeFileSync: asyncMocks.writeFileSync,
}));
vi.mock<typeof import('node:module')>(import('node:module'), () => ({
	createRequire: () => asyncMocks.createRequire(),
}));
vi.mock<typeof import('../execution.js')>(import('../execution.js'), () => ({
	applyThinkingSuffix: asyncMocks.applyThinkingSuffix,
}));
vi.mock<typeof import('../single-output.js')>(import('../single-output.js'), () => ({
	injectSingleOutputInstruction: asyncMocks.injectSingleOutputInstruction,
	resolveSingleOutputPath: asyncMocks.resolveSingleOutputPath,
}));
vi.mock<typeof import('../settings.js')>(import('../settings.js'), () => ({
	isParallelStep: asyncMocks.isParallelStep,
	resolveStepBehavior: asyncMocks.resolveStepBehavior,
}));
vi.mock<typeof import('../pi-spawn.js')>(import('../pi-spawn.js'), () => ({
	resolvePiPackageRoot: asyncMocks.resolvePiPackageRoot,
}));
vi.mock<typeof import('../skills.js')>(import('../skills.js'), () => ({
	buildSkillInjection: asyncMocks.buildSkillInjection,
	normalizeSkillInput: asyncMocks.normalizeSkillInput,
	resolveSkills: asyncMocks.resolveSkills,
}));
vi.mock<typeof import('../types.js')>(import('../types.js'), () => ({
	ASYNC_DIR: "/tmp/pi-async-subagent-runs",
	RESULTS_DIR: "/tmp/pi-async-subagent-results",
}));
vi.mock<typeof import('../model-routing.js')>(import('../model-routing.js'), () => ({
	resolveSubagentModelResolution: asyncMocks.resolveSubagentModelResolution,
	toAvailableModelRefs: (models: any[]) =>
		models.map((model) => ({
			...model,
			fullId: model.fullId ?? `${model.provider}/${model.id}`,
			input: model.input ?? ["text"],
		})),
}));

import { executeAsyncChain, executeAsyncSingle, isAsyncAvailable } from "../async-execution.js";

function createCtx() {
	return {
		availableModels: [{ provider: "anthropic", id: "claude-sonnet-4", fullId: "anthropic/claude-sonnet-4" }],
		currentModel: "anthropic/claude-sonnet-4",
		currentSessionId: "session-1",
		cwd: "/repo",
		pi: {
			events: {
				emit: vi.fn(),
			},
		},
	};
}

function lastRunnerConfig() {
	const call = asyncMocks.writeFileSync.mock.calls.at(-1);
	if (!call) {
		throw new Error("Expected runner config to be written");
	}
	return JSON.parse(call[1]);
}

beforeEach(() => {
	for (const mock of Object.values(asyncMocks)) {
		if (typeof mock === "function" && "mockReset" in mock) {
			(mock as ReturnType<typeof vi.fn>).mockReset();
		}
	}

	asyncMocks.spawn.mockReturnValue({ pid: 4242, unref: vi.fn() });
	asyncMocks.mkdtempSync.mockReturnValue("/tmp/pi-async-cfg-123");
	asyncMocks.existsSync.mockImplementation((filePath: string) => filePath.includes("jiti-cli.mjs"));
	asyncMocks.realpathSync.mockReturnValue("/virtual/pi/bin/pi.js");
	asyncMocks.resolveStepBehavior.mockImplementation((_agent: any, stepOverrides: any, chainSkills: string[]) => ({
		skills: stepOverrides.skills ?? chainSkills,
	}));
	asyncMocks.resolveSkills.mockImplementation((skillNames: string[]) => ({
		missing: [],
		resolved: skillNames.map((name) => ({ name })),
	}));
	asyncMocks.resolveSubagentModelResolution.mockImplementation(
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
});

describe("async execution helpers", () => {
	it("reports async support when the jiti runner is available", () => {
		expect(isAsyncAvailable()).toBeTruthy();
	});

	it("builds async single-runner configs, injects output instructions, and emits start events", () => {
		const ctx = createCtx();
		const result = executeAsyncSingle("run-1", {
			agent: "scout",
			agentConfig: {
				extensions: ["./extensions/worktree.ts"],
				mcpDirectTools: ["read"],
				name: "scout",
				skills: ["git", "context7"],
				systemPrompt: "Base system prompt",
				thinking: "high",
				tools: ["bash"],
			},
			artifactConfig: { enabled: true },
			artifactsDir: "/tmp/artifacts",
			ctx,
			cwd: "/workspace",
			maxOutput: { bytes: 1000, lines: 20 },
			output: "report.md",
			sessionRoot: "/tmp/sessions",
			shareEnabled: true,
			task: "Inspect the repo",
		});

		expect(result).toStrictEqual({
			content: [{ text: "Async: scout [run-1]", type: "text" }],
			details: { asyncDir: "/tmp/pi-async-subagent-runs/run-1", asyncId: "run-1", mode: "single", results: [] },
		});
		expect(asyncMocks.mkdirSync).toHaveBeenCalledWith("/tmp/pi-async-subagent-runs/run-1", { recursive: true });
		expect(asyncMocks.spawn).toHaveBeenCalledWith(
			"node",
			expect.arrayContaining([
				expect.stringContaining("jiti-cli.mjs"),
				expect.stringContaining("subagent-runner.ts"),
				"/tmp/pi-async-cfg-123/run-1.json",
			]),
			expect.objectContaining({ cwd: "/workspace", detached: true, stdio: "ignore", windowsHide: true }),
		);

		const config = lastRunnerConfig();
		expect(config).toMatchObject({
			artifactsDir: "/tmp/artifacts",
			cwd: "/workspace",
			id: "run-1",
			piPackageRoot: "/virtual/pi-root",
			resultPath: "/tmp/pi-async-subagent-results/run-1.json",
			sessionDir: "/tmp/sessions/async-run-1",
			sessionId: "session-1",
			share: true,
		});
		expect(config.steps[0]).toMatchObject({
			agent: "scout",
			extensions: ["./extensions/worktree.ts"],
			mcpDirectTools: ["read"],
			model: "anthropic/claude-sonnet-4:high",
			outputPath: "/workspace/report.md",
			skills: ["git", "context7"],
			task: "Inspect the repo\nWRITE /workspace/report.md",
			tools: ["bash"],
		});
		expect(asyncMocks.resolveSkills).toHaveBeenCalledWith(["git", "context7"], "/workspace");
		expect(config.steps[0].systemPrompt).toBe("Base system prompt\n\nINJECT:git,context7");
		expect(ctx.pi.events.emit).toHaveBeenCalledWith("subagent:started", {
			agent: "scout",
			asyncDir: "/tmp/pi-async-subagent-runs/run-1",
			cwd: "/workspace",
			id: "run-1",
			pid: 4242,
			task: "Inspect the repo",
		});
	});

	it("fails fast for unknown agents in async chains", () => {
		const ctx = createCtx();
		const result = executeAsyncChain("chain-1", {
			agents: [{ name: "scout" }],
			artifactConfig: { enabled: false },
			chain: [{ agent: "missing", task: "Inspect" }],
			ctx,
			shareEnabled: false,
		});

		expect(result.isError).toBeTruthy();
		expect(result.content[0]?.text).toBe("Unknown agent: missing");
		expect(asyncMocks.spawn).not.toHaveBeenCalled();
	});

	it("builds sequential and parallel async chain configs with resolved skills and outputs", () => {
		const ctx = createCtx();
		asyncMocks.resolveSubagentModelResolution
			.mockReturnValueOnce({ category: "explicit", model: "openai/gpt-5", source: "runtime-override" })
			.mockReturnValue({ category: undefined, model: "anthropic/claude-sonnet-4", source: "session-default" });

		const result = executeAsyncChain("chain-2", {
			agents: [
				{ name: "scout", systemPrompt: "Scout", thinking: "minimal" },
				{ name: "planner", systemPrompt: "Plan" },
				{ name: "reviewer", systemPrompt: "Review" },
			],
			artifactConfig: { enabled: false },
			chain: [
				{ agent: "scout", task: "Inspect {task}", output: "notes.md", skill: ["git"] },
				{
					parallel: [
						{ agent: "planner", task: "Plan {previous}", output: "plan.md", cwd: "/workspace/a" },
						{ agent: "reviewer", task: "Review {previous}", skill: ["context7"] },
					],
					concurrency: 2,
					failFast: true,
				},
			],
			chainSkills: ["shared-skill"],
			ctx,
			cwd: "/workspace",
			sessionRoot: "/tmp/sessions",
			shareEnabled: true,
		});

		expect(result).toStrictEqual({
			content: [{ text: "Async chain: scout -> [planner+reviewer] [chain-2]", type: "text" }],
			details: { asyncDir: "/tmp/pi-async-subagent-runs/chain-2", asyncId: "chain-2", mode: "chain", results: [] },
		});

		const config = lastRunnerConfig();
		expect(config.steps[0]).toMatchObject({
			agent: "scout",
			model: "openai/gpt-5:minimal",
			outputPath: "/workspace/notes.md",
			skills: ["git"],
			task: "Inspect {task}\nWRITE /workspace/notes.md",
		});
		expect(config.steps[1]).toMatchObject({ concurrency: 2, failFast: true });
		expect(config.steps[1].parallel[0]).toMatchObject({
			agent: "planner",
			model: "anthropic/claude-sonnet-4",
			outputPath: "/workspace/a/plan.md",
			skills: ["shared-skill"],
			task: "Plan {previous}\nWRITE /workspace/a/plan.md",
		});
		expect(config.steps[1].parallel[1]).toMatchObject({
			agent: "reviewer",
			model: "anthropic/claude-sonnet-4",
			skills: ["context7"],
			task: "Review {previous}",
		});
		expect(asyncMocks.resolveSkills).toHaveBeenNthCalledWith(1, ["git"], "/workspace");
		expect(asyncMocks.resolveSkills).toHaveBeenNthCalledWith(2, ["shared-skill"], "/workspace/a");
		expect(asyncMocks.resolveSkills).toHaveBeenNthCalledWith(3, ["context7"], "/workspace");
		expect(ctx.pi.events.emit).toHaveBeenCalledWith("subagent:started", {
			agent: "scout",
			asyncDir: "/tmp/pi-async-subagent-runs/chain-2",
			chain: ["scout", "[planner+reviewer]"],
			cwd: "/workspace",
			id: "chain-2",
			pid: 4242,
			task: "Inspect {task}",
		});
	});
});
