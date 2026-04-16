import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
	execFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	execFileSync: childProcessMocks.execFileSync,
}));

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
	getAgentDir: () => "/mock-home/.pi/agent",
}));
vi.mock("@mariozechner/pi-ai", () => ({ getModel: vi.fn() }));

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

describe("decidePromoteOrFinalize", () => {
	it("finalizes when all thresholds and guards pass", () => {
		const decision = decidePromoteOrFinalize({
			confidenceScore: 0.82,
			coverageScore: 0.9,
			riskFlags: [],
			policyViolations: [],
			sloBreached: false,
			cheapPassSummary: "cheap-pass: parsed 12 files",
		});

		expect(decision).toEqual({
			action: "finalize",
			escalationReasons: [],
		});
	});

	it("promotes with machine-readable escalation reasons and cheap-pass context", () => {
		const decision = decidePromoteOrFinalize({
			confidenceScore: 0.7,
			coverageScore: 0.8,
			riskFlags: ["pii_detected"],
			policyViolations: ["disallowed_tool"],
			sloBreached: true,
			cheapPassSummary: "cheap-pass",
		});

		expect(decision.action).toBe("promote");
		expect(decision.escalationReasons).toEqual([
			"low_confidence",
			"low_coverage",
			"risk_flag",
			"policy_violation",
			"slo_breach",
		]);
		expect(decision.cheapPassSummary).toBe("cheap-pass");
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

describe("createUsageLimitsTracker", () => {
	it("returns a no-op tracker when no event bus is provided", () => {
		const tracker = createUsageLimitsTracker();
		expect(tracker.requestSnapshot()).toBeNull();
		expect(() => tracker.dispose()).not.toThrow();
	});

	it("supports event buses without off()", () => {
		const handlers: Array<(data: unknown) => void> = [];
		const bus = {
			on(_event: string, handler: (data: unknown) => void) {
				handlers.push(handler);
			},
			emit(event: string) {
				if (event === "usage:query") {
					for (const handler of handlers) {
						handler({ sessionCost: 1.25, providers: {}, perModel: {} });
					}
				}
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
		const tracker = createUsageLimitsTracker({ on, emit });

		tracker.requestSnapshot();
		tracker.dispose();
		tracker.requestSnapshot();

		expect(on).toHaveBeenCalledTimes(1);
		expect(emit).toHaveBeenCalledTimes(2);
	});

	it("unsubscribes when off() is available", () => {
		const on = vi.fn();
		const emit = vi.fn();
		const off = vi.fn();
		const tracker = createUsageLimitsTracker({ on, emit, off });
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
		fs.writeFileSync(path.join(packageDir, "tsconfig.json"), "{}", "utf-8");

		const projects = collectReviewTypecheckProjects(root, [
			mkTask({ files: ["packages/feature/src/index.ts"] }),
			mkTask({ files: ["README.md"] }),
		]);

		expect(projects).toEqual([path.join(packageDir, "tsconfig.json")]);
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("skips review typecheck when no TypeScript files were changed", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "queen-typecheck-skip-"));
		fs.writeFileSync(path.join(root, "tsconfig.json"), "{}", "utf-8");

		expect(collectReviewTypecheckProjects(root, [mkTask({ files: ["README.md"] })])).toEqual([]);
		expect(resolveReviewTypecheckInvocation(root, [mkTask({ files: ["README.md"] })])).toBeNull();
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("prefers the nearest nested project when multiple configs exist", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "queen-typecheck-nested-"));
		const packageDir = path.join(root, "packages", "feature");
		const srcDir = path.join(packageDir, "src");
		fs.mkdirSync(srcDir, { recursive: true });
		fs.writeFileSync(path.join(root, "tsconfig.json"), "{}", "utf-8");
		fs.writeFileSync(path.join(packageDir, "tsconfig.json"), "{}", "utf-8");

		const projects = collectReviewTypecheckProjects(root, [mkTask({ files: ["packages/feature/src/index.ts"] })]);

		expect(projects).toEqual([path.join(packageDir, "tsconfig.json")]);
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("falls back to npx tsc when no local binary exists", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "queen-typecheck-npx-"));
		fs.writeFileSync(path.join(root, "tsconfig.json"), "{}", "utf-8");

		const invocation = resolveReviewTypecheckInvocation(root, [mkTask({ files: ["src/index.ts"] })]);

		expect(invocation?.command).toBe("npx");
		expect(invocation?.args.slice(0, 2)).toEqual(["tsc", "--noEmit"]);
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("prefers the local tsc binary when the workspace already has dependencies installed", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "queen-typecheck-local-bin-"));
		fs.mkdirSync(path.join(root, "node_modules", ".bin"), { recursive: true });
		fs.writeFileSync(path.join(root, "tsconfig.json"), "{}", "utf-8");
		fs.writeFileSync(path.join(root, "node_modules", ".bin", "tsc"), "#!/bin/sh\n", "utf-8");

		const invocation = resolveReviewTypecheckInvocation(root, [mkTask({ files: ["src/index.ts"] })]);

		expect(invocation?.command).toContain(path.join("node_modules", ".bin", "tsc"));
		expect(invocation?.args).toContain(path.join(root, "tsconfig.json"));
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("returns true when typecheck succeeds and false when it fails", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "queen-typecheck-run-"));
		fs.writeFileSync(path.join(root, "tsconfig.json"), "{}", "utf-8");

		childProcessMocks.execFileSync.mockReturnValueOnce(Buffer.from("ok"));
		expect(runReviewTypecheck(root, [mkTask({ files: ["src/index.ts"] })])).toBe(true);
		expect(childProcessMocks.execFileSync).toHaveBeenCalledWith(
			"npx",
			expect.arrayContaining(["tsc", "--noEmit", "--project", path.join(root, "tsconfig.json")]),
			expect.objectContaining({ cwd: root, stdio: "pipe" }),
		);

		childProcessMocks.execFileSync.mockImplementationOnce(() => {
			throw new Error("boom");
		});
		expect(runReviewTypecheck(root, [mkTask({ files: ["src/index.ts"] })])).toBe(false);
		expect(runReviewTypecheck(root, [mkTask({ files: ["README.md"] })])).toBe(true);
		fs.rmSync(root, { recursive: true, force: true });
	});
});

describe("makeColonyId", () => {
	it("adds entropy so ids do not collide within the same millisecond", () => {
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(123456789);
		const randomSpy = vi.spyOn(Math, "random").mockReturnValueOnce(0.11111).mockReturnValueOnce(0.22222);

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
	childProcessMocks.execFileSync.mockReset();
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "queen-test-"));
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
