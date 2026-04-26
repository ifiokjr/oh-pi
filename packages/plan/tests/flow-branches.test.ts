import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-coding-agent", () => ({
	BorderedLoader: class BorderedLoader {
		onAbort?: () => void;
	},
}));

const planFileMocks = vi.hoisted(() => ({
	createFreshPlanFilePath: vi.fn(),
	ensurePlanFileExists: vi.fn(),
	movePlanFile: vi.fn(),
	pathExists: vi.fn(),
	readPlanFile: vi.fn(),
	resolveActivePlanFilePath: vi.fn(),
	resolvePlanLocationInput: vi.fn(),
	resetPlanFile: vi.fn(),
}));

const stateMocks = vi.hoisted(() => ({
	getFirstUserMessageId: vi.fn(),
	hasEntryInSession: vi.fn(),
}));

vi.mock("../plan-files", () => planFileMocks);
vi.mock("../state", () => stateMocks);

const { registerPlanModeCommand } = await import("../flow");

function createStateManager(initialState: {
	version: number;
	active: boolean;
	originLeafId?: string;
	planFilePath: string;
	lastPlanLeafId?: string;
}) {
	let state = initialState;

	return {
		getState: () => state,
		setState: vi.fn((_ctx, nextState) => {
			state = nextState;
		}),
		startPlanMode: vi.fn(),
	};
}

function createRegisteredBindings(
	stateManager: ReturnType<typeof createStateManager>,
	onPlanModeExited?: (summary: unknown) => void,
) {
	let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
	let shortcutHandler: ((ctx: any) => Promise<void>) | undefined;

	registerPlanModeCommand(
		{
			registerCommand: (_name: string, command: { handler: (args: string, ctx: any) => Promise<void> }) => {
				handler = command.handler;
			},
			registerShortcut: (_shortcut: string, options: { handler: (ctx: any) => Promise<void> }) => {
				shortcutHandler = options.handler;
			},
		} as any,
		{ stateManager, onPlanModeExited: onPlanModeExited as never },
	);

	if (!(handler && shortcutHandler)) {
		throw new Error("Plan mode commands were not registered");
	}

	return { handler, shortcutHandler };
}

function createContext(overrides: Record<string, unknown> = {}) {
	const base = {
		cwd: "/tmp",
		hasUI: true,
		isIdle: () => true,
		waitForIdle: vi.fn(async () => {}),
		navigateTree: vi.fn(async () => ({ cancelled: false })),
		ui: {
			confirm: vi.fn(async () => true),
			custom: vi.fn(async () => ({ cancelled: false })),
			getEditorText: vi.fn(() => ""),
			notify: vi.fn(),
			select: vi.fn(() => undefined),
			setEditorText: vi.fn(),
		},
		sessionManager: {
			appendLabelChange: vi.fn(),
			branch: vi.fn(),
			getEntries: vi.fn(() => []),
			getEntry: vi.fn(() => undefined),
			getLeafId: vi.fn(() => "current-leaf"),
			getSessionDir: vi.fn(() => "/tmp"),
			getSessionFile: vi.fn(() => undefined),
			getSessionId: vi.fn(() => "session-1"),
			resetLeaf: vi.fn(),
		},
	};

	return {
		...base,
		...overrides,
		ui: {
			...base.ui,
			...((overrides.ui as Record<string, unknown> | undefined) ?? {}),
		},
		sessionManager: {
			...base.sessionManager,
			...((overrides.sessionManager as Record<string, unknown> | undefined) ?? {}),
		},
	};
}

beforeEach(() => {
	vi.clearAllMocks();

	planFileMocks.createFreshPlanFilePath.mockResolvedValue("/plans/fresh.plan.md");
	planFileMocks.ensurePlanFileExists.mockResolvedValue(undefined);
	planFileMocks.movePlanFile.mockResolvedValue(undefined);
	planFileMocks.pathExists.mockResolvedValue(false);
	planFileMocks.readPlanFile.mockResolvedValue(undefined);
	planFileMocks.resolveActivePlanFilePath.mockImplementation((_ctx, planFilePath: string) => planFilePath);
	planFileMocks.resolvePlanLocationInput.mockImplementation((_ctx, rawLocation: string) => {
		return Promise.resolve(rawLocation ? path.join("/plans", path.basename(rawLocation)) : null);
	});
	planFileMocks.resetPlanFile.mockResolvedValue(undefined);

	stateMocks.getFirstUserMessageId.mockReturnValue("user-1");
	stateMocks.hasEntryInSession.mockReturnValue(true);
});

