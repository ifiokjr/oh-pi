import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { gitClientMock } = vi.hoisted(() => ({
	gitClientMock: {
		getRepoRoot: vi.fn<(cwd: string) => string | null>(),
		getCurrentBranch: vi.fn<(repoRoot: string) => string | null>(),
		listBranches: vi.fn<(repoRoot: string) => string[]>(),
		isDirty: vi.fn<(repoRoot: string) => boolean>(),
		createAndSwitchBranch: vi.fn<(repoRoot: string, branchName: string) => void>(),
	},
}));

vi.mock("../extension/git.js", () => ({
	createGitClient: () => gitClientMock,
}));

vi.mock("@mariozechner/pi-tui", () => ({
	Text: class {
		constructor(public text: string) {}
	},
}));

import specExtension from "../extension/index.js";

type CommandSpec = {
	description?: string;
	getArgumentCompletions?: (prefix: string) => Array<{ value: string; label?: string }> | null;
	handler?: (args: string, ctx: any) => Promise<void> | void;
};

function createPiMock() {
	const commands = new Map<string, CommandSpec>();
	const renderers = new Map<string, any>();
	return {
		commands,
		renderers,
		registerCommand(name: string, spec: CommandSpec) {
			commands.set(name, spec);
		},
		registerMessageRenderer(type: string, renderer: any) {
			renderers.set(type, renderer);
		},
		sendMessage: vi.fn(),
		sendUserMessage: vi.fn(),
	};
}

function createCtx(cwd: string, overrides: Partial<any> = {}) {
	return {
		cwd,
		hasUI: true,
		ui: {
			notify: vi.fn(),
			confirm: vi.fn().mockResolvedValue(true),
			select: vi.fn().mockResolvedValue(undefined),
			editor: vi.fn().mockResolvedValue(undefined),
			input: vi.fn().mockResolvedValue(undefined),
		},
		...overrides,
	};
}

const tempDirs: string[] = [];

function createTempRepo(prefix: string): string {
	const dir = path.join(os.tmpdir(), `${prefix}-${Math.random().toString(36).slice(2, 8)}`);
	mkdirSync(dir, { recursive: true });
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
	tempDirs.length = 0;
});

beforeEach(() => {
	vi.clearAllMocks();
	gitClientMock.getRepoRoot.mockImplementation((cwd) => cwd);
	gitClientMock.getCurrentBranch.mockReturnValue("main");
	gitClientMock.listBranches.mockReturnValue([]);
	gitClientMock.isDirty.mockReturnValue(false);
	gitClientMock.createAndSwitchBranch.mockImplementation(() => undefined);
});

