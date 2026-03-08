import { describe, expect, it } from "vitest";
import type { ColonyState } from "../extensions/ant-colony/types.js";
import {
	buildReport,
	casteIcon,
	formatCost,
	formatDuration,
	formatTokens,
	progressBar,
	statusIcon,
	statusLabel,
} from "../extensions/ant-colony/ui.js";

describe("formatDuration", () => {
	it("0ms", () => expect(formatDuration(0)).toBe("0s"));
	it("5000ms", () => expect(formatDuration(5000)).toBe("5s"));
	it("59000ms", () => expect(formatDuration(59000)).toBe("59s"));
	it("60000ms", () => expect(formatDuration(60000)).toBe("1m0s"));
	it("90000ms", () => expect(formatDuration(90000)).toBe("1m30s"));
});

describe("formatCost", () => {
	it("0.001", () => expect(formatCost(0.001)).toBe("$0.0010"));
	it("0.009", () => expect(formatCost(0.009)).toBe("$0.0090"));
	it("0.01", () => expect(formatCost(0.01)).toBe("$0.01"));
	it("1.5", () => expect(formatCost(1.5)).toBe("$1.50"));
});

describe("formatTokens", () => {
	it("500", () => expect(formatTokens(500)).toBe("500"));
	it("999", () => expect(formatTokens(999)).toBe("999"));
	it("1500", () => expect(formatTokens(1500)).toBe("1.5k"));
	it("1500000", () => expect(formatTokens(1500000)).toBe("1.5M"));
});

describe("statusIcon", () => {
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
});

describe("statusLabel", () => {
	it("launched", () => expect(statusLabel("launched")).toBe("LAUNCHED"));
	it("scouting", () => expect(statusLabel("scouting")).toBe("SCOUTING"));
	it("planning_recovery", () => expect(statusLabel("planning_recovery")).toBe("PLANNING_RECOVERY"));
	it("task_done", () => expect(statusLabel("task_done")).toBe("TASK_DONE"));
	it("budget_exceeded", () => expect(statusLabel("budget_exceeded")).toBe("BUDGET_EXCEEDED"));
	it("unknown", () => expect(statusLabel("custom")).toBe("CUSTOM"));
});

describe("progressBar", () => {
	it("0%", () => expect(progressBar(0, 10)).toBe("[----------]"));
	it("50%", () => expect(progressBar(0.5, 10)).toBe("[#####-----]"));
	it("100%", () => expect(progressBar(1, 10)).toBe("[##########]"));
});

describe("casteIcon", () => {
	it("scout", () => expect(casteIcon("scout")).toBe("🔍"));
	it("soldier", () => expect(casteIcon("soldier")).toBe("🛡️"));
	it("drone", () => expect(casteIcon("drone")).toBe("⚙️"));
	it("worker", () => expect(casteIcon("worker")).toBe("⚒️"));
	it("unknown", () => expect(casteIcon("xyz")).toBe("⚒️"));
});

describe("buildReport", () => {
	it("builds report with goal, status, cost, tasks", () => {
		const state: ColonyState = {
			id: "c-1",
			goal: "Test goal",
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
			ants: [],
			pheromones: [],
			concurrency: { current: 2, min: 1, max: 4, optimal: 3, history: [] },
			metrics: {
				tasksTotal: 2,
				tasksDone: 1,
				tasksFailed: 1,
				antsSpawned: 2,
				totalCost: 0.05,
				totalTokens: 1000,
				startTime: 0,
				throughputHistory: [],
			},
			maxCost: null,
			modelOverrides: {},
			createdAt: 0,
			finishedAt: 5000,
		};
		const report = buildReport(state);
		expect(report).toContain("Test goal");
		expect(report).toContain("✅");
		expect(report).toContain("$0.05");
		expect(report).toContain("Task A");
		expect(report).toContain("Task B");
		expect(report).toContain("some error");
	});
});
