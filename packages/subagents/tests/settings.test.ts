import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock<typeof import("../skills.js")>(import("../skills.js"), () => ({
	normalizeSkillInput: (value: unknown) => {
		if (value === false) {
			return false;
		}
		if (Array.isArray(value)) {
			return value;
		}
		if (typeof value === "string") {
			return value
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean);
		}
		return;
	},
}));

import {
	aggregateParallelOutputs,
	buildChainInstructions,
	cleanupOldChainDirs,
	createChainDir,
	createParallelDirs,
	getStepAgents,
	isParallelStep,
	removeChainDir,
	resolveChainTemplates,
	resolveParallelBehaviors,
	resolveStepBehavior,
} from "../settings.js";

const tempDirs: string[] = [];

function createTempDir(prefix: string) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) {
		fs.rmSync(dir, { force: true, recursive: true });
	}
	tempDirs.length = 0;
});

describe("subagent settings helpers", () => {
	it("detects parallel steps and resolves default templates", () => {
		const steps = [
			{ agent: "scout", task: "Inspect {task}" },
			{ agent: "planner" },
			{
				parallel: [{ agent: "reviewer", task: "Review {previous}" }, { agent: "qa" }],
			},
		] as const;

		expect(isParallelStep(steps[2])).toBeTruthy();
		expect(getStepAgents(steps[0])).toStrictEqual(["scout"]);
		expect(getStepAgents(steps[2])).toStrictEqual(["reviewer", "qa"]);
		expect(resolveChainTemplates(steps as never)).toStrictEqual([
			"Inspect {task}",
			"{previous}",
			["Review {previous}", "{previous}"],
		]);
	});

	it("creates, removes, and cleans up stale chain directories", async () => {
		const created = createChainDir(`settings-chain-${Date.now()}`);
		expect(fs.existsSync(created)).toBeTruthy();
		removeChainDir(created);
		expect(fs.existsSync(created)).toBeFalsy();

		const chainRunsDir = path.join(os.tmpdir(), "pi-chain-runs");
		const staleDir = path.join(chainRunsDir, `stale-${Date.now()}`);
		const freshDir = path.join(chainRunsDir, `fresh-${Date.now()}`);
		fs.mkdirSync(staleDir, { recursive: true });
		fs.mkdirSync(freshDir, { recursive: true });
		tempDirs.push(staleDir, freshDir);
		const staleTime = Date.now() / 1000 - 2 * 24 * 60 * 60;
		fs.utimesSync(staleDir, staleTime, staleTime);

		await cleanupOldChainDirs();

		expect(fs.existsSync(staleDir)).toBeFalsy();
		expect(fs.existsSync(freshDir)).toBeTruthy();
	});

	it("resolves step behavior with overrides and chain-level skills", () => {
		const behavior = resolveStepBehavior(
			{
				defaultProgress: true,
				defaultReads: ["brief.md"],
				model: "anthropic/claude-sonnet-4",
				name: "scout",
				output: "agent.md",
				skills: ["git"],
			},
			{
				model: "openai/gpt-5",
				output: "override.md",
				progress: false,
				reads: ["spec.md"],
				skills: ["context7"],
			},
			["shared-skill"],
		);

		expect(behavior).toStrictEqual({
			model: "openai/gpt-5",
			output: "override.md",
			progress: false,
			reads: ["spec.md"],
			skills: ["context7", "shared-skill"],
		});
		expect(
			resolveStepBehavior({ defaultProgress: false, name: "planner", skills: ["plan"] }, { skills: false }, ["shared"]),
		).toMatchObject({ output: false, progress: false, reads: false, skills: false });
	});

	it("builds read/write/progress instructions with previous-step summaries", () => {
		const chainDir = "/tmp/pi-chain-demo";
		const instructions = buildChainInstructions(
			{
				output: "report.md",
				progress: true,
				reads: ["spec.md", "/abs/notes.md"],
				skills: ["git"],
			},
			chainDir,
			true,
			"Previous output",
		);

		expect(instructions.prefix).toContain("[Read from: /tmp/pi-chain-demo/spec.md, /abs/notes.md]");
		expect(instructions.prefix).toContain("[Write to: /tmp/pi-chain-demo/report.md]");
		expect(instructions.suffix).toContain("Create and maintain progress at: /tmp/pi-chain-demo/progress.md");
		expect(instructions.suffix).toContain("Previous step output:\nPrevious output");
	});

	it("namespaces parallel behaviors and creates parallel output directories", () => {
		const chainDir = createTempDir("pi-chain-parallel-settings-");
		const behaviors = resolveParallelBehaviors(
			[
				{ agent: "planner", output: "plan.md", progress: true, reads: ["spec.md"], skill: ["plan"] },
				{ agent: "reviewer", output: "/abs/review.md", skill: false },
				{ agent: "writer" },
			],
			[
				{
					defaultProgress: false,
					defaultReads: ["default.md"],
					name: "planner",
					output: "planner.md",
					skills: ["git"],
				},
				{ name: "reviewer", output: "review.md", skills: ["review"] },
				{ model: "anthropic/claude-sonnet-4", name: "writer", output: "write.md", skills: ["docs"] },
			],
			2,
			["shared"],
		);

		expect(behaviors).toStrictEqual([
			{
				model: undefined,
				output: path.join("parallel-2", "0-planner", "plan.md"),
				progress: true,
				reads: ["spec.md"],
				skills: ["plan", "shared"],
			},
			{
				model: undefined,
				output: "/abs/review.md",
				progress: false,
				reads: false,
				skills: false,
			},
			{
				model: "anthropic/claude-sonnet-4",
				output: path.join("parallel-2", "2-writer", "write.md"),
				progress: false,
				reads: false,
				skills: ["docs", "shared"],
			},
		]);

		createParallelDirs(chainDir, 2, 3, ["planner", "reviewer", "writer"]);
		expect(fs.existsSync(path.join(chainDir, "parallel-2", "0-planner"))).toBeTruthy();
		expect(fs.existsSync(path.join(chainDir, "parallel-2", "1-reviewer"))).toBeTruthy();
		expect(fs.existsSync(path.join(chainDir, "parallel-2", "2-writer"))).toBeTruthy();
	});

	it("aggregates parallel outputs with clear status markers", () => {
		const summary = aggregateParallelOutputs([
			{ agent: "planner", exitCode: 0, output: "Plan complete", taskIndex: 0 },
			{ agent: "reviewer", error: "Used fallback file", exitCode: 0, output: "", taskIndex: 1 },
			{
				agent: "qa",
				exitCode: 0,
				output: "",
				outputTargetExists: false,
				outputTargetPath: "/tmp/qa.md",
				taskIndex: 2,
			},
			{ agent: "docs", exitCode: -1, output: "", taskIndex: 3 },
			{ agent: "deploy", error: "boom", exitCode: 1, output: "Logs", taskIndex: 4 },
		]);

		expect(summary).toContain("=== Parallel Task 1 (planner) ===\nPlan complete");
		expect(summary).toContain("[!] WARNING: Used fallback file");
		expect(summary).toContain("[!] EMPTY OUTPUT (expected output file missing: /tmp/qa.md)");
		expect(summary).toContain("⏭️ SKIPPED");
		expect(summary).toContain("[!] FAILED (exit code 1): boom\nLogs");
	});
});
