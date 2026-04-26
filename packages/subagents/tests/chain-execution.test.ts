import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const chainMocks = vi.hoisted(() => ({
	aggregateParallelOutputs: vi.fn((taskResults: any[]) => taskResults.map((task) => task.output).join("\n---\n")),
	buildChainInstructions: vi.fn((behavior: any, chainDir: string) => ({
		prefix: `READ ${behavior.reads?.join(",") ?? "none"} FROM ${chainDir}\n`,
		suffix: behavior.output ? `\nWRITE ${behavior.output}` : "",
	})),
	buildChainSummary: vi.fn(
		(_chain: any[], _results: any[], chainDir: string, status: string, failure?: any) =>
			`summary:${status}:${path.basename(chainDir)}:${failure?.error ?? "ok"}`,
	),
	createChainDir: vi.fn((_runId: string, base?: string) => base ?? path.join(os.tmpdir(), "pi-chain-fallback")),
	createParallelDirs: vi.fn(),
	discoverAvailableSkills: vi.fn(() => [{ name: "git" }, { name: "context7" }]),
	getFinalOutput: vi.fn((messages: any[]) => messages.map((message) => message.content?.[0]?.text ?? "").join("\n")),
	isParallelStep: vi.fn((step: any) => Array.isArray(step?.parallel)),
	mapConcurrent: vi.fn((items: any[], _concurrency: number, mapper: (item: any, index: number) => Promise<any>) =>
		Promise.all(items.map((item, index) => mapper(item, index))),
	),
	normalizeSkillInput: vi.fn((value: unknown) => value),
	recordRun: vi.fn(),
	removeChainDir: vi.fn(),
	resolveChainTemplates: vi.fn((chain: any[]) =>
		chain.map((step) =>
			Array.isArray(step.parallel)
				? step.parallel.map((task: any) => task.task ?? "{previous}")
				: (step.task ?? "{previous}"),
		),
	),
	resolveParallelBehaviors: vi.fn((parallel: any[], _agents: any[], _stepIndex: number, chainSkills: string[]) =>
		parallel.map((task: any) => ({
			output: task.output,
			reads: task.reads,
			progress: task.progress,
			skills: task.skill ?? chainSkills,
		})),
	),
	resolveStepBehavior: vi.fn((_agent: any, override: any, chainSkills: string[]) => ({
		output: override.output,
		reads: override.reads,
		progress: override.progress,
		skills: override.skills ?? chainSkills,
	})),
	resolveSubagentModelResolution: vi.fn((_agent: any, _models: any[], explicitModel?: string) => ({
		model: explicitModel,
		source: explicitModel ? "runtime-override" : "agent-default",
		category: explicitModel ? "explicit" : undefined,
	})),
	runSync: vi.fn(),
}));

vi.mock<typeof import("../chain-clarify.js")>(import("../chain-clarify.js"), () => ({
	ChainClarifyComponent: class {},
}));
vi.mock<typeof import("../settings.js")>(import("../settings.js"), () => ({
	aggregateParallelOutputs: chainMocks.aggregateParallelOutputs,
	buildChainInstructions: chainMocks.buildChainInstructions,
	createChainDir: chainMocks.createChainDir,
	createParallelDirs: chainMocks.createParallelDirs,
	isParallelStep: chainMocks.isParallelStep,
	removeChainDir: chainMocks.removeChainDir,
	resolveChainTemplates: chainMocks.resolveChainTemplates,
	resolveParallelBehaviors: chainMocks.resolveParallelBehaviors,
	resolveStepBehavior: chainMocks.resolveStepBehavior,
}));
vi.mock<typeof import("../skills.js")>(import("../skills.js"), () => ({
	discoverAvailableSkills: chainMocks.discoverAvailableSkills,
	normalizeSkillInput: chainMocks.normalizeSkillInput,
}));
vi.mock<typeof import("../execution.js")>(import("../execution.js"), () => ({
	runSync: chainMocks.runSync,
}));
vi.mock<typeof import("../formatters.js")>(import("../formatters.js"), () => ({
	buildChainSummary: chainMocks.buildChainSummary,
}));
vi.mock<typeof import("../utils.js")>(import("../utils.js"), () => ({
	getFinalOutput: chainMocks.getFinalOutput,
	mapConcurrent: chainMocks.mapConcurrent,
}));
vi.mock<typeof import("../run-history.js")>(import("../run-history.js"), () => ({
	recordRun: chainMocks.recordRun,
}));
vi.mock<typeof import("../model-routing.js")>(import("../model-routing.js"), () => ({
	resolveSubagentModelResolution: chainMocks.resolveSubagentModelResolution,
	toAvailableModelRefs: (models: any[]) =>
		models.map((model) => ({
			...model,
			fullId: model.fullId ?? `${model.provider}/${model.id}`,
			input: model.input ?? ["text"],
		})),
}));
vi.mock<typeof import("../types.js")>(import("../types.js"), () => ({
	MAX_CONCURRENCY: 4,
}));

