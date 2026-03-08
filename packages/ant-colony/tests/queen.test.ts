import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { Nest } from "../extensions/ant-colony/nest.js";
import {
	classifyError,
	quorumMergeTasks,
	shouldUseScoutQuorum,
	validateExecutionPlan,
} from "../extensions/ant-colony/queen.js";
import type { ColonyState, Task } from "../extensions/ant-colony/types.js";

// ═══ classifyError ═══

describe("classifyError", () => {
	it("classifies TypeError", () => {
		expect(classifyError("TypeError: cannot read property 'x'")).toBe("type_error");
	});

	it("classifies TS errors", () => {
		expect(classifyError("TS2345: Argument of type")).toBe("type_error");
	});

	it("classifies permission errors", () => {
		expect(classifyError("EACCES: permission denied")).toBe("permission");
	});

	it("classifies 401", () => {
		expect(classifyError("Error: 401 Unauthorized")).toBe("permission");
	});

	it("classifies timeout", () => {
		expect(classifyError("Error: Timeout after 5000ms")).toBe("timeout");
	});

	it("classifies ETIMEDOUT", () => {
		expect(classifyError("connect ETIMEDOUT 1.2.3.4")).toBe("timeout");
	});

	it("classifies ENOENT", () => {
		expect(classifyError("ENOENT: no such file or directory")).toBe("not_found");
	});

	it("classifies Cannot find module", () => {
		expect(classifyError("Cannot find module './foo'")).toBe("not_found");
	});

	it("classifies syntax errors", () => {
		expect(classifyError("SyntaxError: Unexpected token")).toBe("syntax");
	});

	it("classifies rate limit", () => {
		expect(classifyError("Error: 429 Too Many Requests")).toBe("rate_limit");
	});

	it("returns unknown for unrecognized errors", () => {
		expect(classifyError("Something completely different")).toBe("unknown");
	});

	it("handles empty string", () => {
		expect(classifyError("")).toBe("unknown");
	});
});

describe("shouldUseScoutQuorum", () => {
	it("returns true for multi-step goals", () => {
		expect(shouldUseScoutQuorum("1) scan repo; 2) write report; 3) review output")).toBe(true);
	});

	it("returns false for simple single-step goals", () => {
		expect(shouldUseScoutQuorum("List top-level files")).toBe(false);
	});
});

describe("validateExecutionPlan", () => {
	it("accepts well-formed worker tasks", () => {
		const plan = validateExecutionPlan([
			mkTask({ id: "t-plan-1", caste: "worker", title: "Do x", description: "desc", priority: 1, files: ["a.ts"] }),
		]);
		expect(plan.ok).toBe(true);
		expect(plan.issues).toEqual([]);
	});

	it("rejects empty plans", () => {
		const plan = validateExecutionPlan([]);
		expect(plan.ok).toBe(false);
		expect(plan.issues).toContain("no_pending_worker_tasks");
	});

	it("flags non-worker cates as invalid for execution phase", () => {
		const plan = validateExecutionPlan([mkTask({ id: "t-plan-2", caste: "scout" as any })]);
		expect(plan.ok).toBe(false);
		expect(plan.issues.some((i) => i.includes("invalid_caste"))).toBe(true);
	});
});

// ═══ quorumMergeTasks ═══

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

const mkTask = (overrides: Partial<Task> = {}): Task => ({
	id: `t-${Math.random().toString(36).slice(2)}`,
	parentId: null,
	title: "Test task",
	description: "Do something",
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
	...overrides,
});

let tmpDir: string;
let nest: Nest;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "queen-test-"));
	nest = new Nest(tmpDir, "test-colony");
	nest.init(mkState());
});

