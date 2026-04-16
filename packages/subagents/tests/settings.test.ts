import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../skills.js", () => ({
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
		return undefined;
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
		fs.rmSync(dir, { recursive: true, force: true });
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

		expect(isParallelStep(steps[2])).toBe(true);
		expect(getStepAgents(steps[0])).toEqual(["scout"]);
		expect(getStepAgents(steps[2])).toEqual(["reviewer", "qa"]);
		expect(resolveChainTemplates(steps as never)).toEqual([
			"Inspect {task}",
			"{previous}",
			["Review {previous}", "{previous}"],
		]);
	});

	it("creates, removes, and cleans up stale chain directories", async () => {
		const created = createChainDir(`settings-chain-${Date.now()}`);
		expect(fs.existsSync(created)).toBe(true);
		removeChainDir(created);
		expect(fs.existsSync(created)).toBe(false);

		const chainRunsDir = path.join(os.tmpdir(), "pi-chain-runs");
		const staleDir = path.join(chainRunsDir, `stale-${Date.now()}`);
		const freshDir = path.join(chainRunsDir, `fresh-${Date.now()}`);
		fs.mkdirSync(staleDir, { recursive: true });
		fs.mkdirSync(freshDir, { recursive: true });
		tempDirs.push(staleDir, freshDir);
		const staleTime = Date.now() / 1000 - 2 * 24 * 60 * 60;
		fs.utimesSync(staleDir, staleTime, staleTime);

		await cleanupOldChainDirs();

		expect(fs.existsSync(staleDir)).toBe(false);
		expect(fs.existsSync(freshDir)).toBe(true);
	});

	it("resolves step behavior with overrides and chain-level skills", () => {
		const behavior = resolveStepBehavior(
			{
				name: "scout",
				output: "agent.md",
				defaultReads: ["brief.md"],
				defaultProgress: true,
				skills: ["git"],
				model: "anthropic/claude-sonnet-4",
			},
			{
				output: "override.md",
				reads: ["spec.md"],
				progress: false,
				skills: ["context7"],
				model: "openai/gpt-5",
			},
			["shared-skill"],
		);

		expect(behavior).toEqual({
			output: "override.md",
			reads: ["spec.md"],
			progress: false,
			skills: ["context7", "shared-skill"],
			model: "openai/gpt-5",
		});
		expect(
			resolveStepBehavior({ name: "planner", skills: ["plan"], defaultProgress: false }, { skills: false }, ["shared"]),
		).toMatchObject({ skills: false, progress: false, output: false, reads: false });
	});

	it("builds read/write/progress instructions with previous-step summaries", () => {
		const chainDir = "/tmp/pi-chain-demo";
		const instructions = buildChainInstructions(
			{
				output: "report.md",
				reads: ["spec.md", "/abs/notes.md"],
				progress: true,
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
				{ agent: "planner", output: "plan.md", reads: ["spec.md"], progress: true, skill: ["plan"] },
				{ agent: "reviewer", skill: false, output: "/abs/review.md" },
				{ agent: "writer" },
			],
			[
				{
					name: "planner",
					output: "planner.md",
					defaultReads: ["default.md"],
					defaultProgress: false,
					skills: ["git"],
				},
				{ name: "reviewer", output: "review.md", skills: ["review"] },
				{ name: "writer", output: "write.md", skills: ["docs"], model: "anthropic/claude-sonnet-4" },
			],
			2,
			["shared"],
		);

		expect(behaviors).toEqual([
			{
				output: path.join("parallel-2", "0-planner", "plan.md"),
				reads: ["spec.md"],
				progress: true,
				skills: ["plan", "shared"],
				model: undefined,
			},
			{
				output: "/abs/review.md",
				reads: false,
				progress: false,
				skills: false,
				model: undefined,
			},
			{
				output: path.join("parallel-2", "2-writer", "write.md"),
				reads: false,
				progress: false,
				skills: ["docs", "shared"],
				model: "anthropic/claude-sonnet-4",
			},
		]);

		createParallelDirs(chainDir, 2, 3, ["planner", "reviewer", "writer"]);
		expect(fs.existsSync(path.join(chainDir, "parallel-2", "0-planner"))).toBe(true);
		expect(fs.existsSync(path.join(chainDir, "parallel-2", "1-reviewer"))).toBe(true);
		expect(fs.existsSync(path.join(chainDir, "parallel-2", "2-writer"))).toBe(true);
	});

	it("aggregates parallel outputs with clear status markers", () => {
		const summary = aggregateParallelOutputs([
			{ agent: "planner", taskIndex: 0, output: "Plan complete", exitCode: 0 },
			{ agent: "reviewer", taskIndex: 1, output: "", exitCode: 0, error: "Used fallback file" },
			{
				agent: "qa",
				taskIndex: 2,
				output: "",
				exitCode: 0,
				outputTargetPath: "/tmp/qa.md",
				outputTargetExists: false,
			},
			{ agent: "docs", taskIndex: 3, output: "", exitCode: -1 },
			{ agent: "deploy", taskIndex: 4, output: "Logs", exitCode: 1, error: "boom" },
		]);

		expect(summary).toContain("=== Parallel Task 1 (planner) ===\nPlan complete");
		expect(summary).toContain("[!] WARNING: Used fallback file");
		expect(summary).toContain("[!] EMPTY OUTPUT (expected output file missing: /tmp/qa.md)");
		expect(summary).toContain("⏭️ SKIPPED");
		expect(summary).toContain("[!] FAILED (exit code 1): boom\nLogs");
	});
});
