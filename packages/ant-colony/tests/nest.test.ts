import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Nest } from "../extensions/ant-colony/nest.js";
import type { ColonyState, Pheromone } from "../extensions/ant-colony/types.js";

const mkState = (overrides: Partial<ColonyState> = {}): ColonyState => ({
	ants: [],
	concurrency: { current: 2, history: [], max: 4, min: 1, optimal: 3 },
	createdAt: Date.now(),
	finishedAt: null,
	goal: "test",
	id: "test-colony",
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

const mkPheromone = (overrides: Partial<Pheromone> = {}): Pheromone => ({
	antCaste: "worker",
	antId: "ant-1",
	content: "test",
	createdAt: Date.now(),
	files: ["a.ts"],
	id: `p-${Math.random().toString(36).slice(2)}`,
	strength: 1.0,
	taskId: "t-1",
	type: "warning",
	...overrides,
});

let tmpDir: string;
let nest: Nest;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nest-test-"));
	nest = new Nest(tmpDir, "test-colony", { mode: "project" });
	nest.init(mkState());
});

afterEach(() => {
	try {
		fs.rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		/* Ignore */
	}
});

describe("getStateLight", () => {
	it("returns state without triggering pheromone read", () => {
		nest.dropPheromone(mkPheromone());
		const light = nest.getStateLight();
		expect(light.id).toBe("test-colony");
		expect(light.tasks).toStrictEqual([]);
		// Pheromones should not be populated by getStateLight
		// (it returns stateCache which has empty pheromones from init)
	});

	it("includes tasks from cache", () => {
		nest.writeTask({
			caste: "worker",
			claimedBy: null,
			createdAt: Date.now(),
			description: "desc",
			error: null,
			files: [],
			finishedAt: null,
			id: "t-1",
			parentId: null,
			priority: 3,
			result: null,
			spawnedTasks: [],
			startedAt: null,
			status: "pending",
			title: "Test",
		});
		const light = nest.getStateLight();
		expect(light.tasks).toHaveLength(1);
		expect(light.tasks[0].id).toBe("t-1");
	});
});

describe("countWarnings", () => {
	it("returns 0 when no pheromones", () => {
		expect(nest.countWarnings(["a.ts"])).toBe(0);
	});

	it("counts warning pheromones for matching files", () => {
		nest.dropPheromone(mkPheromone({ files: ["a.ts"], type: "warning" }));
		nest.dropPheromone(mkPheromone({ files: ["a.ts"], type: "warning" }));
		nest.dropPheromone(mkPheromone({ files: ["a.ts"], type: "completion" }));
		expect(nest.countWarnings(["a.ts"])).toBe(2);
	});

	it("counts repellent pheromones", () => {
		nest.dropPheromone(mkPheromone({ files: ["b.ts"], type: "repellent" }));
		expect(nest.countWarnings(["b.ts"])).toBe(1);
	});

	it("returns 0 for unrelated files", () => {
		nest.dropPheromone(mkPheromone({ files: ["a.ts"], type: "warning" }));
		expect(nest.countWarnings(["c.ts"])).toBe(0);
	});
});

describe("pheromone dirty flag", () => {
	it("rebuilds index after dropPheromone", () => {
		nest.dropPheromone(mkPheromone({ files: ["x.ts"], type: "discovery" }));
		const pheromones = nest.getAllPheromones();
		expect(pheromones).toHaveLength(1);
		expect(pheromones[0].type).toBe("discovery");
	});

	it("does not rebuild index when nothing changed", () => {
		nest.dropPheromone(mkPheromone({ files: ["x.ts"] }));
		nest.getAllPheromones(); // Builds index, clears dirty
		// Second call should use cached index (no new data, no GC)
		const p2 = nest.getAllPheromones();
		expect(p2).toHaveLength(1);
	});
});

describe("claimNextTask", () => {
	it("claims highest scored pending task", () => {
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
		nest.writeTask({
			caste: "worker",
			claimedBy: null,
			createdAt: Date.now(),
			description: "",
			error: null,
			files: [],
			finishedAt: null,
			id: "t-low",
			parentId: null,
			priority: 5,
			result: null,
			spawnedTasks: [],
			startedAt: null,
			status: "pending",
			title: "Low",
		});
		nest.writeTask({
			caste: "worker",
			claimedBy: null,
			createdAt: Date.now(),
			description: "",
			error: null,
			files: [],
			finishedAt: null,
			id: "t-high",
			parentId: null,
			priority: 1,
			result: null,
			spawnedTasks: [],
			startedAt: null,
			status: "pending",
			title: "High",
		});
		try {
			const claimed = nest.claimNextTask("worker", "ant-1");
			expect(claimed).not.toBeNull();
			expect(claimed!.id).toBe("t-high");
			expect(claimed!.status).toBe("claimed");
		} finally {
			randomSpy.mockRestore();
		}
	});

	it("returns null when no pending tasks", () => {
		expect(nest.claimNextTask("worker", "ant-1")).toBeNull();
	});
});

describe("withStateLock spin", () => {
	it("updateState works under normal conditions", () => {
		nest.updateState({ status: "reviewing" });
		const state = nest.getStateLight();
		expect(state.status).toBe("reviewing");
	});

	it("breaks a stale lock and retries instead of timing out", () => {
		const lockFile = (nest as any).lockFile as string;
		fs.writeFileSync(lockFile, `999999:${Date.now()}`);

		expect(() => nest.updateState({ status: "reviewing" })).not.toThrow();
		expect(fs.existsSync(lockFile)).toBeFalsy();
		expect(nest.getStateLight().status).toBe("reviewing");
	});

	it("recovers from directory removal by recreating it", () => {
		fs.rmSync(nest.dir, { force: true, recursive: true });

		// The lock should recover by recreating the directory (robustness fix)
		expect(() => nest.updateState({ status: "reviewing" })).not.toThrow();
		expect(fs.existsSync(nest.dir)).toBeTruthy();
	});

	it("times out cleanly when another live process keeps the state lock", () => {
		const { lockFile } = nest as { lockFile: string };
		fs.writeFileSync(lockFile, `${process.pid}:invalid`, "utf8");
		const nowSpy = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(3001);

		try {
			expect(() => nest.updateState({ status: "reviewing" })).toThrow(/withStateLock timeout/);
		} finally {
			nowSpy.mockRestore();
		}
	});
});