afterEach(() => {
	try {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
});

describe("quorumMergeTasks", () => {
	it("does nothing with 0-1 tasks", () => {
		const t1 = mkTask({ files: ["a.ts"], priority: 3 });
		nest.writeTask(t1);
		quorumMergeTasks(nest);
		const tasks = nest.getAllTasks().filter((t) => t.status === "pending");
		expect(tasks).toHaveLength(1);
	});

	it("merges duplicate tasks with same files", () => {
		const t1 = mkTask({ id: "t-1", title: "Fix auth", files: ["a.ts", "b.ts"], priority: 3 });
		const t2 = mkTask({ id: "t-2", title: "Fix auth v2", files: ["a.ts", "b.ts"], priority: 3 });
		nest.writeTask(t1);
		nest.writeTask(t2);
		quorumMergeTasks(nest);
		const pending = nest.getAllTasks().filter((t) => t.status === "pending");
		const done = nest.getAllTasks().filter((t) => t.status === "done");
		expect(pending).toHaveLength(1);
		expect(done).toHaveLength(1);
		expect(done[0].result).toContain("quorum");
	});

	it("boosts priority of merged task", () => {
		const t1 = mkTask({ id: "t-1", files: ["x.ts"], priority: 3 });
		const t2 = mkTask({ id: "t-2", files: ["x.ts"], priority: 3 });
		nest.writeTask(t1);
		nest.writeTask(t2);
		quorumMergeTasks(nest);
		const pending = nest.getAllTasks().filter((t) => t.status === "pending");
		expect(pending[0].priority).toBe(2); // boosted from 3 to 2
	});

	it("does not merge tasks with different files", () => {
		const t1 = mkTask({ id: "t-1", files: ["a.ts"] });
		const t2 = mkTask({ id: "t-2", files: ["b.ts"] });
		nest.writeTask(t1);
		nest.writeTask(t2);
		quorumMergeTasks(nest);
		const pending = nest.getAllTasks().filter((t) => t.status === "pending");
		expect(pending).toHaveLength(2);
	});

	it("merges context from duplicate tasks", () => {
		const t1 = mkTask({ id: "t-1", files: ["a.ts"], context: "context A" });
		const t2 = mkTask({ id: "t-2", files: ["a.ts"], context: "context B" });
		nest.writeTask(t1);
		nest.writeTask(t2);
		quorumMergeTasks(nest);
		const pending = nest.getAllTasks().filter((t) => t.status === "pending");
		expect(pending[0].context).toContain("context A");
		expect(pending[0].context).toContain("context B");
	});

	it("handles three duplicates", () => {
		const t1 = mkTask({ id: "t-1", files: ["a.ts"], priority: 4 });
		const t2 = mkTask({ id: "t-2", files: ["a.ts"], priority: 4 });
		const t3 = mkTask({ id: "t-3", files: ["a.ts"], priority: 4 });
		nest.writeTask(t1);
		nest.writeTask(t2);
		nest.writeTask(t3);
		quorumMergeTasks(nest);
		const pending = nest.getAllTasks().filter((t) => t.status === "pending");
		const done = nest.getAllTasks().filter((t) => t.status === "done");
		expect(pending).toHaveLength(1);
		expect(done).toHaveLength(2);
		expect(pending[0].priority).toBe(3); // boosted from 4 to 3
	});

	it("skips non-pending tasks", () => {
		const t1 = mkTask({ id: "t-1", files: ["a.ts"], status: "done" });
		const t2 = mkTask({ id: "t-2", files: ["a.ts"], status: "pending" });
		nest.writeTask(t1);
		nest.writeTask(t2);
		quorumMergeTasks(nest);
		// Only 1 pending, so no merge
		const pending = nest.getAllTasks().filter((t) => t.status === "pending");
		expect(pending).toHaveLength(1);
	});

	it("does not boost priority below 1", () => {
		const t1 = mkTask({ id: "t-1", files: ["a.ts"], priority: 1 });
		const t2 = mkTask({ id: "t-2", files: ["a.ts"], priority: 1 });
		nest.writeTask(t1);
		nest.writeTask(t2);
		quorumMergeTasks(nest);
		const pending = nest.getAllTasks().filter((t) => t.status === "pending");
		expect(pending[0].priority).toBe(1); // stays at 1
	});
});