import { executeChain } from "../chain-execution.js";

const tempDirs: string[] = [];

function createTempDir(prefix: string) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function createCtx(overrides: Record<string, unknown> = {}) {
	return {
		cwd: "/repo",
		hasUI: true,
		model: { id: "claude-sonnet-4", provider: "anthropic" },
		modelRegistry: {
			getAvailable: () => [
				{ id: "claude-sonnet-4", provider: "anthropic" },
				{ id: "gpt-5", provider: "openai" },
			],
		},
		ui: {
			custom: vi.fn(),
		},
		...overrides,
	};
}

function createResult(agent: string, exitCode: number, text: string, extra: Record<string, unknown> = {}) {
	return {
		agent,
		exitCode,
		messages: [{ role: "assistant", content: [{ type: "text", text }] }],
		progressSummary: { durationMs: 12 },
		task: text,
		usage: { cacheRead: 0, cacheWrite: 0, cost: 0, input: 0, output: 0, turns: 1 },
		...extra,
	};
}

beforeEach(() => {
	for (const mock of Object.values(chainMocks)) {
		if (typeof mock === "function" && "mockReset" in mock) {
			(mock as ReturnType<typeof vi.fn>).mockReset();
		}
	}

	chainMocks.resolveChainTemplates.mockImplementation((chain: any[]) =>
		chain.map((step) =>
			Array.isArray(step.parallel)
				? step.parallel.map((task: any) => task.task ?? "{previous}")
				: (step.task ?? "{previous}"),
		),
	);
	chainMocks.createChainDir.mockImplementation((_runId: string, base?: string) => base ?? createTempDir("pi-chain-"));
	chainMocks.resolveStepBehavior.mockImplementation((_agent: any, override: any, chainSkills: string[]) => ({
		output: override.output,
		progress: override.progress,
		reads: override.reads,
		skills: override.skills ?? chainSkills,
	}));
	chainMocks.resolveParallelBehaviors.mockImplementation(
		(parallel: any[], _agents: any[], _stepIndex: number, chainSkills: string[]) =>
			parallel.map((task: any) => ({
				output: task.output,
				progress: task.progress,
				reads: task.reads,
				skills: task.skill ?? chainSkills,
			})),
	);
	chainMocks.buildChainInstructions.mockImplementation((behavior: any, chainDir: string) => ({
		prefix: `READ ${behavior.reads?.join(",") ?? "none"} FROM ${chainDir}\n`,
		suffix: behavior.output ? `\nWRITE ${behavior.output}` : "",
	}));
	chainMocks.aggregateParallelOutputs.mockImplementation((taskResults: any[]) =>
		taskResults.map((task) => task.output).join("\n---\n"),
	);
	chainMocks.getFinalOutput.mockImplementation((messages: any[]) =>
		messages.map((message) => message.content?.[0]?.text ?? "").join("\n"),
	);
	chainMocks.mapConcurrent.mockImplementation(
		(items: any[], _concurrency: number, mapper: (item: any, index: number) => Promise<any>) =>
			Promise.all(items.map((item, index) => mapper(item, index))),
	);
	chainMocks.discoverAvailableSkills.mockReturnValue([{ name: "git" }, { name: "context7" }]);
	chainMocks.resolveSubagentModelResolution.mockImplementation(
		(_agent: any, _models: any[], explicitModel?: string) => ({
			category: explicitModel ? "explicit" : undefined,
			model: explicitModel,
			source: explicitModel ? "runtime-override" : "agent-default",
		}),
	);
});

afterEach(() => {
	for (const dir of tempDirs) {
		fs.rmSync(dir, { force: true, recursive: true });
	}
	tempDirs.length = 0;
});

