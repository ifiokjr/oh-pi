import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";


const childProcessMocks = vi.hoisted(() => ({
	execFileSync: vi.fn(),
}));

vi.mock<typeof import('node:child_process')>(import('node:child_process'), () => ({
	execFileSync: childProcessMocks.execFileSync,
}));

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

import { Nest } from "../extensions/ant-colony/nest.js";
import {
	classifyError,
	collectReviewTypecheckProjects,
	createUsageLimitsTracker,
	decidePromoteOrFinalize,
	makeColonyId,
	quorumMergeTasks,
	resolveReviewTypecheckInvocation,
	runReviewTypecheck,
	shouldUseScoutQuorum,
	validateExecutionPlan,
} from "../extensions/ant-colony/queen.js";
import type { ColonyState, Task } from "../extensions/ant-colony/types.js";

// ═══ classifyError ═══

describe(classifyError, () => {
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

describe(shouldUseScoutQuorum, () => {
	it("returns true for multi-step goals", () => {
		expect(shouldUseScoutQuorum("1) scan repo; 2) write report; 3) review output")).toBeTruthy();
	});

	it("returns false for simple single-step goals", () => {
		expect(shouldUseScoutQuorum("List top-level files")).toBeFalsy();
	});
});

describe(decidePromoteOrFinalize, () => {
	it("finalizes when all thresholds and guards pass", () => {
		const decision = decidePromoteOrFinalize({
			cheapPassSummary: "cheap-pass: parsed 12 files",
			confidenceScore: 0.82,
			coverageScore: 0.9,
			policyViolations: [],
			riskFlags: [],
			sloBreached: false,
		});

		expect(decision).toStrictEqual({
			action: "finalize",
			escalationReasons: [],
		});
	});

	it("promotes with machine-readable escalation reasons and cheap-pass context", () => {
		const decision = decidePromoteOrFinalize({
			cheapPassSummary: "cheap-pass",
			confidenceScore: 0.7,
			coverageScore: 0.8,
			policyViolations: ["disallowed_tool"],
			riskFlags: ["pii_detected"],
			sloBreached: true,
		});

		expect(decision.action).toBe("promote");
		expect(decision.escalationReasons).toStrictEqual([
			"low_confidence",
			"low_coverage",
			"risk_flag",
			"policy_violation",
			"slo_breach",
		]);
		expect(decision.cheapPassSummary).toBe("cheap-pass");
	});
});

describe(validateExecutionPlan, () => {
	it("accepts well-formed worker tasks", () => {
		const plan = validateExecutionPlan([
			mkTask({ caste: "worker", description: "desc", files: ["a.ts"], id: "t-plan-1", priority: 1, title: "Do x" }),
		]);
		expect(plan.ok).toBeTruthy();
		expect(plan.issues).toStrictEqual([]);
	});

	it("rejects empty plans", () => {
		const plan = validateExecutionPlan([]);
		expect(plan.ok).toBeFalsy();
		expect(plan.issues).toContain("no_pending_worker_tasks");
	});

	it("flags non-worker cates as invalid for execution phase", () => {
		const plan = validateExecutionPlan([mkTask({ caste: "scout" as any, id: "t-plan-2" })]);
		expect(plan.ok).toBeFalsy();
		expect(plan.issues.some((i) => i.includes("invalid_caste"))).toBeTruthy();
	});
});

describe(createUsageLimitsTracker, () => {
	it("returns a no-op tracker when no event bus is provided", () => {
		const tracker = createUsageLimitsTracker();
		expect(tracker.requestSnapshot()).toBeNull();
		expect(() => tracker.dispose()).not.toThrow();
	});

	it("supports event buses without off()", () => {
		const handlers: ((data: unknown) => void)[] = [];
		const bus = {
			emit(event: string) {
				if (event === "usage:query") {
					for (const handler of handlers) {
						handler({ sessionCost: 1.25, providers: {}, perModel: {} });
					}
				}
			},
			on(_event: string, handler: (data: unknown) => void) {
				handlers.push(handler);
			},
		};

		const tracker = createUsageLimitsTracker(bus);
		const snapshot = tracker.requestSnapshot();
		expect(snapshot?.sessionCost).toBe(1.25);
		expect(() => tracker.dispose()).not.toThrow();
	});

	it("does not re-subscribe the same tracker after dispose when off() is unavailable", () => {
		const on = vi.fn();
		const emit = vi.fn();
		const tracker = createUsageLimitsTracker({ emit, on });

		tracker.requestSnapshot();
		tracker.dispose();
		tracker.requestSnapshot();

		expect(on).toHaveBeenCalledOnce();
		expect(emit).toHaveBeenCalledTimes(2);
	});

	it("unsubscribes when off() is available", () => {
		const on = vi.fn();
		const emit = vi.fn();
		const off = vi.fn();
		const tracker = createUsageLimitsTracker({ emit, off, on });
		tracker.requestSnapshot();
		tracker.dispose();
		expect(off).toHaveBeenCalledWith("usage:limits", expect.any(Function));
	});
});

describe("review typecheck helpers", () => {
	it("collects nearest project files for changed TypeScript tasks", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "queen-typecheck-projects-"));
		const packageDir = path.join(root, "packages", "feature");
		fs.mkdirSync(path.join(packageDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(packageDir, "tsconfig.json"), "{}", "utf8");

		const projects = collectReviewTypecheckProjects(root, [
			mkTask({ files: ["packages/feature/src/index.ts"] }),
			mkTask({ files: ["README.md"] }),
		]);

		expect(projects).toStrictEqual([path.join(packageDir, "tsconfig.json")]);
		fs.rmSync(root, { force: true, recursive: true });
	});

	it("skips review typecheck when no TypeScript files were changed", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "queen-typecheck-skip-"));
		fs.writeFileSync(path.join(root, "tsconfig.json"), "{}", "utf8");

		expect(collectReviewTypecheckProjects(root, [mkTask({ files: ["README.md"] })])).toStrictEqual([]);
		expect(resolveReviewTypecheckInvocation(root, [mkTask({ files: ["README.md"] })])).toBeNull();
		fs.rmSync(root, { force: true, recursive: true });
	});

	it("prefers the nearest nested project when multiple configs exist", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "queen-typecheck-nested-"));
		const packageDir = path.join(root, "packages", "feature");
		const srcDir = path.join(packageDir, "src");
		fs.mkdirSync(srcDir, { recursive: true });
		fs.writeFileSync(path.join(root, "tsconfig.json"), "{}", "utf8");
		fs.writeFileSync(path.join(packageDir, "tsconfig.json"), "{}", "utf8");

		const projects = collectReviewTypecheckProjects(root, [mkTask({ files: ["packages/feature/src/index.ts"] })]);

		expect(projects).toStrictEqual([path.join(packageDir, "tsconfig.json")]);
		fs.rmSync(root, { force: true, recursive: true });
	});

	it("falls back to npx tsc when no local binary exists", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "queen-typecheck-npx-"));
		fs.writeFileSync(path.join(root, "tsconfig.json"), "{}", "utf8");

		const invocation = resolveReviewTypecheckInvocation(root, [mkTask({ files: ["src/index.ts"] })]);

		expect(invocation?.command).toBe("npx");
		expect(invocation?.args.slice(0, 2)).toStrictEqual(["tsc", "--noEmit"]);
		fs.rmSync(root, { force: true, recursive: true });
	});

	it("prefers the local tsc binary when the workspace already has dependencies installed", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "queen-typecheck-local-bin-"));
		fs.mkdirSync(path.join(root, "node_modules", ".bin"), { recursive: true });
		fs.writeFileSync(path.join(root, "tsconfig.json"), "{}", "utf8");
		fs.writeFileSync(path.join(root, "node_modules", ".bin", "tsc"), "#!/bin/sh\n", "utf8");

		const invocation = resolveReviewTypecheckInvocation(root, [mkTask({ files: ["src/index.ts"] })]);

		expect(invocation?.command).toContain(path.join("node_modules", ".bin", "tsc"));
		expect(invocation?.args).toContain(path.join(root, "tsconfig.json"));
		fs.rmSync(root, { force: true, recursive: true });
	});

	it("returns true when typecheck succeeds and false when it fails", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "queen-typecheck-run-"));
		fs.writeFileSync(path.join(root, "tsconfig.json"), "{}", "utf8");

		childProcessMocks.execFileSync.mockReturnValueOnce(Buffer.from("ok"));
		expect(runReviewTypecheck(root, [mkTask({ files: ["src/index.ts"] })])).toBeTruthy();
		expect(childProcessMocks.execFileSync).toHaveBeenCalledWith(
			"npx",
			expect.arrayContaining(["tsc", "--noEmit", "--project", path.join(root, "tsconfig.json")]),
			expect.objectContaining({ cwd: root, stdio: "pipe" }),
		);

		childProcessMocks.execFileSync.mockImplementationOnce(() => {
			throw new Error("boom");
		});
		expect(runReviewTypecheck(root, [mkTask({ files: ["src/index.ts"] })])).toBeFalsy();
		expect(runReviewTypecheck(root, [mkTask({ files: ["README.md"] })])).toBeTruthy();
		fs.rmSync(root, { force: true, recursive: true });
	});
});

