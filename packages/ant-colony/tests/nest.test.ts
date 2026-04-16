import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Nest } from "../extensions/ant-colony/nest.js";
import type { ColonyState, Pheromone } from "../extensions/ant-colony/types.js";

const mkState = (overrides: Partial<ColonyState> = {}): ColonyState => ({
	id: "test-colony",
	goal: "test",
	status: "working",
	tasks: [],
	ants: [],
	pheromones: [],
	concurrency: { current: 2, min: 1, max: 4, optimal: 3, history: [] },
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

const mkPheromone = (overrides: Partial<Pheromone> = {}): Pheromone => ({
	id: `p-${Math.random().toString(36).slice(2)}`,
	type: "warning",
	antId: "ant-1",
	antCaste: "worker",
	taskId: "t-1",
	content: "test",
	files: ["a.ts"],
	strength: 1.0,
	createdAt: Date.now(),
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
		fs.rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
});

describe("getStateLight", () => {
	it("returns state without triggering pheromone read", () => {
		nest.dropPheromone(mkPheromone());
		const light = nest.getStateLight();
		expect(light.id).toBe("test-colony");
		expect(light.tasks).toEqual([]);
		// pheromones should not be populated by getStateLight
		// (it returns stateCache which has empty pheromones from init)
	});

	it("includes tasks from cache", () => {
		nest.writeTask({
			id: "t-1",
			parentId: null,
			title: "Test",
			description: "desc",
			caste: "worker",
			status: "pending",
			priority: 3,
			files: [],
			claimedBy: null,
			result: null,
			error: null,
			spawnedTasks: [],
			createdAt: Date.now(),
			startedAt: null,
			finishedAt: null,
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
		nest.dropPheromone(mkPheromone({ type: "warning", files: ["a.ts"] }));
		nest.dropPheromone(mkPheromone({ type: "warning", files: ["a.ts"] }));
		nest.dropPheromone(mkPheromone({ type: "completion", files: ["a.ts"] }));
		expect(nest.countWarnings(["a.ts"])).toBe(2);
	});

	it("counts repellent pheromones", () => {
		nest.dropPheromone(mkPheromone({ type: "repellent", files: ["b.ts"] }));
		expect(nest.countWarnings(["b.ts"])).toBe(1);
	});

	it("returns 0 for unrelated files", () => {
		nest.dropPheromone(mkPheromone({ type: "warning", files: ["a.ts"] }));
		expect(nest.countWarnings(["c.ts"])).toBe(0);
	});
});

describe("pheromone dirty flag", () => {
	it("rebuilds index after dropPheromone", () => {
		nest.dropPheromone(mkPheromone({ type: "discovery", files: ["x.ts"] }));
		const pheromones = nest.getAllPheromones();
		expect(pheromones.length).toBe(1);
		expect(pheromones[0].type).toBe("discovery");
	});

	it("does not rebuild index when nothing changed", () => {
		nest.dropPheromone(mkPheromone({ files: ["x.ts"] }));
		nest.getAllPheromones(); // builds index, clears dirty
		// Second call should use cached index (no new data, no GC)
		const p2 = nest.getAllPheromones();
		expect(p2.length).toBe(1);
	});
});

describe("claimNextTask", () => {
	it("claims highest scored pending task", () => {
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
		nest.writeTask({
			id: "t-low",
			parentId: null,
			title: "Low",
			description: "",
			caste: "worker",
			status: "pending",
			priority: 5,
			files: [],
			claimedBy: null,
			result: null,
			error: null,
			spawnedTasks: [],
			createdAt: Date.now(),
			startedAt: null,
			finishedAt: null,
		});
		nest.writeTask({
			id: "t-high",
			parentId: null,
			title: "High",
			description: "",
			caste: "worker",
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
		expect(fs.existsSync(lockFile)).toBe(false);
		expect(nest.getStateLight().status).toBe("reviewing");
	});

	it("recovers from directory removal by recreating it", () => {
		fs.rmSync(nest.dir, { recursive: true, force: true });

		// The lock should recover by recreating the directory (robustness fix)
		expect(() => nest.updateState({ status: "reviewing" })).not.toThrow();
		expect(fs.existsSync(nest.dir)).toBe(true);
	});

	it("times out cleanly when another live process keeps the state lock", () => {
		const lockFile = (nest as { lockFile: string }).lockFile;
		fs.writeFileSync(lockFile, `${process.pid}:invalid`, "utf-8");
		const nowSpy = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(3_001);

		try {
			expect(() => nest.updateState({ status: "reviewing" })).toThrow(/withStateLock timeout/);
		} finally {
			nowSpy.mockRestore();
		}
	});
});
