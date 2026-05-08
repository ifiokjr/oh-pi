import { beforeEach, describe, expect, it, vi } from "vitest";

const asyncMocks = vi.hoisted(() => {
	const createRequire = () => {
		const requireFn = ((specifier: string) => {
			throw new Error(`Unexpected require: ${specifier}`);
		}) as ((specifier: string) => never) & {
			resolve: (specifier: string) => string;
		};
		requireFn.resolve = (specifier: string) => `/virtual/${specifier}`;
		return requireFn;
	};

	return {
		spawn: vi.fn(() => ({ pid: 4242, unref: vi.fn() })),
		mkdtempSync: vi.fn(() => "/tmp/pi-async-cfg-123"),
		writeFileSync: vi.fn(),
		mkdirSync: vi.fn(),
		existsSync: vi.fn((filePath: string) => filePath.includes("jiti-cli.mjs")),
		realpathSync: vi.fn(() => "/virtual/pi/bin/pi.js"),
		createRequire,
		applyThinkingSuffix: vi.fn((model: string | undefined, thinking: string | undefined) =>
			model && thinking && thinking !== "off" ? `${model}:${thinking}` : model,
		),
		injectSingleOutputInstruction: vi.fn((task: string, outputPath?: string) =>
			outputPath ? `${task}\nWRITE ${outputPath}` : task,
		),
		resolveSingleOutputPath: vi.fn((output: string | false | undefined, _runtimeCwd: string, cwd?: string) => {
			if (!output || output === false) {
				return undefined;
			}
			return `${cwd ?? "/repo"}/${output}`;
		}),
		isParallelStep: vi.fn((step: any) => Boolean(step?.parallel)),
		resolveStepBehavior: vi.fn((_agent: any, stepOverrides: any, chainSkills: string[]) => ({
			skills: stepOverrides.skills ?? chainSkills,
		})),
		resolvePiPackageRoot: vi.fn(() => "/virtual/pi-root"),
		buildSkillInjection: vi.fn(
			(skills: Array<{ name: string }>) => `INJECT:${skills.map((skill) => skill.name).join(",")}`,
		),
		normalizeSkillInput: vi.fn((value: unknown) => value),
		resolveSkillsAsync: vi.fn(async (skillNames: string[]) => ({
			resolved: skillNames.map((name) => ({ name })),
			missing: [],
		})),
		resolveSubagentModelResolution: vi.fn((_agent: any, _models: any[], explicitModel?: string) => ({
			model: explicitModel,
			source: explicitModel ? "runtime-override" : "agent-default",
			category: explicitModel ? "explicit" : undefined,
		})),
	};
});