describe("plan flow branches", () => {
	it("moves the active plan file to a new location", async () => {
		const stateManager = createStateManager({
			version: 1,
			active: true,
			planFilePath: "/plans/current.plan.md",
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: Array<{ message: string; level: string }> = [];
		const ctx = createContext({
			hasUI: false,
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
			},
		});

		planFileMocks.pathExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
		planFileMocks.resolvePlanLocationInput.mockResolvedValue("/plans/next.plan.md");

		await handler("next.plan.md", ctx);

		expect(planFileMocks.movePlanFile).toHaveBeenCalledWith("/plans/current.plan.md", "/plans/next.plan.md");
		expect(stateManager.setState).toHaveBeenCalledWith(
			ctx,
			expect.objectContaining({ planFilePath: "/plans/next.plan.md" }),
		);
		expect(notifications).toContainEqual({
			message: "Plan file moved to /plans/next.plan.md.",
			level: "info",
		});
	});

	it("warns when an active plan move resolves to no valid path", async () => {
		const stateManager = createStateManager({
			version: 1,
			active: true,
			planFilePath: "/plans/current.plan.md",
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: Array<{ message: string; level: string }> = [];
		const ctx = createContext({
			hasUI: false,
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
			},
		});

		planFileMocks.resolvePlanLocationInput.mockResolvedValue(null);

		await handler("bad-path", ctx);

		expect(planFileMocks.movePlanFile).not.toHaveBeenCalled();
		expect(notifications).toContainEqual({
			message: "Please enter a valid plan file location.",
			level: "warning",
		});
	});

	it("starts fresh planning in an empty branch and clears the editor", async () => {
		const stateManager = createStateManager({
			version: 1,
			active: false,
			planFilePath: "/plans/session.plan.md",
		});
		const { handler } = createRegisteredBindings(stateManager);
		const setEditorText = vi.fn();
		const navigateTree = vi.fn(async () => ({ cancelled: false }));
		const ctx = createContext({
			navigateTree,
			ui: {
				select: () => "Empty branch",
				setEditorText,
			},
			sessionManager: {
				getLeafId: () => "assistant-leaf",
			},
		});

		await handler("", ctx);

		expect(navigateTree).toHaveBeenCalledWith("user-1", {
			summarize: false,
			label: "plan",
		});
		expect(setEditorText).toHaveBeenCalledWith("");
		expect(planFileMocks.resetPlanFile).toHaveBeenCalledWith("/plans/session.plan.md");
		expect(planFileMocks.ensurePlanFileExists).toHaveBeenCalledWith("/plans/session.plan.md");
		expect(stateManager.startPlanMode).toHaveBeenCalledWith(ctx, {
			originLeafId: "assistant-leaf",
			planFilePath: "/plans/session.plan.md",
		});
	});

	it("cancels UI activation before choosing a plan branch", async () => {
		const stateManager = createStateManager({
			version: 1,
			active: false,
			planFilePath: "/plans/session.plan.md",
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: Array<{ message: string; level: string }> = [];
		const ctx = createContext({
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
				select: () => undefined,
			},
			sessionManager: {
				getLeafId: () => "assistant-leaf",
			},
		});

		await handler("", ctx);

		expect(notifications).toContainEqual({
			message: "Plan mode activation cancelled.",
			level: "info",
		});
		expect(stateManager.startPlanMode).not.toHaveBeenCalled();
	});

	it("stops empty-branch activation when creating the planning branch is cancelled", async () => {
		const stateManager = createStateManager({
			version: 1,
			active: false,
			planFilePath: "/plans/session.plan.md",
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: Array<{ message: string; level: string }> = [];
		const navigateTree = vi.fn(async () => ({ cancelled: true }));
		const ctx = createContext({
			navigateTree,
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
				select: () => "Empty branch",
			},
			sessionManager: {
				getLeafId: () => "assistant-leaf",
			},
		});

		await handler("", ctx);

		expect(navigateTree).toHaveBeenCalledWith("user-1", {
			summarize: false,
			label: "plan",
		});
		expect(notifications).toContainEqual({
			message: "Plan mode activation cancelled.",
			level: "info",
		});
		expect(stateManager.startPlanMode).not.toHaveBeenCalled();
	});

	it("moves an existing plan to a requested path before continuing planning", async () => {
		const stateManager = createStateManager({
			version: 1,
			active: false,
			planFilePath: "/plans/session.plan.md",
			lastPlanLeafId: undefined,
		});
		const { handler } = createRegisteredBindings(stateManager);
		const ctx = createContext({
			hasUI: false,
			sessionManager: {
				getLeafId: () => "current-leaf",
			},
		});

		planFileMocks.readPlanFile.mockResolvedValue("# Existing plan\n");
		planFileMocks.resolvePlanLocationInput.mockResolvedValue("/plans/requested.plan.md");
		planFileMocks.pathExists.mockResolvedValue(false);

		await handler("requested.plan.md", ctx);

		expect(planFileMocks.movePlanFile).toHaveBeenCalledWith("/plans/session.plan.md", "/plans/requested.plan.md");
		expect(planFileMocks.ensurePlanFileExists).toHaveBeenCalledWith("/plans/requested.plan.md");
		expect(stateManager.startPlanMode).toHaveBeenCalledWith(ctx, {
			originLeafId: "current-leaf",
			planFilePath: "/plans/requested.plan.md",
		});
	});

	it("cancels continue planning when restoring the saved branch is cancelled", async () => {
		const stateManager = createStateManager({
			version: 1,
			active: false,
			planFilePath: "/plans/session.plan.md",
			lastPlanLeafId: "saved-leaf",
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: Array<{ message: string; level: string }> = [];
		const navigateTree = vi.fn(async () => ({ cancelled: true }));
		const ctx = createContext({
			navigateTree,
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
				select: () => "Continue planning",
			},
		});

		planFileMocks.readPlanFile.mockResolvedValue("# Existing plan\n");

		await handler("", ctx);

		expect(navigateTree).toHaveBeenCalledWith("saved-leaf", {
			summarize: false,
			label: "plan",
		});
		expect(notifications).toContainEqual({
			message: "Plan mode activation cancelled.",
			level: "info",
		});
		expect(stateManager.startPlanMode).not.toHaveBeenCalled();
	});

	it("summarizes the planning branch when exiting plan mode with summary", async () => {
		const onPlanModeExited = vi.fn();
		const stateManager = createStateManager({
			version: 1,
			active: true,
			originLeafId: "origin-leaf",
			planFilePath: "/plans/session.plan.md",
			lastPlanLeafId: "old-leaf",
		});
		const { handler } = createRegisteredBindings(stateManager, onPlanModeExited);
		const navigateTree = vi.fn(async () => ({ cancelled: false }));
		const setEditorText = vi.fn();
		const ctx = createContext({
			navigateTree,
			ui: {
				custom: (render: (tui: unknown, theme: unknown, kb: unknown, done: (result: unknown) => void) => unknown) => {
					return new Promise((resolve) => {
						render(undefined, undefined, undefined, resolve);
					});
				},
				getEditorText: () => "",
				select: () => "Exit & summarize branch",
				setEditorText,
			},
			sessionManager: {
				getLeafId: () => "planning-leaf",
			},
		});

		planFileMocks.readPlanFile.mockResolvedValue("# Approved plan\n");

		await handler("", ctx);

		expect(navigateTree).toHaveBeenCalledWith(
			"origin-leaf",
			expect.objectContaining({
				summarize: true,
				replaceInstructions: true,
			}),
		);
		expect(stateManager.setState).toHaveBeenCalledWith(
			ctx,
			expect.objectContaining({ active: false, lastPlanLeafId: "planning-leaf" }),
		);
		expect(setEditorText).toHaveBeenCalledWith(expect.stringContaining("/plans/session.plan.md"));
		expect(onPlanModeExited).toHaveBeenCalledWith({
			planFilePath: "/plans/session.plan.md",
			planText: "# Approved plan",
		});
	});

	it("keeps plan mode active when exit selection is dismissed", async () => {
		const stateManager = createStateManager({
			version: 1,
			active: true,
			originLeafId: "origin-leaf",
			planFilePath: "/plans/session.plan.md",
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: Array<{ message: string; level: string }> = [];
		const ctx = createContext({
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
				select: () => undefined,
			},
		});

		await handler("", ctx);

		expect(notifications).toContainEqual({
			message: "Continuing in Plan mode (Esc).",
			level: "info",
		});
		expect(stateManager.setState).not.toHaveBeenCalled();
	});

	it("reports fresh plan path allocation failures before starting a new plan", async () => {
		const stateManager = createStateManager({
			version: 1,
			active: false,
			planFilePath: "/plans/session.plan.md",
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: Array<{ message: string; level: string }> = [];
		const ctx = createContext({
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
				select: () => "Start fresh",
			},
			sessionManager: {
				getLeafId: () => "user-1",
			},
		});

		planFileMocks.readPlanFile.mockResolvedValue("# Existing plan\n");
		planFileMocks.createFreshPlanFilePath.mockRejectedValue(new Error("no slot available"));

		await handler("", ctx);

		expect(notifications).toContainEqual({
			message: "Failed to allocate a fresh plan file path: no slot available",
			level: "error",
		});
		expect(planFileMocks.resetPlanFile).not.toHaveBeenCalled();
		expect(stateManager.startPlanMode).not.toHaveBeenCalled();
	});

	it("refuses to overwrite an existing requested path without interactive confirmation", async () => {
		const stateManager = createStateManager({
			version: 1,
			active: false,
			planFilePath: "/plans/session.plan.md",
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: Array<{ message: string; level: string }> = [];
		const ctx = createContext({
			hasUI: false,
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
			},
		});

		planFileMocks.resolvePlanLocationInput.mockResolvedValue("/plans/requested.plan.md");
		planFileMocks.pathExists.mockResolvedValue(true);

		await handler("requested.plan.md", ctx);

		expect(notifications).toContainEqual({
			message: "Refusing to overwrite existing plan file without interactive confirmation: /plans/requested.plan.md",
			level: "error",
		});
		expect(planFileMocks.resetPlanFile).not.toHaveBeenCalled();
		expect(stateManager.startPlanMode).not.toHaveBeenCalled();
	});

	it("cancels interactive fresh planning when the requested path overwrite is rejected", async () => {
		const stateManager = createStateManager({
			version: 1,
			active: false,
			planFilePath: "/plans/session.plan.md",
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: Array<{ message: string; level: string }> = [];
		const ctx = createContext({
			ui: {
				confirm: async () => false,
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
				select: () => "Current branch",
			},
			sessionManager: {
				getLeafId: () => "user-1",
			},
		});

		planFileMocks.resolvePlanLocationInput.mockResolvedValue("/plans/requested.plan.md");
		planFileMocks.pathExists.mockResolvedValue(true);

		await handler("requested.plan.md", ctx);

		expect(notifications).toContainEqual({
			message: "Plan mode activation cancelled.",
			level: "info",
		});
		expect(planFileMocks.resetPlanFile).not.toHaveBeenCalled();
		expect(stateManager.startPlanMode).not.toHaveBeenCalled();
	});

	it("reports requested path lookup failures before overwriting a plan file", async () => {
		const stateManager = createStateManager({
			version: 1,
			active: false,
			planFilePath: "/plans/session.plan.md",
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: Array<{ message: string; level: string }> = [];
		const ctx = createContext({
			hasUI: false,
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
			},
		});

		planFileMocks.resolvePlanLocationInput.mockResolvedValue("/plans/requested.plan.md");
		planFileMocks.pathExists.mockRejectedValue(new Error("stat failed"));

		await handler("requested.plan.md", ctx);

		expect(notifications).toContainEqual({
			message: "Failed to check requested plan path: stat failed",
			level: "error",
		});
		expect(planFileMocks.resetPlanFile).not.toHaveBeenCalled();
	});

	it("reports reset failures before entering plan mode", async () => {
		const stateManager = createStateManager({
			version: 1,
			active: false,
			planFilePath: "/plans/session.plan.md",
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: Array<{ message: string; level: string }> = [];
		const ctx = createContext({
			hasUI: false,
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
			},
		});

		planFileMocks.resetPlanFile.mockRejectedValue(new Error("locked"));

		await handler("", ctx);

		expect(notifications).toContainEqual({
			message: "Failed to reset plan file: locked",
			level: "error",
		});
		expect(planFileMocks.ensurePlanFileExists).not.toHaveBeenCalled();
		expect(stateManager.startPlanMode).not.toHaveBeenCalled();
	});

	it("reports initialization failures before entering plan mode", async () => {
		const stateManager = createStateManager({
			version: 1,
			active: false,
			planFilePath: "/plans/session.plan.md",
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: Array<{ message: string; level: string }> = [];
		const ctx = createContext({
			hasUI: false,
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
			},
		});

		planFileMocks.ensurePlanFileExists.mockRejectedValue(new Error("disk full"));

		await handler("", ctx);

		expect(notifications).toContainEqual({
			message: "Failed to initialize plan file: disk full",
			level: "error",
		});
		expect(stateManager.startPlanMode).not.toHaveBeenCalled();
	});
});
