import type { ColonyState } from "../extensions/ant-colony/types.js";
import {
	antIcon,
	boltIcon,
	buildReport,
	casteIcon,
	checkMark,
	crossMark,
	formatCost,
	formatDuration,
	formatTokens,
	progressBar,
	statusIcon,
	statusLabel,
} from "../extensions/ant-colony/ui.js";

describe(formatDuration, () => {
	it("0ms", () => expect(formatDuration(0)).toBe("0s"));

	it("5000ms", () => expect(formatDuration(5000)).toBe("5s"));

	it("59000ms", () => expect(formatDuration(59_000)).toBe("59s"));

	it("60000ms", () => expect(formatDuration(60_000)).toBe("1m0s"));

	it("90000ms", () => expect(formatDuration(90_000)).toBe("1m30s"));
});

describe(formatCost, () => {
	it("0.001", () => expect(formatCost(0.001)).toBe("$0.0010"));

	it("0.009", () => expect(formatCost(0.009)).toBe("$0.0090"));

	it("0.01", () => expect(formatCost(0.01)).toBe("$0.01"));

	it("1.5", () => expect(formatCost(1.5)).toBe("$1.50"));
});

describe(formatTokens, () => {
	it("500", () => expect(formatTokens(500)).toBe("500"));

	it("999", () => expect(formatTokens(999)).toBe("999"));

	it("1500", () => expect(formatTokens(1500)).toBe("1.5k"));

	it("1500000", () => expect(formatTokens(1_500_000)).toBe("1.5M"));
});

describe(statusIcon, () => {
	afterEach(() => {
		process.env.OH_PI_PLAIN_ICONS = "";
	});

	it("launched", () => expect(statusIcon("launched")).toBe("🚀"));

	it("scouting", () => expect(statusIcon("scouting")).toBe("🔍"));

	it("working", () => expect(statusIcon("working")).toBe("⚒️"));

	it("planning_recovery", () => expect(statusIcon("planning_recovery")).toBe("♻️"));

	it("reviewing", () => expect(statusIcon("reviewing")).toBe("🛡️"));

	it("task_done", () => expect(statusIcon("task_done")).toBe("✅"));

	it("done", () => expect(statusIcon("done")).toBe("✅"));

	it("failed", () => expect(statusIcon("failed")).toBe("❌"));

	it("budget_exceeded", () => expect(statusIcon("budget_exceeded")).toBe("💰"));

	it("unknown", () => expect(statusIcon("xyz")).toBe("🐜"));

	it("plain mode: launched", () => {
		process.env.OH_PI_PLAIN_ICONS = "1";
		expect(statusIcon("launched")).toBe("[>>]");
	});

	it("plain mode: scouting", () => {
		process.env.OH_PI_PLAIN_ICONS = "1";
		expect(statusIcon("scouting")).toBe("[?]");
	});

	it("plain mode: unknown", () => {
		process.env.OH_PI_PLAIN_ICONS = "1";
		expect(statusIcon("xyz")).toBe("[ant]");
	});
});

describe(statusLabel, () => {
	it("launched", () => expect(statusLabel("launched")).toBe("LAUNCHED"));

	it("scouting", () => expect(statusLabel("scouting")).toBe("SCOUTING"));

	it("planning_recovery", () => expect(statusLabel("planning_recovery")).toBe("PLANNING_RECOVERY"));

	it("task_done", () => expect(statusLabel("task_done")).toBe("TASK_DONE"));

	it("budget_exceeded", () => expect(statusLabel("budget_exceeded")).toBe("BUDGET_EXCEEDED"));

	it("unknown", () => expect(statusLabel("custom")).toBe("CUSTOM"));
});

describe(progressBar, () => {
	it("0%", () => expect(progressBar(0, 10)).toBe("[----------]"));

	it("50%", () => expect(progressBar(0.5, 10)).toBe("[#####-----]"));

	it("100%", () => expect(progressBar(1, 10)).toBe("[##########]"));
});

describe(casteIcon, () => {
	afterEach(() => {
		process.env.OH_PI_PLAIN_ICONS = "";
	});

	it("scout", () => expect(casteIcon("scout")).toBe("🔍"));

	it("soldier", () => expect(casteIcon("soldier")).toBe("🛡️"));

	it("drone", () => expect(casteIcon("drone")).toBe("⚙️"));

	it("worker", () => expect(casteIcon("worker")).toBe("⚒️"));

	it("unknown", () => expect(casteIcon("xyz")).toBe("⚒️"));

	it("plain mode: scout", () => {
		process.env.OH_PI_PLAIN_ICONS = "1";
		expect(casteIcon("scout")).toBe("[?]");
	});

	it("plain mode: worker", () => {
		process.env.OH_PI_PLAIN_ICONS = "1";
		expect(casteIcon("worker")).toBe("[w]");
	});
});