describe(executeChain, () => {
	const agents = [{ model: "anthropic/claude-sonnet-4", name: "scout" }, { name: "planner" }, { name: "reviewer" }];

	it("cancels clarified chains and removes the chain dir", async () => {
		const chainDir = createTempDir("pi-chain-cancel-");
		const ctx = createCtx();
		ctx.ui.custom.mockResolvedValueOnce(null);

		const result = await executeChain({
			agents,
			artifactConfig: { enabled: false } as never,
			artifactsDir: "/tmp/artifacts",
			chain: [{ agent: "scout", task: "Inspect {task}" }],
			chainDir,
			ctx: ctx as never,
			runId: "chain-cancel",
			sessionDirForIndex: () => undefined,
			shareEnabled: false,
			task: "the repo",
		});

		expect(result).toStrictEqual({
			content: [{ text: "Chain cancelled", type: "text" }],
			details: { mode: "chain", results: [] },
		});
		expect(chainMocks.removeChainDir).toHaveBeenCalledWith(chainDir);
		expect(chainMocks.runSync).not.toHaveBeenCalled();
	});

	it("returns async launch requests when clarify asks to run in the background", async () => {
		const chainDir = createTempDir("pi-chain-bg-");
		const ctx = createCtx();
		ctx.ui.custom.mockResolvedValueOnce({
			behaviorOverrides: [
				{
					model: "openai/gpt-5",
					output: "deliver.md",
					reads: ["spec.md"],
					progress: true,
					skills: ["git"],
				},
			],
			confirmed: true,
			runInBackground: true,
			templates: ["Rewrite {task}"],
		});

		const result = await executeChain({
			agents,
			artifactConfig: { enabled: false } as never,
			artifactsDir: "/tmp/artifacts",
			chain: [{ agent: "scout", task: "Inspect {task}" }],
			chainDir,
			ctx: ctx as never,
			runId: "chain-bg",
			sessionDirForIndex: () => undefined,
			shareEnabled: false,
			task: "the repo",
		});

		expect(result.content[0]?.text).toBe("Launching in background...");
		expect(result.requestedAsync).toStrictEqual({
			chain: [
				{
					agent: "scout",
					model: "openai/gpt-5",
					output: "deliver.md",
					progress: true,
					reads: ["spec.md"],
					skill: ["git"],
					task: "Rewrite {task}",
				},
			],
			chainSkills: [],
		});
		expect(chainMocks.removeChainDir).toHaveBeenCalledWith(chainDir);
	});

	it("fails parallel steps with a summarized error and preserves progress details", async () => {
		const chainDir = createTempDir("pi-chain-parallel-");
		const ctx = createCtx({ hasUI: false });
		chainMocks.runSync
			.mockResolvedValueOnce(createResult("planner", 0, "Plan output"))
			.mockResolvedValueOnce(createResult("reviewer", 1, "Review failed", { error: "boom" }));

		const result = await executeChain({
			agents,
			artifactConfig: { enabled: false } as never,
			artifactsDir: "/tmp/artifacts",
			chain: [
				{
					parallel: [
						{ agent: "planner", task: "Plan {task}", progress: true, output: "plan.md" },
						{ agent: "reviewer", task: "Review {task}", progress: true },
					],
					concurrency: 2,
					failFast: true,
				},
			],
			chainDir,
			ctx: ctx as never,
			includeProgress: true,
			runId: "chain-parallel",
			sessionDirForIndex: () => undefined,
			shareEnabled: false,
			task: "the repo",
		});

		expect(result.isError).toBeTruthy();
		expect(result.content[0]?.text).toContain("summary:failed");
		expect(result.details.results).toHaveLength(2);
		expect(result.details.progress).toHaveLength(0);
		expect(fs.existsSync(path.join(chainDir, "progress.md"))).toBeTruthy();
		expect(chainMocks.createParallelDirs).toHaveBeenCalledWith(chainDir, 0, 2, ["planner", "reviewer"]);
		expect(chainMocks.aggregateParallelOutputs).not.toHaveBeenCalled();
	});

	it("completes sequential chains and annotates missing expected outputs", async () => {
		const chainDir = createTempDir("pi-chain-seq-");
		fs.writeFileSync(path.join(chainDir, "alt.md"), "alternate output");
		const ctx = createCtx({ hasUI: false });
		chainMocks.runSync.mockResolvedValueOnce(
			createResult("scout", 0, "Scout output", {
				artifactPaths: { inputPath: "in.md", jsonlPath: "run.jsonl", metadataPath: "meta.json", outputPath: "out.md" },
				progress: { agent: "scout", index: 0, status: "completed" },
			}),
		);

		const result = await executeChain({
			agents,
			artifactConfig: { enabled: true } as never,
			artifactsDir: "/tmp/artifacts",
			chain: [{ agent: "scout", task: "Inspect {task}", output: "report.md", reads: ["spec.md"], progress: true }],
			chainDir,
			ctx: ctx as never,
			includeProgress: true,
			runId: "chain-seq",
			sessionDirForIndex: () => "/tmp/sessions/0",
			shareEnabled: true,
			task: "the repo",
		});

		expect(result.isError).toBeUndefined();
		expect(result.content[0]?.text).toContain("summary:completed");
		expect(result.details.results[0]?.error).toContain("Agent wrote to different file(s): alt.md instead of report.md");
		expect(result.details.progress).toStrictEqual([{ agent: "scout", index: 0, status: "completed" }]);
		expect(result.details.artifacts).toStrictEqual({
			dir: "/tmp/artifacts",
			files: [{ inputPath: "in.md", jsonlPath: "run.jsonl", metadataPath: "meta.json", outputPath: "out.md" }],
		});
		expect(chainMocks.recordRun).toHaveBeenCalledWith("scout", "Inspect the repo", 0, 12);
	});
});
