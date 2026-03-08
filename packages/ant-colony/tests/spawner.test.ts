import { describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-coding-agent", () => ({
	AuthStorage: class {},
	createAgentSession: vi.fn(),
	createReadTool: vi.fn(),
	createBashTool: vi.fn(),
	createEditTool: vi.fn(),
	createWriteTool: vi.fn(),
	createGrepTool: vi.fn(),
	createFindTool: vi.fn(),
	createLsTool: vi.fn(),
	ModelRegistry: class {},
	SessionManager: { inMemory: vi.fn() },
	SettingsManager: { inMemory: vi.fn() },
	createExtensionRuntime: vi.fn(),
}));
vi.mock("@mariozechner/pi-ai", () => ({ getModel: vi.fn() }));

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Nest } from "../extensions/ant-colony/nest.js";
import { makeAntId, makePheromoneId, makeTaskId, runDrone } from "../extensions/ant-colony/spawner.js";
import type { ColonyState, Task } from "../extensions/ant-colony/types.js";

describe("makeAntId", () => {
	it("includes caste name", () => {
		expect(makeAntId("scout")).toContain("scout");
		expect(makeAntId("worker")).toContain("worker");
	});

	it("returns unique ids", () => {
		expect(makeAntId("worker")).not.toBe(makeAntId("worker"));
	});
});

describe("makePheromoneId", () => {
	it("starts with p-", () => {
		expect(makePheromoneId()).toMatch(/^p-/);
	});

	it("returns unique ids", () => {
		expect(makePheromoneId()).not.toBe(makePheromoneId());
	});
});

describe("makeTaskId", () => {
	it("starts with t-", () => {
		expect(makeTaskId()).toMatch(/^t-/);
	});

	it("returns unique ids", () => {
		expect(makeTaskId()).not.toBe(makeTaskId());
	});
});

const mkState = (overrides: Partial<ColonyState> = {}): ColonyState => ({
	id: "drone-test-colony",
	goal: "drone",
	status: "working",
	tasks: [],
	ants: [],
	pheromones: [],
	concurrency: { current: 1, min: 1, max: 2, optimal: 1, history: [] },
	metrics: {
		tasksTotal: 0,
		tasksDone: 0,
		tasksFailed: 0,
		antsSpawned: 0,
		totalCost: 0,
		totalTokens: 0,
		startTime: Date.now(),
		throughputHistory: [],
	},
	maxCost: null,
	modelOverrides: {},
	createdAt: Date.now(),
	finishedAt: null,
	...overrides,
});

const mkTask = (description: string): Task => ({
	id: makeTaskId(),
	parentId: null,
	title: "Drone task",
	description,
	caste: "drone",
	status: "pending",
	priority: 1,
	files: [],
	claimedBy: null,
	result: null,
	error: null,
	spawnedTasks: [],
	createdAt: Date.now(),
	startedAt: null,
	finishedAt: null,
});

describe("runDrone", () => {
	it("executes allowlisted commands", async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "drone-ok-"));
		const nest = new Nest(cwd, "drone-ok");
		const task = mkTask("node -e \"console.log('ok')\"");
		nest.init(mkState({ tasks: [task] }));

		const result = await runDrone(cwd, nest, task);
		expect(result.ant.status).toBe("done");
		expect(result.output).toContain("ok");
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it("rejects shell metacharacters", async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "drone-bad-"));
		const nest = new Nest(cwd, "drone-bad");
		const task = mkTask("echo hi && echo bye");
		nest.init(mkState({ tasks: [task] }));

		const result = await runDrone(cwd, nest, task);
		expect(result.ant.status).toBe("failed");
		expect(result.output).toContain("shell metacharacters");
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it("rejects non-allowlisted executables", async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "drone-no-allow-"));
		const nest = new Nest(cwd, "drone-no-allow");
		const task = mkTask("python -V");
		nest.init(mkState({ tasks: [task] }));

		const result = await runDrone(cwd, nest, task);
		expect(result.ant.status).toBe("failed");
		expect(result.output).toContain("not allowlisted");
		fs.rmSync(cwd, { recursive: true, force: true });
	});
});