describe(antIcon, () => {
	afterEach(() => {
		process.env.OH_PI_PLAIN_ICONS = "";
	});

	it("emoji mode", () => expect(antIcon()).toBe("🐜"));

	it("plain mode", () => {
		process.env.OH_PI_PLAIN_ICONS = "1";
		expect(antIcon()).toBe("[ant]");
	});
});

describe("checkMark / crossMark", () => {
	afterEach(() => {
		process.env.OH_PI_PLAIN_ICONS = "";
	});

	it("emoji mode", () => {
		expect(checkMark()).toBe("✓");
		expect(crossMark()).toBe("✗");
	});

	it("plain mode", () => {
		process.env.OH_PI_PLAIN_ICONS = "1";
		expect(checkMark()).toBe("[ok]");
		expect(crossMark()).toBe("[x]");
	});
});

describe(boltIcon, () => {
	afterEach(() => {
		process.env.OH_PI_PLAIN_ICONS = "";
	});

	it("emoji mode", () => expect(boltIcon()).toBe("⚡"));

	it("plain mode", () => {
		process.env.OH_PI_PLAIN_ICONS = "1";
		expect(boltIcon()).toBe("!");
	});
});

describe(buildReport, () => {
	afterEach(() => {
		process.env.OH_PI_PLAIN_ICONS = "";
	});

	it("builds report with goal, status, cost, tasks", () => {
		const state: ColonyState = {
			ants: [],
			concurrency: { current: 2, history: [], max: 4, min: 1, optimal: 3 },
			createdAt: 0,
			finishedAt: 5000,
			goal: "Test goal",
			id: "c-1",
			maxCost: null,
			metrics: {
				antsSpawned: 2,
				startTime: 0,
				tasksDone: 1,
				tasksFailed: 1,
				tasksTotal: 2,
				throughputHistory: [],
				totalCost: 0.05,
				totalTokens: 1000,
			},
			modelOverrides: {},
			pheromones: [],
			status: "done",
			tasks: [
				{
					id: "t1",
					parentId: null,
					title: "Task A",
					description: "",
					caste: "worker",
					status: "done",
					priority: 3,
					files: [],
					claimedBy: null,
					result: null,
					error: null,
					spawnedTasks: [],
					createdAt: 0,
					startedAt: 0,
					finishedAt: 1000,
				},
				{
					id: "t2",
					parentId: null,
					title: "Task B",
					description: "",
					caste: "worker",
					status: "failed",
					priority: 3,
					files: [],
					claimedBy: null,
					result: null,
					error: "some error",
					spawnedTasks: [],
					createdAt: 0,
					startedAt: 0,
					finishedAt: 1000,
				},
			],
		};
		const report = buildReport(state);
		expect(report).toContain("Test goal");
		expect(report).toContain("✅");
		expect(report).toContain("$0.05");
		expect(report).toContain("Task A");
		expect(report).toContain("Task B");
		expect(report).toContain("some error");
	});

	it("builds plain report when OH_PI_PLAIN_ICONS is set", () => {
		process.env.OH_PI_PLAIN_ICONS = "1";
		const state: ColonyState = {
			ants: [],
			concurrency: { current: 1, history: [], max: 4, min: 1, optimal: 1 },
			createdAt: 0,
			finishedAt: 5000,
			goal: "Plain test",
			id: "c-2",
			maxCost: null,
			metrics: {
				antsSpawned: 1,
				startTime: 0,
				tasksDone: 1,
				tasksFailed: 0,
				tasksTotal: 1,
				throughputHistory: [],
				totalCost: 0.01,
				totalTokens: 500,
			},
			modelOverrides: {},
			pheromones: [],
			status: "done",
			tasks: [
				{
					id: "t1",
					parentId: null,
					title: "Task A",
					description: "",
					caste: "worker",
					status: "done",
					priority: 3,
					files: [],
					claimedBy: null,
					result: null,
					error: null,
					spawnedTasks: [],
					createdAt: 0,
					startedAt: 0,
					finishedAt: 1000,
				},
			],
		};
		const report = buildReport(state);
		expect(report).toContain("[ant]");
		expect(report).toContain("[ok]");
		expect(report).not.toContain("🐜");
		expect(report).not.toContain("✅");
	});
});
