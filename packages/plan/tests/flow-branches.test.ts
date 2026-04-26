import path from "node:path";


vi.mock<typeof import('@mariozechner/pi-coding-agent')>(import('@mariozechner/pi-coding-agent'), () => ({
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
	resetPlanFile: vi.fn(),
	resolveActivePlanFilePath: vi.fn(),
	resolvePlanLocationInput: vi.fn(),
}));

const stateMocks = vi.hoisted(() => ({
	getFirstUserMessageId: vi.fn(),
	hasEntryInSession: vi.fn(),
}));

vi.mock<typeof import('../plan-files')>(import('../plan-files'), () => planFileMocks);
vi.mock<typeof import('../state')>(import('../state'), () => stateMocks);

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
				({ handler } = command);
			},
			registerShortcut: (_shortcut: string, options: { handler: (ctx: any) => Promise<void> }) => {
				shortcutHandler = options.handler;
			},
		} as any,
		{ onPlanModeExited: onPlanModeExited as never, stateManager },
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
		navigateTree: vi.fn(async () => ({ cancelled: false })),
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
		ui: {
			confirm: vi.fn(async () => true),
			custom: vi.fn(async () => ({ cancelled: false })),
			getEditorText: vi.fn(() => ""),
			notify: vi.fn(),
			select: vi.fn(() => undefined),
			setEditorText: vi.fn(),
		},
		waitForIdle: vi.fn(async () => {}),
	};

	return {
		...base,
		...overrides,
		sessionManager: {
			...base.sessionManager,
			...((overrides.sessionManager as Record<string, unknown> | undefined) ?? {}),
		},
		ui: {
			...base.ui,
			...((overrides.ui as Record<string, unknown> | undefined) ?? {}),
		},
	};
}

beforeEach(() => {
	vi.clearAllMocks();

	planFileMocks.createFreshPlanFilePath.mockResolvedValue("/plans/fresh.plan.md");
	planFileMocks.ensurePlanFileExists.mockResolvedValue();
	planFileMocks.movePlanFile.mockResolvedValue();
	planFileMocks.pathExists.mockResolvedValue(false);
	planFileMocks.readPlanFile.mockResolvedValue();
	planFileMocks.resolveActivePlanFilePath.mockImplementation((_ctx, planFilePath: string) => planFilePath);
	planFileMocks.resolvePlanLocationInput.mockImplementation((_ctx, rawLocation: string) => Promise.resolve(rawLocation ? path.join("/plans", path.basename(rawLocation)) : null));
	planFileMocks.resetPlanFile.mockResolvedValue();

	stateMocks.getFirstUserMessageId.mockReturnValue("user-1");
	stateMocks.hasEntryInSession.mockReturnValue(true);
});

