import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";


const { gitClientMock } = vi.hoisted(() => ({
	gitClientMock: {
		createAndSwitchBranch: vi.fn<(repoRoot: string, branchName: string) => void>(),
		getCurrentBranch: vi.fn<(repoRoot: string) => string | null>(),
		getRepoRoot: vi.fn<(cwd: string) => string | null>(),
		isDirty: vi.fn<(repoRoot: string) => boolean>(),
		listBranches: vi.fn<(repoRoot: string) => string[]>(),
	},
}));

vi.mock<typeof import('../extension/git.js')>(import('../extension/git.js'), () => ({
	createGitClient: () => gitClientMock,
}));

vi.mock<typeof import('@mariozechner/pi-tui')>(import('@mariozechner/pi-tui'), () => ({
	Text: class {
		constructor(public text: string) {}
	},
}));

import specExtension from "../extension/index.js";

interface CommandSpec {
	description?: string;
	getArgumentCompletions?: (prefix: string) => Array<{ value: string; label?: string }> | null;
	handler?: (args: string, ctx: any) => Promise<void> | void;
}

function createPiMock() {
	const commands = new Map<string, CommandSpec>();
	const renderers = new Map<string, any>();
	return {
		commands,
		registerCommand(name: string, spec: CommandSpec) {
			commands.set(name, spec);
		},
		registerMessageRenderer(type: string, renderer: any) {
			renderers.set(type, renderer);
		},
		renderers,
		sendMessage: vi.fn(),
		sendUserMessage: vi.fn(),
	};
}

function createCtx(cwd: string, overrides: Partial<any> = {}) {
	return {
		cwd,
		hasUI: true,
		ui: {
			confirm: vi.fn().mockResolvedValue(true),
			editor: vi.fn().mockResolvedValue(undefined),
			input: vi.fn().mockResolvedValue(undefined),
			notify: vi.fn(),
			select: vi.fn().mockResolvedValue(undefined),
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
	await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
	tempDirs.length = 0;
});

beforeEach(() => {
	vi.clearAllMocks();
	gitClientMock.getRepoRoot.mockImplementation((cwd) => cwd);
	gitClientMock.getCurrentBranch.mockReturnValue("main");
	gitClientMock.listBranches.mockReturnValue([]);
	gitClientMock.isDirty.mockReturnValue(false);
	gitClientMock.createAndSwitchBranch.mockReturnValue(undefined);
});

describe("@ifi/pi-spec extension", () => {
	it("registers the /spec command and report renderer", () => {
		const pi = createPiMock();
		specExtension(pi as any);

		expect(pi.commands.has("spec")).toBeTruthy();
		expect(pi.commands.has("spec:help")).toBeTruthy();
		expect(pi.commands.has("spec:init")).toBeTruthy();
		expect(pi.renderers.has("pi-spec-report")).toBeTruthy();
		expect(pi.commands.get("spec")?.description).toContain("/spec:init");
	});

	it("/spec:init scaffolds the workflow workspace and reports created files", async () => {
		const repoRoot = createTempRepo("pi-spec-init");
		const pi = createPiMock();
		specExtension(pi as any);
		const ctx = createCtx(repoRoot);

		await pi.commands.get("spec:init")?.handler?.("", ctx);

		expect(pi.sendMessage).toHaveBeenCalledOnce();
		expect(String(pi.sendMessage.mock.calls[0][0].content)).toContain("/spec:init");
		expect(String(pi.sendMessage.mock.calls[0][0].content)).toContain("Created");
		expect(existsSync(path.join(repoRoot, ".specify", "memory", "constitution.md"))).toBeTruthy();
	});

	it("/spec:status does not auto-initialize an unprepared repository", async () => {
		const repoRoot = createTempRepo("pi-spec-status-empty");
		const pi = createPiMock();
		specExtension(pi as any);
		const ctx = createCtx(repoRoot);

		await pi.commands.get("spec:status")?.handler?.("", ctx);

		expect(existsSync(path.join(repoRoot, ".specify"))).toBeFalsy();
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
				confirm: vi.fn().mockResolvedValue(true),
				editor: vi.fn().mockResolvedValue(undefined),
				input: vi.fn().mockResolvedValue(undefined),
				notify: vi.fn(),
				select: vi.fn().mockResolvedValue("001-auth-flow"),
			},
		});

		await pi.commands.get("spec:status")?.handler?.("", ctx);

		expect(pi.sendUserMessage).not.toHaveBeenCalled();
		expect(String(pi.sendMessage.mock.calls[0][0].content)).toContain("# /spec:status");
		expect(String(pi.sendMessage.mock.calls[0][0].content)).toContain("001-auth-flow");
	});

	it("/spec:specify warns when no feature description is provided", async () => {
		const repoRoot = createTempRepo("pi-spec-specify-empty");
		const pi = createPiMock();
		specExtension(pi as any);
		const ctx = createCtx(repoRoot);

		await pi.commands.get("spec:specify")?.handler?.("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith("/spec:specify requires a feature description.", "warning");
		expect(pi.sendUserMessage).not.toHaveBeenCalled();
	});

	it("/spec:plan warns when there is no active feature", async () => {
		const repoRoot = createTempRepo("pi-spec-plan-no-feature");
		const pi = createPiMock();
		specExtension(pi as any);
		const ctx = createCtx(repoRoot);

		await pi.commands.get("spec:plan")?.handler?.("Use TypeScript with Vitest", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"No active feature found. Run /spec:specify <feature description> first.",
			"warning",
		);
		expect(pi.sendUserMessage).not.toHaveBeenCalled();
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
		expect(pi.sendUserMessage).toHaveBeenCalledOnce();
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

		expect(existsSync(path.join(repoRoot, "specs", "001-auth-flow", "plan.md"))).toBeTruthy();
		expect(pi.sendUserMessage).toHaveBeenCalledOnce();
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
				confirm: vi.fn().mockResolvedValue(false),
				editor: vi.fn().mockResolvedValue(undefined),
				input: vi.fn().mockResolvedValue(undefined),
				notify: vi.fn(),
				select: vi.fn().mockResolvedValue(undefined),
			},
		});

		await pi.commands.get("spec")?.handler?.("implement", ctx);

		expect(ctx.ui.confirm).toHaveBeenCalledOnce();
		expect(pi.sendUserMessage).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"Implementation cancelled until the checklist review is complete.",
			"info",
		);
	});
});
