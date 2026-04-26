
import { aggregateParallelOutputs, flattenSteps, isParallelGroup, MAX_PARALLEL_CONCURRENCY, mapConcurrent } from '../parallel-utils.js';
import type { ParallelStepGroup, RunnerStep, RunnerSubagentStep } from '../parallel-utils.js';

describe(isParallelGroup, () => {
	it("returns true for a parallel step group", () => {
		const step: ParallelStepGroup = {
			parallel: [
				{ agent: "a", task: "do stuff" },
				{ agent: "b", task: "do other stuff" },
			],
		};
		expect(isParallelGroup(step)).toBeTruthy();
	});

	it("returns false for a sequential step", () => {
		const step: RunnerSubagentStep = { agent: "a", task: "do stuff" };
		expect(isParallelGroup(step)).toBeFalsy();
	});

	it("returns false when parallel is not an array", () => {
		const step = { agent: "a", parallel: "not-an-array", task: "x" } as unknown as RunnerStep;
		expect(isParallelGroup(step)).toBeFalsy();
	});
});

describe(flattenSteps, () => {
	it("returns sequential steps unchanged", () => {
		const steps: RunnerStep[] = [
			{ agent: "a", task: "t1" },
			{ agent: "b", task: "t2" },
		];
		const flat = flattenSteps(steps);
		expect(flat).toHaveLength(2);
		expect(flat[0]?.agent).toBe("a");
		expect(flat[1]?.agent).toBe("b");
	});

	it("expands parallel groups into individual steps", () => {
		const steps: RunnerStep[] = [
			{ agent: "scout", task: "find info" },
			{
				parallel: [
					{ agent: "reviewer-a", task: "review part 1" },
					{ agent: "reviewer-b", task: "review part 2" },
				],
			},
			{ agent: "summarizer", task: "combine" },
		];
		const flat = flattenSteps(steps);
		expect(flat).toHaveLength(4);
		expect(flat.map((step) => step.agent)).toStrictEqual(["scout", "reviewer-a", "reviewer-b", "summarizer"]);
	});

	it("handles empty steps array", () => {
		expect(flattenSteps([])).toStrictEqual([]);
	});

	it("handles empty parallel group", () => {
		const steps: RunnerStep[] = [{ agent: "before", task: "x" }, { parallel: [] }, { agent: "after", task: "y" }];
		const flat = flattenSteps(steps);
		expect(flat).toHaveLength(2);
		expect(flat.map((step) => step.agent)).toStrictEqual(["before", "after"]);
	});
});

describe(mapConcurrent, () => {
	it("processes all items and preserves order", async () => {
		const items = [10, 20, 30, 40];
		const results = await mapConcurrent(items, 2, async (item) => item * 2, 0);
		expect(results).toStrictEqual([20, 40, 60, 80]);
	});

	it("respects concurrency limit", async () => {
		let running = 0;
		let maxRunning = 0;
		const items = [1, 2, 3, 4, 5, 6];

		await mapConcurrent(
			items,
			2,
			async () => {
				running++;
				maxRunning = Math.max(maxRunning, running);
				await new Promise((resolve) => setTimeout(resolve, 10));
				running--;
			},
			0,
		);

		expect(maxRunning).toBeLessThanOrEqual(2);
	});

	it("handles empty input", async () => {
		const results = await mapConcurrent([], 4, async (item: number) => item, 0);
		expect(results).toStrictEqual([]);
	});

	it("clamps limit=0 to 1 for sequential execution", async () => {
		let running = 0;
		let maxRunning = 0;
		await mapConcurrent(
			[1, 2, 3],
			0,
			async (item) => {
				running++;
				maxRunning = Math.max(maxRunning, running);
				await new Promise((resolve) => setTimeout(resolve, 10));
				running--;
				return item * 10;
			},
			0,
		);
		expect(maxRunning).toBe(1);
	});

	it("clamps negative limits to 1 for sequential execution", async () => {
		let running = 0;
		let maxRunning = 0;
		await mapConcurrent(
			[1, 2, 3],
			-1,
			async (item) => {
				running++;
				maxRunning = Math.max(maxRunning, running);
				await new Promise((resolve) => setTimeout(resolve, 10));
				running--;
				return item * 10;
			},
			0,
		);
		expect(maxRunning).toBe(1);
	});

	it("staggers worker starts when staggerMs is positive", async () => {
		const workerStarts: number[] = [];
		await mapConcurrent(
			[1, 2, 3],
			3,
			async () => {
				workerStarts.push(Date.now());
				await new Promise((resolve) => setTimeout(resolve, 500));
			},
			100,
		);
		const d1 = workerStarts[1]! - workerStarts[0]!;
		const d2 = workerStarts[2]! - workerStarts[0]!;
		expect(d1).toBeGreaterThanOrEqual(80);
		expect(d2).toBeGreaterThanOrEqual(160);
	});

	it("skips staggering when staggerMs is 0", async () => {
		const startTimes: number[] = [];
		await mapConcurrent(
			[1, 2, 3],
			3,
			async (_item, index) => {
				startTimes[index] = Date.now();
				await new Promise((resolve) => setTimeout(resolve, 10));
			},
			0,
		);
		const d1 = startTimes[1]! - startTimes[0]!;
		const d2 = startTimes[2]! - startTimes[0]!;
		expect(d1).toBeLessThan(20);
		expect(d2).toBeLessThan(20);
	});
});

describe(aggregateParallelOutputs, () => {
	it("aggregates successful outputs with headers", () => {
		const result = aggregateParallelOutputs([
			{ agent: "reviewer-a", exitCode: 0, output: "Looks good" },
			{ agent: "reviewer-b", exitCode: 0, output: "Needs fixes" },
		]);
		expect(result).toContain("=== Parallel Task 1 (reviewer-a) ===");
		expect(result).toContain("Looks good");
		expect(result).toContain("=== Parallel Task 2 (reviewer-b) ===");
		expect(result).toContain("Needs fixes");
	});

	it("marks failed tasks", () => {
		const result = aggregateParallelOutputs([{ agent: "agent-a", exitCode: 1, output: "partial output" }]);
		expect(result).toContain("[!] FAILED (exit code 1)");
	});

	it("marks empty output", () => {
		const result = aggregateParallelOutputs([{ agent: "agent-a", exitCode: 0, output: "" }]);
		expect(result).toContain("[!] EMPTY OUTPUT");
	});

	it("treats whitespace-only output as empty", () => {
		const result = aggregateParallelOutputs([{ agent: "agent-a", exitCode: 0, output: "   \n  " }]);
		expect(result).toContain("[!] EMPTY OUTPUT");
	});

	it("marks skipped tasks distinctly from failures", () => {
		const result = aggregateParallelOutputs([
			{ agent: "agent-a", exitCode: 0, output: "done" },
			{ agent: "agent-b", exitCode: -1, output: "(skipped — fail-fast)" },
		]);
		expect(result).toContain("⏭️ SKIPPED");
		expect(result).not.toContain("FAILED");
	});
});

describe(MAX_PARALLEL_CONCURRENCY, () => {
	it("is 4", () => {
		expect(MAX_PARALLEL_CONCURRENCY).toBe(4);
	});
});
