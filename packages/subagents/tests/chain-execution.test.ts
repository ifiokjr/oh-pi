import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chainMocks = vi.hoisted(() => ({
	resolveChainTemplates: vi.fn((chain: any[]) =>
		chain.map((step) =>
			Array.isArray(step.parallel)
				? step.parallel.map((task: any) => task.task ?? "{previous}")
				: (step.task ?? "{previous}"),
		),
	),
	createChainDir: vi.fn((_runId: string, base?: string) => base ?? path.join(os.tmpdir(), "pi-chain-fallback")),
	removeChainDir: vi.fn(),
	resolveStepBehavior: vi.fn((_agent: any, override: any, chainSkills: string[]) => ({
		output: override.output,
		reads: override.reads,
		progress: override.progress,
		skills: override.skills ?? chainSkills,
	})),
	resolveParallelBehaviors: vi.fn((parallel: any[], _agents: any[], _stepIndex: number, chainSkills: string[]) =>
		parallel.map((task: any) => ({
			output: task.output,
			reads: task.reads,
			progress: task.progress,
			skills: task.skill ?? chainSkills,
		})),
	),
	buildChainInstructions: vi.fn((behavior: any, chainDir: string) => ({
		prefix: `READ ${behavior.reads?.join(",") ?? "none"} FROM ${chainDir}\n`,
		suffix: behavior.output ? `\nWRITE ${behavior.output}` : "",
	})),
	createParallelDirs: vi.fn(),
	aggregateParallelOutputs: vi.fn((taskResults: any[]) => taskResults.map((task) => task.output).join("\n---\n")),
	isParallelStep: vi.fn((step: any) => Array.isArray(step?.parallel)),
	normalizeSkillInput: vi.fn((value: unknown) => value),
	discoverAvailableSkills: vi.fn(() => [{ name: "git" }, { name: "context7" }]),
	runSync: vi.fn(),
	buildChainSummary: vi.fn(
		(_chain: any[], _results: any[], chainDir: string, status: string, failure?: any) =>
			`summary:${status}:${path.basename(chainDir)}:${failure?.error ?? "ok"}`,
	),
	getFinalOutput: vi.fn((messages: any[]) => messages.map((message) => message.content?.[0]?.text ?? "").join("\n")),
	mapConcurrent: vi.fn((items: any[], _concurrency: number, mapper: (item: any, index: number) => Promise<any>) =>
		Promise.all(items.map((item, index) => mapper(item, index))),
	),
	recordRun: vi.fn(),
	resolveSubagentModelResolution: vi.fn((_agent: any, _models: any[], explicitModel?: string) => ({
		model: explicitModel,
		source: explicitModel ? "runtime-override" : "agent-default",
		category: explicitModel ? "explicit" : undefined,
	})),
}));

vi.mock("../chain-clarify.js", () => ({
	ChainClarifyComponent: class {},
}));
vi.mock("../settings.js", () => ({
	resolveChainTemplates: chainMocks.resolveChainTemplates,
	createChainDir: chainMocks.createChainDir,
	removeChainDir: chainMocks.removeChainDir,
	resolveStepBehavior: chainMocks.resolveStepBehavior,
	resolveParallelBehaviors: chainMocks.resolveParallelBehaviors,
	buildChainInstructions: chainMocks.buildChainInstructions,
	createParallelDirs: chainMocks.createParallelDirs,
	aggregateParallelOutputs: chainMocks.aggregateParallelOutputs,
	isParallelStep: chainMocks.isParallelStep,
}));
vi.mock("../skills.js", () => ({
	discoverAvailableSkills: chainMocks.discoverAvailableSkills,
	normalizeSkillInput: chainMocks.normalizeSkillInput,
}));
vi.mock("../execution.js", () => ({
	runSync: chainMocks.runSync,
}));
vi.mock("../formatters.js", () => ({
	buildChainSummary: chainMocks.buildChainSummary,
}));
vi.mock("../utils.js", () => ({
	getFinalOutput: chainMocks.getFinalOutput,
	mapConcurrent: chainMocks.mapConcurrent,
}));
vi.mock("../run-history.js", () => ({
	recordRun: chainMocks.recordRun,
}));
vi.mock("../model-routing.js", () => ({
	resolveSubagentModelResolution: chainMocks.resolveSubagentModelResolution,
	toAvailableModelRefs: (models: any[]) =>
		models.map((model) => ({
			...model,
			fullId: model.fullId ?? `${model.provider}/${model.id}`,
			input: model.input ?? ["text"],
		})),
}));
vi.mock("../types.js", () => ({
	MAX_CONCURRENCY: 4,
	MAX_PARALLEL: 8,
	resolveSubagentLimits: () => ({ maxParallel: 8, maxConcurrency: 4 }),
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
		model: { provider: "anthropic", id: "claude-sonnet-4" },
		modelRegistry: {
			getAvailable: () => [
				{ provider: "anthropic", id: "claude-sonnet-4" },
				{ provider: "openai", id: "gpt-5" },
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
		task: text,
		exitCode,
		messages: [{ role: "assistant", content: [{ type: "text", text }] }],
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1 },
		progressSummary: { durationMs: 12 },
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
		reads: override.reads,
		progress: override.progress,
		skills: override.skills ?? chainSkills,
	}));
	chainMocks.resolveParallelBehaviors.mockImplementation(
		(parallel: any[], _agents: any[], _stepIndex: number, chainSkills: string[]) =>
			parallel.map((task: any) => ({
				output: task.output,
				reads: task.reads,
				progress: task.progress,
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
			model: explicitModel,
			source: explicitModel ? "runtime-override" : "agent-default",
			category: explicitModel ? "explicit" : undefined,
		}),
	);
});

