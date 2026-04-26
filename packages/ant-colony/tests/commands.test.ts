import { beforeEach, describe, expect, it, vi } from "vitest";
import antColonyExtension from "../extensions/ant-colony/index.js";

const { runColonyMock, resumeColonyMock } = vi.hoisted(() => {
	const runColonyMock = vi.fn(async (opts: any) => ({
		id: `stable-${String(opts.goal ?? "goal")
			.toLowerCase()
			.replace(/\s+/g, "-")}`,
		goal: String(opts.goal ?? "goal"),
		status: "done",
		tasks: [],
		ants: [],
		pheromones: [],
		concurrency: {
			current: 1,
			min: 1,
			max: 1,
			optimal: 1,
			history: [],
		},
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
		modelOverrides: {},
		maxCost: null,
		workspace: {
			mode: "shared",
			originCwd: opts.cwd,
			executionCwd: opts.cwd,
			repoRoot: null,
			worktreeRoot: null,
			branch: null,
			baseBranch: null,
			note: null,
		},
		createdAt: Date.now(),
		finishedAt: Date.now(),
	}));

	const resumeColonyMock = vi.fn(runColonyMock);
	return { runColonyMock, resumeColonyMock };
});

vi.mock("../extensions/ant-colony/queen.js", async (importActual) => {
	const actual = await importActual<typeof import("../extensions/ant-colony/queen.js")>();
	return {
		...actual,
		runColony: runColonyMock,
		resumeColony: resumeColonyMock,
	};
});

vi.mock("../extensions/ant-colony/worktree.js", async (importActual) => {
	const actual = await importActual<typeof import("../extensions/ant-colony/worktree.js")>();

	const mkShared = (cwd: string) => ({
		mode: "shared" as const,
		originCwd: cwd,
		executionCwd: cwd,
		repoRoot: null,
		worktreeRoot: null,
		branch: null,
		baseBranch: null,
		note: null,
	});

	return {
		...actual,
		prepareColonyWorkspace: ({ cwd }: { cwd: string }) => mkShared(cwd),
		resumeColonyWorkspace: ({ cwd }: { cwd: string }) => mkShared(cwd),
		cleanupIsolatedWorktree: () => null,
	};
});

type CommandSpec = {
	description?: string;
	getArgumentCompletions?: (prefix: string) => Array<{ value: string; label?: string }> | null;
	handler?: (args: string, ctx: any) => Promise<void> | void;
};

type PiMock = {
	commands: Map<string, CommandSpec>;
	on: ReturnType<typeof vi.fn>;
	events: {
		on: ReturnType<typeof vi.fn>;
		off: ReturnType<typeof vi.fn>;
		emit: ReturnType<typeof vi.fn>;
	};
	registerCommand: (name: string, spec: CommandSpec) => void;
	registerMessageRenderer: ReturnType<typeof vi.fn>;
	registerShortcut: ReturnType<typeof vi.fn>;
	registerTool: ReturnType<typeof vi.fn>;
	sendMessage: ReturnType<typeof vi.fn>;
};

function createPiMock(): PiMock {
	const commands = new Map<string, CommandSpec>();
	return {
		commands,
		on: vi.fn(),
		events: {
			on: vi.fn(),
			off: vi.fn(),
			emit: vi.fn(),
		},
		registerCommand(name, spec) {
			commands.set(name, spec);
		},
		registerMessageRenderer: vi.fn(),
		registerShortcut: vi.fn(),
		registerTool: vi.fn(),
		sendMessage: vi.fn(),
	};
}

function createCtx(overrides: Partial<any> = {}): any {
	return {
		cwd: process.cwd(),
		model: { provider: "openai", id: "gpt-5-mini" },
		currentModel: "openai/gpt-5-mini",
		modelRegistry: {},
		ui: { notify: vi.fn() },
		...overrides,
	};
}

describe("colony command argument completions", () => {
	let pi: PiMock;
	let ctx: any;

	beforeEach(() => {
		vi.clearAllMocks();
		runColonyMock.mockClear();
		resumeColonyMock.mockClear();
		pi = createPiMock();
		ctx = createCtx();
		antColonyExtension(pi as any);
	});

	it("/colony-status returns null with no active colonies", () => {
		const status = pi.commands.get("colony-status");
		expect(status?.getArgumentCompletions).toBeTypeOf("function");
		expect(status?.getArgumentCompletions?.("c")).toBeNull();
	});

	it("/colony-stop returns static `all` completion and prefix filtering when no colonies exist", () => {
		const stop = pi.commands.get("colony-stop");
		expect(stop?.getArgumentCompletions).toBeTypeOf("function");
		expect(stop?.getArgumentCompletions?.("")).toEqual([expect.objectContaining({ value: "all" })]);
		expect(stop?.getArgumentCompletions?.("a")).toEqual([expect.objectContaining({ value: "all" })]);
		expect(stop?.getArgumentCompletions?.("c")).toBeNull();
	});

	it("/colony-status and /colony-stop include colony IDs while launches are in flight", () => {
		const colony = pi.commands.get("colony");
		expect(colony?.handler).toBeTypeOf("function");

		const launchOne = colony?.handler?.("First goal", ctx);
		const launchTwo = colony?.handler?.("Second goal", ctx);
		expect(launchOne).toBeDefined();
		expect(launchTwo).toBeDefined();

		const status = pi.commands.get("colony-status");
		const stop = pi.commands.get("colony-stop");

		expect(status?.getArgumentCompletions?.("c")).toEqual([
			expect.objectContaining({ value: "c1" }),
			expect.objectContaining({ value: "c2" }),
		]);
		expect(status?.getArgumentCompletions?.("c2")).toEqual([expect.objectContaining({ value: "c2" })]);

		expect(stop?.getArgumentCompletions?.("c")).toEqual([
			expect.objectContaining({ value: "c1" }),
			expect.objectContaining({ value: "c2" }),
		]);
		expect(stop?.getArgumentCompletions?.("all")).toEqual([expect.objectContaining({ value: "all" })]);
	});

	it("/colony-resume has no argument completion callback", () => {
		const resume = pi.commands.get("colony-resume");
		expect(resume).toBeDefined();
		expect(resume?.getArgumentCompletions).toBeUndefined();
	});
});