vi.mock("node:child_process", () => ({ spawn: asyncMocks.spawn }));
vi.mock("node:fs", () => ({
	mkdtempSync: asyncMocks.mkdtempSync,
	writeFileSync: asyncMocks.writeFileSync,
	mkdirSync: asyncMocks.mkdirSync,
	existsSync: asyncMocks.existsSync,
	realpathSync: asyncMocks.realpathSync,
}));
vi.mock("node:module", () => ({
	createRequire: () => asyncMocks.createRequire(),
}));
vi.mock("../execution.js", () => ({
	applyThinkingSuffix: asyncMocks.applyThinkingSuffix,
}));
vi.mock("../single-output.js", () => ({
	injectSingleOutputInstruction: asyncMocks.injectSingleOutputInstruction,
	resolveSingleOutputPath: asyncMocks.resolveSingleOutputPath,
}));
vi.mock("../settings.js", () => ({
	isParallelStep: asyncMocks.isParallelStep,
	resolveStepBehavior: asyncMocks.resolveStepBehavior,
}));
vi.mock("../pi-spawn.js", () => ({
	resolvePiPackageRoot: asyncMocks.resolvePiPackageRoot,
}));
vi.mock("../skills.js", () => ({
	buildSkillInjection: asyncMocks.buildSkillInjection,
	normalizeSkillInput: asyncMocks.normalizeSkillInput,
	resolveSkillsAsync: asyncMocks.resolveSkillsAsync,
}));
vi.mock("../types.js", () => ({
	ASYNC_DIR: "/tmp/pi-async-subagent-runs",
	RESULTS_DIR: "/tmp/pi-async-subagent-results",
}));
vi.mock("../model-routing.js", () => ({
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
		cwd: "/repo",
		currentSessionId: "session-1",
		currentModel: "anthropic/claude-sonnet-4",
		availableModels: [
			{
				provider: "anthropic",
				id: "claude-sonnet-4",
				fullId: "anthropic/claude-sonnet-4",
			},
		],
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
	asyncMocks.resolveSkillsAsync.mockImplementation(async (skillNames: string[]) => ({
		resolved: skillNames.map((name) => ({ name })),
		missing: [],
	}));
	asyncMocks.resolveSubagentModelResolution.mockImplementation(
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
});

describe("async execution helpers", () => {
	it("reports async support when the jiti runner is available", () => {
		expect(isAsyncAvailable()).toBe(true);
	});

	it("builds async single-runner configs, injects output instructions, and emits start events", async () => {
		const ctx = createCtx();
		const result = await executeAsyncSingle("run-1", {
			agent: "scout",
			task: "Inspect the repo",
			agentConfig: {
				name: "scout",
				systemPrompt: "Base system prompt",
				thinking: "high",
				skills: ["git", "context7"],
				tools: ["bash"],
				extensions: ["./extensions/worktree.ts"],
				mcpDirectTools: ["read"],
			},
			ctx,
			cwd: "/workspace",
			output: "report.md",
			shareEnabled: true,
			sessionRoot: "/tmp/sessions",
			artifactConfig: { enabled: true },
			artifactsDir: "/tmp/artifacts",
			maxOutput: { bytes: 1000, lines: 20 },
		});

		expect(result).toEqual({
			content: [{ type: "text", text: "Async: scout [run-1]" }],
			details: {
				mode: "single",
				results: [],
				asyncId: "run-1",
				asyncDir: "/tmp/pi-async-subagent-runs/run-1",
			},
		});
		expect(asyncMocks.mkdirSync).toHaveBeenCalledWith("/tmp/pi-async-subagent-runs/run-1", { recursive: true });
		expect(asyncMocks.spawn).toHaveBeenCalledWith(
			"node",
			expect.arrayContaining([
				expect.stringContaining("jiti-cli.mjs"),
				expect.stringContaining("subagent-runner.ts"),
				"/tmp/pi-async-cfg-123/run-1.json",
			]),
			expect.objectContaining({
				cwd: "/workspace",
				detached: true,
				stdio: "ignore",
				windowsHide: true,
			}),
		);

		const config = lastRunnerConfig();
		expect(config).toMatchObject({
			id: "run-1",
			cwd: "/workspace",
			resultPath: "/tmp/pi-async-subagent-results/run-1.json",
			artifactsDir: "/tmp/artifacts",
			share: true,
			sessionDir: "/tmp/sessions/async-run-1",
			sessionId: "session-1",
			piPackageRoot: "/virtual/pi-root",
		});
		expect(config.steps[0]).toMatchObject({
			agent: "scout",
			task: "Inspect the repo\nWRITE /workspace/report.md",
			model: "anthropic/claude-sonnet-4:high",
			tools: ["bash"],
			extensions: ["./extensions/worktree.ts"],
			mcpDirectTools: ["read"],
			skills: ["git", "context7"],
			outputPath: "/workspace/report.md",
		});
		expect(asyncMocks.resolveSkillsAsync).toHaveBeenCalledWith(["git", "context7"], "/workspace");
		expect(config.steps[0].systemPrompt).toBe("Base system prompt\n\nINJECT:git,context7");
		expect(ctx.pi.events.emit).toHaveBeenCalledWith("subagent:started", {
			id: "run-1",
			pid: 4242,
			agent: "scout",
			task: "Inspect the repo",
			cwd: "/workspace",
			asyncDir: "/tmp/pi-async-subagent-runs/run-1",
		});
	});

	it("fails fast for unknown agents in async chains", async () => {
		const ctx = createCtx();
		const result = await executeAsyncChain("chain-1", {
			chain: [{ agent: "missing", task: "Inspect" }],
			agents: [{ name: "scout" }],
			ctx,
			shareEnabled: false,
			artifactConfig: { enabled: false },
		});

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toBe("Unknown agent: missing");
		expect(asyncMocks.spawn).not.toHaveBeenCalled();
	});

	it("builds sequential and parallel async chain configs with resolved skills and outputs", async () => {
		const ctx = createCtx();
		asyncMocks.resolveSubagentModelResolution
			.mockReturnValueOnce({
				model: "openai/gpt-5",
				source: "runtime-override",
				category: "explicit",
			})
			.mockReturnValue({
				model: "anthropic/claude-sonnet-4",
				source: "session-default",
				category: undefined,
			});

		const result = await executeAsyncChain("chain-2", {
			chain: [
				{
					agent: "scout",
					task: "Inspect {task}",
					output: "notes.md",
					skill: ["git"],
				},
				{
					parallel: [
						{
							agent: "planner",
							task: "Plan {previous}",
							output: "plan.md",
							cwd: "/workspace/a",
						},
						{
							agent: "reviewer",
							task: "Review {previous}",
							skill: ["context7"],
						},
					],
					concurrency: 2,
					failFast: true,
				},
			],
			agents: [
				{ name: "scout", systemPrompt: "Scout", thinking: "minimal" },
				{ name: "planner", systemPrompt: "Plan" },
				{ name: "reviewer", systemPrompt: "Review" },
			],
			ctx,
			cwd: "/workspace",
			shareEnabled: true,
			sessionRoot: "/tmp/sessions",
			artifactConfig: { enabled: false },
			chainSkills: ["shared-skill"],
		});

		expect(result).toEqual({
			content: [
				{
					type: "text",
					text: "Async chain: scout -> [planner+reviewer] [chain-2]",
				},
			],
			details: {
				mode: "chain",
				results: [],
				asyncId: "chain-2",
				asyncDir: "/tmp/pi-async-subagent-runs/chain-2",
			},
		});

		const config = lastRunnerConfig();
		expect(config.steps[0]).toMatchObject({
			agent: "scout",
			task: "Inspect {task}\nWRITE /workspace/notes.md",
			model: "openai/gpt-5:minimal",
			skills: ["git"],
			outputPath: "/workspace/notes.md",
		});
		expect(config.steps[1]).toMatchObject({ concurrency: 2, failFast: true });
		expect(config.steps[1].parallel[0]).toMatchObject({
			agent: "planner",
			task: "Plan {previous}\nWRITE /workspace/a/plan.md",
			model: "anthropic/claude-sonnet-4",
			skills: ["shared-skill"],
			outputPath: "/workspace/a/plan.md",
		});
		expect(config.steps[1].parallel[1]).toMatchObject({
			agent: "reviewer",
			task: "Review {previous}",
			model: "anthropic/claude-sonnet-4",
			skills: ["context7"],
		});
		expect(asyncMocks.resolveSkillsAsync).toHaveBeenNthCalledWith(1, ["git"], "/workspace");
		expect(asyncMocks.resolveSkillsAsync).toHaveBeenNthCalledWith(2, ["shared-skill"], "/workspace/a");
		expect(asyncMocks.resolveSkillsAsync).toHaveBeenNthCalledWith(3, ["context7"], "/workspace");
		expect(ctx.pi.events.emit).toHaveBeenCalledWith("subagent:started", {
			id: "chain-2",
			pid: 4242,
			agent: "scout",
			task: "Inspect {task}",
			chain: ["scout", "[planner+reviewer]"],
			cwd: "/workspace",
			asyncDir: "/tmp/pi-async-subagent-runs/chain-2",
		});
	});
});