afterEach(() => {
	for (const dir of tempDirs) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
	tempDirs.length = 0;
});

describe("executeChain", () => {
	const agents = [{ name: "scout", model: "anthropic/claude-sonnet-4" }, { name: "planner" }, { name: "reviewer" }];

	it("cancels clarified chains and removes the chain dir", async () => {
		const chainDir = createTempDir("pi-chain-cancel-");
		const ctx = createCtx();
		ctx.ui.custom.mockResolvedValueOnce(null);

		const result = await executeChain({
			chain: [{ agent: "scout", task: "Inspect {task}" }],
			task: "the repo",
			agents,
			ctx: ctx as never,
			runId: "chain-cancel",
			shareEnabled: false,
			sessionDirForIndex: () => undefined,
			artifactsDir: "/tmp/artifacts",
			artifactConfig: { enabled: false } as never,
			chainDir,
		});

		expect(result).toEqual({
			content: [{ type: "text", text: "Chain cancelled" }],
			details: { mode: "chain", results: [] },
		});
		expect(chainMocks.removeChainDir).toHaveBeenCalledWith(chainDir);
		expect(chainMocks.runSync).not.toHaveBeenCalled();
	});

	it("returns async launch requests when clarify asks to run in the background", async () => {
		const chainDir = createTempDir("pi-chain-bg-");
		const ctx = createCtx();
		ctx.ui.custom.mockResolvedValueOnce({
			confirmed: true,
			runInBackground: true,
			templates: ["Rewrite {task}"],
			behaviorOverrides: [
				{
					model: "openai/gpt-5",
					output: "deliver.md",
					reads: ["spec.md"],
					progress: true,
					skills: ["git"],
				},
			],
		});

		const result = await executeChain({
			chain: [{ agent: "scout", task: "Inspect {task}" }],
			task: "the repo",
			agents,
			ctx: ctx as never,
			runId: "chain-bg",
			shareEnabled: false,
			sessionDirForIndex: () => undefined,
			artifactsDir: "/tmp/artifacts",
			artifactConfig: { enabled: false } as never,
			chainDir,
		});

		expect(result.content[0]?.text).toBe("Launching in background...");
		expect(result.requestedAsync).toEqual({
			chain: [
				{
					agent: "scout",
					task: "Rewrite {task}",
					model: "openai/gpt-5",
					output: "deliver.md",
					reads: ["spec.md"],
					progress: true,
					skill: ["git"],
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
			task: "the repo",
			agents,
			ctx: ctx as never,
			runId: "chain-parallel",
			shareEnabled: false,
			sessionDirForIndex: () => undefined,
			artifactsDir: "/tmp/artifacts",
			artifactConfig: { enabled: false } as never,
			includeProgress: true,
			chainDir,
		});

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("summary:failed");
		expect(result.details.results).toHaveLength(2);
		expect(result.details.progress).toHaveLength(0);
		expect(fs.existsSync(path.join(chainDir, "progress.md"))).toBe(true);
		expect(chainMocks.createParallelDirs).toHaveBeenCalledWith(chainDir, 0, 2, ["planner", "reviewer"]);
		expect(chainMocks.aggregateParallelOutputs).not.toHaveBeenCalled();
	});

	it("completes sequential chains and annotates missing expected outputs", async () => {
		const chainDir = createTempDir("pi-chain-seq-");
		fs.writeFileSync(path.join(chainDir, "alt.md"), "alternate output");
		const ctx = createCtx({ hasUI: false });
		chainMocks.runSync.mockResolvedValueOnce(
			createResult("scout", 0, "Scout output", {
				progress: { index: 0, agent: "scout", status: "completed" },
				artifactPaths: { inputPath: "in.md", outputPath: "out.md", metadataPath: "meta.json", jsonlPath: "run.jsonl" },
			}),
		);

		const result = await executeChain({
			chain: [{ agent: "scout", task: "Inspect {task}", output: "report.md", reads: ["spec.md"], progress: true }],
			task: "the repo",
			agents,
			ctx: ctx as never,
			runId: "chain-seq",
			shareEnabled: true,
			sessionDirForIndex: () => "/tmp/sessions/0",
			artifactsDir: "/tmp/artifacts",
			artifactConfig: { enabled: true } as never,
			includeProgress: true,
			chainDir,
		});

		expect(result.isError).toBeUndefined();
		expect(result.content[0]?.text).toContain("summary:completed");
		expect(result.details.results[0]?.error).toContain("Agent wrote to different file(s): alt.md instead of report.md");
		expect(result.details.progress).toEqual([{ index: 0, agent: "scout", status: "completed" }]);
		expect(result.details.artifacts).toEqual({
			dir: "/tmp/artifacts",
			files: [{ inputPath: "in.md", outputPath: "out.md", metadataPath: "meta.json", jsonlPath: "run.jsonl" }],
		});
		expect(chainMocks.recordRun).toHaveBeenCalledWith("scout", "Inspect the repo", 0, 12);
	});
});