describe("@ifi/pi-spec extension", () => {
	it("registers the /spec command and report renderer", () => {
		const pi = createPiMock();
		specExtension(pi as any);

		expect(pi.commands.has("spec")).toBe(true);
		expect(pi.commands.has("spec:init")).toBe(true);
		expect(pi.renderers.has("pi-spec-report")).toBe(true);
		expect(pi.commands.get("spec")?.description).toContain("/spec:init");
	});

	it("/spec:init scaffolds the workflow workspace and reports created files", async () => {
		const repoRoot = createTempRepo("pi-spec-init");
		const pi = createPiMock();
		specExtension(pi as any);
		const ctx = createCtx(repoRoot);

		await pi.commands.get("spec:init")?.handler?.("", ctx);

		expect(pi.sendMessage).toHaveBeenCalledTimes(1);
		expect(String(pi.sendMessage.mock.calls[0][0].content)).toContain("/spec:init");
		expect(String(pi.sendMessage.mock.calls[0][0].content)).toContain("Created");
		expect(existsSync(path.join(repoRoot, ".specify", "memory", "constitution.md"))).toBe(true);
	});

	it("/spec:status does not auto-initialize an unprepared repository", async () => {
		const repoRoot = createTempRepo("pi-spec-status-empty");
		const pi = createPiMock();
		specExtension(pi as any);
		const ctx = createCtx(repoRoot);

		await pi.commands.get("spec")?.handler?.("status", ctx);

		expect(existsSync(path.join(repoRoot, ".specify"))).toBe(false);
		expect(String(pi.sendMessage.mock.calls[0][0].content)).toContain("- Initialized: no");
	});

	it("/spec:status reports workflow state without triggering the model", async () => {
		const repoRoot = createTempRepo("pi-spec-status");
		mkdirSync(path.join(repoRoot, "specs", "001-auth-flow"), { recursive: true });
		writeFileSync(path.join(repoRoot, "specs", "001-auth-flow", "spec.md"), "# Feature Specification", "utf8");
		const pi = createPiMock();
		specExtension(pi as any);
		const ctx = createCtx(repoRoot, {
			ui: {
				notify: vi.fn(),
				confirm: vi.fn().mockResolvedValue(true),
				select: vi.fn().mockResolvedValue("001-auth-flow"),
				editor: vi.fn().mockResolvedValue(undefined),
				input: vi.fn().mockResolvedValue(undefined),
			},
		});

		await pi.commands.get("spec")?.handler?.("status", ctx);

		expect(pi.sendUserMessage).not.toHaveBeenCalled();
		expect(String(pi.sendMessage.mock.calls[0][0].content)).toContain("# /spec:status");
		expect(String(pi.sendMessage.mock.calls[0][0].content)).toContain("001-auth-flow");
	});

	it("/spec:specify prepares a feature workspace and queues the native workflow prompt", async () => {
		const repoRoot = createTempRepo("pi-spec-specify");
		mkdirSync(path.join(repoRoot, "specs", "002-existing-feature"), { recursive: true });
		gitClientMock.listBranches.mockReturnValue(["001-first-feature"]);
		const pi = createPiMock();
		specExtension(pi as any);
		const ctx = createCtx(repoRoot);

		await pi.commands.get("spec")?.handler?.("specify Build a realtime dashboard for analytics", ctx);

		expect(gitClientMock.createAndSwitchBranch).toHaveBeenCalledWith(
			repoRoot,
			"003-build-realtime-dashboard-analytics",
		);
		expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
		const prompt = String(pi.sendUserMessage.mock.calls[0][0]);
		expect(prompt).toContain("Do NOT run any shell or PowerShell scripts");
		expect(prompt).toContain(path.join(repoRoot, "specs", "003-build-realtime-dashboard-analytics", "spec.md"));
		expect(prompt).toContain("The native /spec runtime has already generated the feature number");
	});

	it("/spec:plan scaffolds plan.md and references pi-agent.md in the queued prompt", async () => {
		const repoRoot = createTempRepo("pi-spec-plan");
		mkdirSync(path.join(repoRoot, "specs", "001-auth-flow"), { recursive: true });
		writeFileSync(path.join(repoRoot, "specs", "001-auth-flow", "spec.md"), "# Feature Specification", "utf8");
		gitClientMock.getCurrentBranch.mockReturnValue("001-auth-flow");
		const pi = createPiMock();
		specExtension(pi as any);
		const ctx = createCtx(repoRoot);

		await pi.commands.get("spec")?.handler?.("plan Use TypeScript with Vitest and minimal dependencies", ctx);

		expect(existsSync(path.join(repoRoot, "specs", "001-auth-flow", "plan.md"))).toBe(true);
		expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
		const prompt = String(pi.sendUserMessage.mock.calls[0][0]);
		expect(prompt).toContain(path.join(repoRoot, ".specify", "memory", "pi-agent.md"));
		expect(prompt).toContain(path.join(repoRoot, ".specify", "templates", "commands", "plan.md"));
	});

	it("/spec:implement stops when checklists are incomplete and the user declines to continue", async () => {
		const repoRoot = createTempRepo("pi-spec-implement");
		const featureDir = path.join(repoRoot, "specs", "001-auth-flow");
		mkdirSync(path.join(featureDir, "checklists"), { recursive: true });
		writeFileSync(path.join(featureDir, "spec.md"), "# Feature Specification", "utf8");
		writeFileSync(path.join(featureDir, "plan.md"), "# Implementation Plan", "utf8");
		writeFileSync(path.join(featureDir, "tasks.md"), "# Tasks", "utf8");
		writeFileSync(path.join(featureDir, "checklists", "requirements.md"), "- [ ] CHK001 Incomplete item\n", "utf8");
		gitClientMock.getCurrentBranch.mockReturnValue("001-auth-flow");
		const pi = createPiMock();
		specExtension(pi as any);
		const ctx = createCtx(repoRoot, {
			ui: {
				notify: vi.fn(),
				confirm: vi.fn().mockResolvedValue(false),
				select: vi.fn().mockResolvedValue(undefined),
				editor: vi.fn().mockResolvedValue(undefined),
				input: vi.fn().mockResolvedValue(undefined),
			},
		});

		await pi.commands.get("spec")?.handler?.("implement", ctx);

		expect(ctx.ui.confirm).toHaveBeenCalledTimes(1);
		expect(pi.sendUserMessage).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"Implementation cancelled until the checklist review is complete.",
			"info",
		);
	});
});
