

vi.mock<typeof import('@mariozechner/pi-coding-agent')>(import('@mariozechner/pi-coding-agent'), () => ({
	AuthStorage: class {},
	ModelRegistry: class {},
	SessionManager: { inMemory: vi.fn() },
	SettingsManager: { inMemory: vi.fn() },
	createAgentSession: vi.fn(),
	createBashTool: vi.fn(),
	createEditTool: vi.fn(),
	createExtensionRuntime: vi.fn(),
	createFindTool: vi.fn(),
	createGrepTool: vi.fn(),
	createLsTool: vi.fn(),
	createReadTool: vi.fn(),
	createWriteTool: vi.fn(),
	getAgentDir: () => "/mock-home/.pi/agent",
}));
vi.mock<typeof import('@mariozechner/pi-ai')>(import('@mariozechner/pi-ai'), () => ({ getModel: vi.fn() }));

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Nest } from "../extensions/ant-colony/nest.js";
import { makeAntId, makePheromoneId, makeTaskId, runDrone } from "../extensions/ant-colony/spawner.js";
import type { ColonyState, Task } from "../extensions/ant-colony/types.js";

describe(makeAntId, () => {
	it("includes caste name", () => {
		expect(makeAntId("scout")).toContain("scout");
		expect(makeAntId("worker")).toContain("worker");
	});

	it("returns unique ids", () => {
		expect(makeAntId("worker")).not.toBe(makeAntId("worker"));
	});
});

describe(makePheromoneId, () => {
	it("starts with p-", () => {
		expect(makePheromoneId()).toMatch(/^p-/);
	});

	it("returns unique ids", () => {
		expect(makePheromoneId()).not.toBe(makePheromoneId());
	});
});

describe(makeTaskId, () => {
	it("starts with t-", () => {
		expect(makeTaskId()).toMatch(/^t-/);
	});

	it("returns unique ids", () => {
		expect(makeTaskId()).not.toBe(makeTaskId());
	});
});

const mkState = (overrides: Partial<ColonyState> = {}): ColonyState => ({
	ants: [],
	concurrency: { current: 1, history: [], max: 2, min: 1, optimal: 1 },
	createdAt: Date.now(),
	finishedAt: null,
	goal: "drone",
	id: "drone-test-colony",
	maxCost: null,
	metrics: {
		antsSpawned: 0,
		startTime: Date.now(),
		tasksDone: 0,
		tasksFailed: 0,
		tasksTotal: 0,
		throughputHistory: [],
		totalCost: 0,
		totalTokens: 0,
	},
	modelOverrides: {},
	pheromones: [],
	status: "working",
	tasks: [],
	...overrides,
});

const mkTask = (description: string): Task => ({
	caste: "drone",
	claimedBy: null,
	createdAt: Date.now(),
	description,
	error: null,
	files: [],
	finishedAt: null,
	id: makeTaskId(),
	parentId: null,
	priority: 1,
	result: null,
	spawnedTasks: [],
	startedAt: null,
	status: "pending",
	title: "Drone task",
});

describe(runDrone, () => {
	it("executes allowlisted commands", async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "drone-ok-"));
		const nest = new Nest(cwd, "drone-ok", { mode: "project" });
		const task = mkTask("node -e \"console.log('ok')\"");
		nest.init(mkState({ tasks: [task] }));

		const result = await runDrone(cwd, nest, task);
		expect(result.ant.status).toBe("done");
		expect(result.output).toContain("ok");
		fs.rmSync(cwd, { force: true, recursive: true });
	});

	it("rejects shell metacharacters", async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "drone-bad-"));
		const nest = new Nest(cwd, "drone-bad", { mode: "project" });
		const task = mkTask("echo hi && echo bye");
		nest.init(mkState({ tasks: [task] }));

		const result = await runDrone(cwd, nest, task);
		expect(result.ant.status).toBe("failed");
		expect(result.output).toContain("shell metacharacters");
		fs.rmSync(cwd, { force: true, recursive: true });
	});

	it("rejects non-allowlisted executables", async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "drone-no-allow-"));
		const nest = new Nest(cwd, "drone-no-allow", { mode: "project" });
		const task = mkTask("python -V");
		nest.init(mkState({ tasks: [task] }));

		const result = await runDrone(cwd, nest, task);
		expect(result.ant.status).toBe("failed");
		expect(result.output).toContain("not allowlisted");
		fs.rmSync(cwd, { force: true, recursive: true });
	});
});