describe(makeColonyId, () => {
	it("adds entropy so ids do not collide within the same millisecond", () => {
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(123_456_789);
		const randomSpy = vi.spyOn(Math, "random").mockReturnValueOnce(0.111_11).mockReturnValueOnce(0.222_22);

		try {
			const first = makeColonyId();
			const second = makeColonyId();

			expect(first).toMatch(/^colony-/);
			expect(second).toMatch(/^colony-/);
			expect(first).not.toBe(second);
		} finally {
			nowSpy.mockRestore();
			randomSpy.mockRestore();
		}
	});
});

// ═══ quorumMergeTasks ═══

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

const mkTask = (overrides: Partial<Task> = {}): Task => ({
	caste: "worker",
	claimedBy: null,
	createdAt: Date.now(),
	description: "Do something",
	error: null,
	files: [],
	finishedAt: null,
	id: `t-${Math.random().toString(36).slice(2)}`,
	parentId: null,
	priority: 3,
	result: null,
	spawnedTasks: [],
	startedAt: null,
	status: "pending",
	title: "Test task",
	...overrides,
});

let tmpDir: string;
let nest: Nest;

beforeEach(() => {
	childProcessMocks.execFileSync.mockReset();
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "queen-test-"));
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

describe(quorumMergeTasks, () => {
	it("does nothing with 0-1 tasks", () => {
		const t1 = mkTask({ files: ["a.ts"], priority: 3 });
		nest.writeTask(t1);
		quorumMergeTasks(nest);
		const tasks = nest.getAllTasks().filter((t) => t.status === "pending");
		expect(tasks).toHaveLength(1);
	});

	it("merges duplicate tasks with same files", () => {
		const t1 = mkTask({ files: ["a.ts", "b.ts"], id: "t-1", priority: 3, title: "Fix auth" });
		const t2 = mkTask({ files: ["a.ts", "b.ts"], id: "t-2", priority: 3, title: "Fix auth v2" });
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
		const t1 = mkTask({ files: ["x.ts"], id: "t-1", priority: 3 });
		const t2 = mkTask({ files: ["x.ts"], id: "t-2", priority: 3 });
		nest.writeTask(t1);
		nest.writeTask(t2);
		quorumMergeTasks(nest);
		const pending = nest.getAllTasks().filter((t) => t.status === "pending");
		expect(pending[0].priority).toBe(2); // Boosted from 3 to 2
	});

	it("does not merge tasks with different files", () => {
		const t1 = mkTask({ files: ["a.ts"], id: "t-1" });
		const t2 = mkTask({ files: ["b.ts"], id: "t-2" });
		nest.writeTask(t1);
		nest.writeTask(t2);
		quorumMergeTasks(nest);
		const pending = nest.getAllTasks().filter((t) => t.status === "pending");
		expect(pending).toHaveLength(2);
	});

	it("merges context from duplicate tasks", () => {
		const t1 = mkTask({ context: "context A", files: ["a.ts"], id: "t-1" });
		const t2 = mkTask({ context: "context B", files: ["a.ts"], id: "t-2" });
		nest.writeTask(t1);
		nest.writeTask(t2);
		quorumMergeTasks(nest);
		const pending = nest.getAllTasks().filter((t) => t.status === "pending");
		expect(pending[0].context).toContain("context A");
		expect(pending[0].context).toContain("context B");
	});

	it("handles three duplicates", () => {
		const t1 = mkTask({ files: ["a.ts"], id: "t-1", priority: 4 });
		const t2 = mkTask({ files: ["a.ts"], id: "t-2", priority: 4 });
		const t3 = mkTask({ files: ["a.ts"], id: "t-3", priority: 4 });
		nest.writeTask(t1);
		nest.writeTask(t2);
		nest.writeTask(t3);
		quorumMergeTasks(nest);
		const pending = nest.getAllTasks().filter((t) => t.status === "pending");
		const done = nest.getAllTasks().filter((t) => t.status === "done");
		expect(pending).toHaveLength(1);
		expect(done).toHaveLength(2);
		expect(pending[0].priority).toBe(3); // Boosted from 4 to 3
	});

	it("skips non-pending tasks", () => {
		const t1 = mkTask({ files: ["a.ts"], id: "t-1", status: "done" });
		const t2 = mkTask({ files: ["a.ts"], id: "t-2", status: "pending" });
		nest.writeTask(t1);
		nest.writeTask(t2);
		quorumMergeTasks(nest);
		// Only 1 pending, so no merge
		const pending = nest.getAllTasks().filter((t) => t.status === "pending");
		expect(pending).toHaveLength(1);
	});

	it("does not boost priority below 1", () => {
		const t1 = mkTask({ files: ["a.ts"], id: "t-1", priority: 1 });
		const t2 = mkTask({ files: ["a.ts"], id: "t-2", priority: 1 });
		nest.writeTask(t1);
		nest.writeTask(t2);
		quorumMergeTasks(nest);
		const pending = nest.getAllTasks().filter((t) => t.status === "pending");
		expect(pending[0].priority).toBe(1); // Stays at 1
	});
});