describe("plan flow branches", () => {
	it("moves the active plan file to a new location", async () => {
		const stateManager = createStateManager({
			active: true,
			planFilePath: "/plans/current.plan.md",
			version: 1,
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: { message: string; level: string }[] = [];
		const ctx = createContext({
			hasUI: false,
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ level, message });
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
			level: "info",
			message: "Plan file moved to /plans/next.plan.md.",
		});
	});

	it("warns when an active plan move resolves to no valid path", async () => {
		const stateManager = createStateManager({
			active: true,
			planFilePath: "/plans/current.plan.md",
			version: 1,
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: { message: string; level: string }[] = [];
		const ctx = createContext({
			hasUI: false,
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ level, message });
				},
			},
		});

		planFileMocks.resolvePlanLocationInput.mockResolvedValue(null);

		await handler("bad-path", ctx);

		expect(planFileMocks.movePlanFile).not.toHaveBeenCalled();
		expect(notifications).toContainEqual({
			level: "warning",
			message: "Please enter a valid plan file location.",
		});
	});

	it("starts fresh planning in an empty branch and clears the editor", async () => {
		const stateManager = createStateManager({
			active: false,
			planFilePath: "/plans/session.plan.md",
			version: 1,
		});
		const { handler } = createRegisteredBindings(stateManager);
		const setEditorText = vi.fn();
		const navigateTree = vi.fn(async () => ({ cancelled: false }));
		const ctx = createContext({
			navigateTree,
			sessionManager: {
				getLeafId: () => "assistant-leaf",
			},
			ui: {
				select: () => "Empty branch",
				setEditorText,
			},
		});

		await handler("", ctx);

		expect(navigateTree).toHaveBeenCalledWith("user-1", {
			label: "plan",
			summarize: false,
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
			active: false,
			planFilePath: "/plans/session.plan.md",
			version: 1,
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: { message: string; level: string }[] = [];
		const ctx = createContext({
			sessionManager: {
				getLeafId: () => "assistant-leaf",
			},
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
				select: () => undefined,
			},
		});

		await handler("", ctx);

		expect(notifications).toContainEqual({
			level: "info",
			message: "Plan mode activation cancelled.",
		});
		expect(stateManager.startPlanMode).not.toHaveBeenCalled();
	});

	it("stops empty-branch activation when creating the planning branch is cancelled", async () => {
		const stateManager = createStateManager({
			active: false,
			planFilePath: "/plans/session.plan.md",
			version: 1,
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: { message: string; level: string }[] = [];
		const navigateTree = vi.fn(async () => ({ cancelled: true }));
		const ctx = createContext({
			navigateTree,
			sessionManager: {
				getLeafId: () => "assistant-leaf",
			},
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
				select: () => "Empty branch",
			},
		});

		await handler("", ctx);

		expect(navigateTree).toHaveBeenCalledWith("user-1", {
			label: "plan",
			summarize: false,
		});
		expect(notifications).toContainEqual({
			level: "info",
			message: "Plan mode activation cancelled.",
		});
		expect(stateManager.startPlanMode).not.toHaveBeenCalled();
	});

	it("moves an existing plan to a requested path before continuing planning", async () => {
		const stateManager = createStateManager({
			active: false,
			lastPlanLeafId: undefined,
			planFilePath: "/plans/session.plan.md",
			version: 1,
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
			active: false,
			lastPlanLeafId: "saved-leaf",
			planFilePath: "/plans/session.plan.md",
			version: 1,
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: { message: string; level: string }[] = [];
		const navigateTree = vi.fn(async () => ({ cancelled: true }));
		const ctx = createContext({
			navigateTree,
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ level, message });
				},
				select: () => "Continue planning",
			},
		});

		planFileMocks.readPlanFile.mockResolvedValue("# Existing plan\n");

		await handler("", ctx);

		expect(navigateTree).toHaveBeenCalledWith("saved-leaf", {
			label: "plan",
			summarize: false,
		});
		expect(notifications).toContainEqual({
			level: "info",
			message: "Plan mode activation cancelled.",
		});
		expect(stateManager.startPlanMode).not.toHaveBeenCalled();
	});

	it("summarizes the planning branch when exiting plan mode with summary", async () => {
		const onPlanModeExited = vi.fn();
		const stateManager = createStateManager({
			active: true,
			lastPlanLeafId: "old-leaf",
			originLeafId: "origin-leaf",
			planFilePath: "/plans/session.plan.md",
			version: 1,
		});
		const { handler } = createRegisteredBindings(stateManager, onPlanModeExited);
		const navigateTree = vi.fn(async () => ({ cancelled: false }));
		const setEditorText = vi.fn();
		const ctx = createContext({
			navigateTree,
			sessionManager: {
				getLeafId: () => "planning-leaf",
			},
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
		});

		planFileMocks.readPlanFile.mockResolvedValue("# Approved plan\n");

		await handler("", ctx);

		expect(navigateTree).toHaveBeenCalledWith(
			"origin-leaf",
			expect.objectContaining({
				replaceInstructions: true,
				summarize: true,
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
			active: true,
			originLeafId: "origin-leaf",
			planFilePath: "/plans/session.plan.md",
			version: 1,
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: { message: string; level: string }[] = [];
		const ctx = createContext({
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ level, message });
				},
				select: () => {},
			},
		});

		await handler("", ctx);

		expect(notifications).toContainEqual({
			level: "info",
			message: "Continuing in Plan mode (Esc).",
		});
		expect(stateManager.setState).not.toHaveBeenCalled();
	});

	it("reports fresh plan path allocation failures before starting a new plan", async () => {
		const stateManager = createStateManager({
			active: false,
			planFilePath: "/plans/session.plan.md",
			version: 1,
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: { message: string; level: string }[] = [];
		const ctx = createContext({
			sessionManager: {
				getLeafId: () => "user-1",
			},
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
				select: () => "Start fresh",
			},
		});

		planFileMocks.readPlanFile.mockResolvedValue("# Existing plan\n");
		planFileMocks.createFreshPlanFilePath.mockRejectedValue(new Error("no slot available"));

		await handler("", ctx);

		expect(notifications).toContainEqual({
			level: "error",
			message: "Failed to allocate a fresh plan file path: no slot available",
		});
		expect(planFileMocks.resetPlanFile).not.toHaveBeenCalled();
		expect(stateManager.startPlanMode).not.toHaveBeenCalled();
	});

	it("refuses to overwrite an existing requested path without interactive confirmation", async () => {
		const stateManager = createStateManager({
			active: false,
			planFilePath: "/plans/session.plan.md",
			version: 1,
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: { message: string; level: string }[] = [];
		const ctx = createContext({
			hasUI: false,
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ level, message });
				},
			},
		});

		planFileMocks.resolvePlanLocationInput.mockResolvedValue("/plans/requested.plan.md");
		planFileMocks.pathExists.mockResolvedValue(true);

		await handler("requested.plan.md", ctx);

		expect(notifications).toContainEqual({
			level: "error",
			message: "Refusing to overwrite existing plan file without interactive confirmation: /plans/requested.plan.md",
		});
		expect(planFileMocks.resetPlanFile).not.toHaveBeenCalled();
		expect(stateManager.startPlanMode).not.toHaveBeenCalled();
	});

	it("cancels interactive fresh planning when the requested path overwrite is rejected", async () => {
		const stateManager = createStateManager({
			active: false,
			planFilePath: "/plans/session.plan.md",
			version: 1,
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: { message: string; level: string }[] = [];
		const ctx = createContext({
			sessionManager: {
				getLeafId: () => "user-1",
			},
			ui: {
				confirm: async () => false,
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
				select: () => "Current branch",
			},
		});

		planFileMocks.resolvePlanLocationInput.mockResolvedValue("/plans/requested.plan.md");
		planFileMocks.pathExists.mockResolvedValue(true);

		await handler("requested.plan.md", ctx);

		expect(notifications).toContainEqual({
			level: "info",
			message: "Plan mode activation cancelled.",
		});
		expect(planFileMocks.resetPlanFile).not.toHaveBeenCalled();
		expect(stateManager.startPlanMode).not.toHaveBeenCalled();
	});

	it("reports requested path lookup failures before overwriting a plan file", async () => {
		const stateManager = createStateManager({
			active: false,
			planFilePath: "/plans/session.plan.md",
			version: 1,
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: { message: string; level: string }[] = [];
		const ctx = createContext({
			hasUI: false,
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ level, message });
				},
			},
		});

		planFileMocks.resolvePlanLocationInput.mockResolvedValue("/plans/requested.plan.md");
		planFileMocks.pathExists.mockRejectedValue(new Error("stat failed"));

		await handler("requested.plan.md", ctx);

		expect(notifications).toContainEqual({
			level: "error",
			message: "Failed to check requested plan path: stat failed",
		});
		expect(planFileMocks.resetPlanFile).not.toHaveBeenCalled();
	});

	it("reports reset failures before entering plan mode", async () => {
		const stateManager = createStateManager({
			active: false,
			planFilePath: "/plans/session.plan.md",
			version: 1,
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: { message: string; level: string }[] = [];
		const ctx = createContext({
			hasUI: false,
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ level, message });
				},
			},
		});

		planFileMocks.resetPlanFile.mockRejectedValue(new Error("locked"));

		await handler("", ctx);

		expect(notifications).toContainEqual({
			level: "error",
			message: "Failed to reset plan file: locked",
		});
		expect(planFileMocks.ensurePlanFileExists).not.toHaveBeenCalled();
		expect(stateManager.startPlanMode).not.toHaveBeenCalled();
	});

	it("reports initialization failures before entering plan mode", async () => {
		const stateManager = createStateManager({
			active: false,
			planFilePath: "/plans/session.plan.md",
			version: 1,
		});
		const { handler } = createRegisteredBindings(stateManager);
		const notifications: { message: string; level: string }[] = [];
		const ctx = createContext({
			hasUI: false,
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ level, message });
				},
			},
		});

		planFileMocks.ensurePlanFileExists.mockRejectedValue(new Error("disk full"));

		await handler("", ctx);

		expect(notifications).toContainEqual({
			level: "error",
			message: "Failed to initialize plan file: disk full",
		});
		expect(stateManager.startPlanMode).not.toHaveBeenCalled();
	});
});
