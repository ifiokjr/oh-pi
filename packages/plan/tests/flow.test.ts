import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";


vi.mock<typeof import('@mariozechner/pi-coding-agent')>(import('@mariozechner/pi-coding-agent'), () => ({
	BorderedLoader: class BorderedLoader {
		onAbort?: () => void;
	},
}));

const { registerPlanModeCommand } = await import("../flow");

const tempDirs: string[] = [];

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) {
			continue;
		}
		await rm(dir, { force: true, recursive: true });
	}
});

function createRegisteredBindings(stateManager: {
	getState: () => any;
	setState: (ctx: any, nextState: any) => void;
	startPlanMode: (ctx: any, options: { originLeafId?: string; planFilePath: string }) => void;
}) {
	let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
	let shortcutHandler: ((ctx: any) => Promise<void>) | undefined;
	const shortcutKeys: string[] = [];

	registerPlanModeCommand(
		{
			registerCommand: (_name: string, command: { handler: (args: string, ctx: any) => Promise<void> }) => {
				({ handler } = command);
			},
			registerShortcut: (shortcut: string, options: { handler: (ctx: any) => Promise<void> }) => {
				shortcutKeys.push(shortcut);
				shortcutHandler = options.handler;
			},
		} as any,
		{ stateManager },
	);

	if (!handler) {
		throw new Error("Failed to register /plan handler");
	}
	if (!shortcutHandler) {
		throw new Error("Failed to register Alt+P shortcut handler");
	}

	return {
		handler,
		shortcutHandler,
		shortcutKeys,
	};
}

function createRegisteredHandler(stateManager: {
	getState: () => any;
	setState: (ctx: any, nextState: any) => void;
	startPlanMode: (ctx: any, options: { originLeafId?: string; planFilePath: string }) => void;
}) {
	return createRegisteredBindings(stateManager).handler;
}

describe("/plan Alt+P shortcut", () => {
	it("registers alt+p", () => {
		const { shortcutKeys } = createRegisteredBindings({
			getState: () => ({ active: false, version: 1 }),
			setState: () => {},
			startPlanMode: () => {},
		});

		expect(shortcutKeys).toStrictEqual(["alt+p"]);
	});

	it("starts plan mode without sending /plan text", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-flow-"));
		tempDirs.push(tmpDir);
		const planFilePath = path.join(tmpDir, "session-1.plan.md");
		const startCalls: { originLeafId?: string; planFilePath: string }[] = [];
		let state = {
			active: false,
			lastPlanLeafId: undefined,
			planFilePath,
			version: 1,
		};

		const { shortcutHandler } = createRegisteredBindings({
			getState: () => state,
			setState: (_ctx, nextState) => {
				state = nextState;
			},
			startPlanMode: (_ctx, options) => {
				startCalls.push(options);
			},
		});

		await shortcutHandler({
			cwd: tmpDir,
			hasUI: false,
			isIdle: () => true,
			sessionManager: {
				getEntries: () => [{ id: "leaf-1", type: "message", message: { role: "user" } }],
				getLeafId: () => "leaf-1",
				getSessionDir: () => tmpDir,
				getSessionFile: () => undefined,
				getSessionId: () => "session-1",
			},
			ui: {
				notify: () => {},
			},
		});

		expect(startCalls).toStrictEqual([
			{
				originLeafId: "leaf-1",
				planFilePath,
			},
		]);
	});

	it("shows start location choices when shortcut enters plan mode from branchable history", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-flow-"));
		tempDirs.push(tmpDir);
		const planFilePath = path.join(tmpDir, "session-1.plan.md");
		const startCalls: { originLeafId?: string; planFilePath: string }[] = [];
		let state = {
			active: false,
			lastPlanLeafId: undefined,
			planFilePath,
			version: 1,
		};

		const { shortcutHandler } = createRegisteredBindings({
			getState: () => state,
			setState: (_ctx, nextState) => {
				state = nextState;
			},
			startPlanMode: (_ctx, options) => {
				startCalls.push(options);
			},
		});

		const selectCalls: { prompt: string; choices: string[] }[] = [];
		await shortcutHandler({
			cwd: tmpDir,
			hasUI: true,
			isIdle: () => true,
			sessionManager: {
				getEntries: () => [
					{ id: "user-1", type: "message", message: { role: "user" } },
					{ id: "leaf-2", type: "message", message: { role: "assistant" } },
				],
				getLeafId: () => "leaf-2",
				getSessionDir: () => tmpDir,
				getSessionFile: () => undefined,
				getSessionId: () => "session-1",
			},
			ui: {
				notify: () => {},
				select: (prompt: string, choices: string[]) => {
					selectCalls.push({ prompt, choices });
					return "Current branch";
				},
			},
		});

		expect(selectCalls).toStrictEqual([
			{
				choices: ["Empty branch", "Current branch"],
				prompt: "Start planning in:",
			},
		]);
		expect(startCalls).toStrictEqual([
			{
				originLeafId: "leaf-2",
				planFilePath,
			},
		]);
	});

	it("uses the same end flow when shortcut is pressed in active mode", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-flow-"));
		tempDirs.push(tmpDir);
		const planFilePath = path.join(tmpDir, "session-1.plan.md");
		await writeFile(planFilePath, "# Existing plan\n", "utf8");
		let state = {
			active: true,
			lastPlanLeafId: undefined,
			originLeafId: "origin-leaf",
			planFilePath,
			version: 1,
		};
		const setStateCalls: any[] = [];
		const setEditorTextCalls: string[] = [];
		const branchCalls: string[] = [];
		const selectCalls: { prompt: string; choices: string[] }[] = [];

		const { shortcutHandler } = createRegisteredBindings({
			getState: () => state,
			setState: (_ctx, nextState) => {
				setStateCalls.push(nextState);
				state = nextState;
			},
			startPlanMode: () => {},
		});

		await shortcutHandler({
			cwd: tmpDir,
			hasUI: true,
			isIdle: () => true,
			sessionManager: {
				branch: (entryId: string) => {
					branchCalls.push(entryId);
				},
				getEntries: () => [
					{ id: "origin-leaf", type: "message", message: { role: "assistant" } },
					{ id: "planning-leaf", type: "message", message: { role: "assistant" } },
				],
				getEntry: (entryId: string) =>
					entryId === "origin-leaf"
						? { id: "origin-leaf", type: "message", parentId: "user-1", message: { role: "assistant" } }
						: undefined,
				getLeafId: () => "planning-leaf",
				getSessionDir: () => tmpDir,
				getSessionFile: () => undefined,
				getSessionId: () => "session-1",
			},
			ui: {
				getEditorText: () => "",
				notify: () => {},
				select: (prompt: string, choices: string[]) => {
					selectCalls.push({ prompt, choices });
					return "Exit";
				},
				setEditorText: (text: string) => {
					setEditorTextCalls.push(text);
				},
			},
		});

		expect(selectCalls).toStrictEqual([
			{
				choices: ["Exit", "Exit & summarize branch"],
				prompt: "Plan mode action (Esc stays in Plan mode)",
			},
		]);
		expect(branchCalls).toStrictEqual(["origin-leaf"]);
		expect(setStateCalls.at(-1)).toStrictEqual({
			active: false,
			lastPlanLeafId: "planning-leaf",
			planFilePath,
			version: 1,
		});
		expect(setEditorTextCalls).toStrictEqual([
			`Plan file: ${planFilePath}\nImplement the approved plan in this file. Keep changes focused, update tests, and summarize what was implemented.`,
		]);
	});
});

describe("/plan continue planning", () => {
	it("navigates to saved planning leaf before activating plan mode", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-flow-"));
		tempDirs.push(tmpDir);
		const planFilePath = path.join(tmpDir, "session-1.plan.md");
		await writeFile(planFilePath, "# Existing plan\n", "utf8");

		const startCalls: { originLeafId?: string; planFilePath: string }[] = [];
		let state = {
			active: false,
			lastPlanLeafId: "planning-leaf",
			planFilePath,
			version: 1,
		};
		const handler = createRegisteredHandler({
			getState: () => state,
			setState: (_ctx, nextState) => {
				state = nextState;
			},
			startPlanMode: (_ctx, options) => {
				startCalls.push(options);
			},
		});

		const navigateCalls: { entryId: string; options: any }[] = [];
		await handler("", {
			cwd: tmpDir,
			hasUI: false,
			navigateTree: (entryId: string, options: any) => {
				navigateCalls.push({ entryId, options });
				return { cancelled: false };
			},
			sessionManager: {
				getEntries: () => [
					{ id: "user-1", type: "message", message: { role: "user" } },
					{ id: "planning-leaf", type: "message", message: { role: "assistant" } },
				],
				getLeafId: () => "current-leaf",
				getSessionDir: () => tmpDir,
				getSessionFile: () => undefined,
				getSessionId: () => "session-1",
			},
			ui: {
				notify: () => {},
			},
			waitForIdle: () => undefined,
		});

		expect(navigateCalls).toStrictEqual([
			{
				entryId: "planning-leaf",
				options: {
					label: "plan",
					summarize: false,
				},
			},
		]);
		expect(startCalls).toStrictEqual([
			{
				originLeafId: "current-leaf",
				planFilePath,
			},
		]);
	});

	it("shows an info notification when continue resumes saved planning branch in UI mode", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-flow-"));
		tempDirs.push(tmpDir);
		const planFilePath = path.join(tmpDir, "session-1.plan.md");
		await writeFile(planFilePath, "# Existing plan\n", "utf8");

		const startCalls: { originLeafId?: string; planFilePath: string }[] = [];
		let state = {
			active: false,
			lastPlanLeafId: "planning-leaf",
			planFilePath,
			version: 1,
		};
		const handler = createRegisteredHandler({
			getState: () => state,
			setState: (_ctx, nextState) => {
				state = nextState;
			},
			startPlanMode: (_ctx, options) => {
				startCalls.push(options);
			},
		});

		const navigateCalls: { entryId: string; options: any }[] = [];
		const notifications: { message: string; level: string }[] = [];
		await handler("", {
			cwd: tmpDir,
			hasUI: true,
			navigateTree: (entryId: string, options: any) => {
				navigateCalls.push({ entryId, options });
				return { cancelled: false };
			},
			sessionManager: {
				getEntries: () => [
					{ id: "user-1", type: "message", message: { role: "user" } },
					{ id: "planning-leaf", type: "message", message: { role: "assistant" } },
				],
				getLeafId: () => "current-leaf",
				getSessionDir: () => tmpDir,
				getSessionFile: () => undefined,
				getSessionId: () => "session-1",
			},
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
				select: () => "Continue planning",
			},
			waitForIdle: () => undefined,
		});

		expect(navigateCalls).toStrictEqual([
			{
				entryId: "planning-leaf",
				options: {
					label: "plan",
					summarize: false,
				},
			},
		]);
		expect(notifications).toContainEqual({
			level: "info",
			message: "Resumed previous planning branch.",
		});
		expect(startCalls).toStrictEqual([
			{
				originLeafId: "current-leaf",
				planFilePath,
			},
		]);
	});

	it("falls back to current leaf when saved planning leaf is unavailable", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-flow-"));
		tempDirs.push(tmpDir);
		const planFilePath = path.join(tmpDir, "session-1.plan.md");
		await writeFile(planFilePath, "# Existing plan\n", "utf8");

		const startCalls: { originLeafId?: string; planFilePath: string }[] = [];
		let state = {
			active: false,
			lastPlanLeafId: "missing-leaf",
			planFilePath,
			version: 1,
		};
		const handler = createRegisteredHandler({
			getState: () => state,
			setState: (_ctx, nextState) => {
				state = nextState;
			},
			startPlanMode: (_ctx, options) => {
				startCalls.push(options);
			},
		});

		const navigateCalls: { entryId: string; options: any }[] = [];
		const notifications: { message: string; level: string }[] = [];
		await handler("", {
			cwd: tmpDir,
			hasUI: false,
			navigateTree: (entryId: string, options: any) => {
				navigateCalls.push({ entryId, options });
				return { cancelled: false };
			},
			sessionManager: {
				getEntries: () => [{ id: "user-1", type: "message", message: { role: "user" } }],
				getLeafId: () => "current-leaf",
				getSessionDir: () => tmpDir,
				getSessionFile: () => undefined,
				getSessionId: () => "session-1",
			},
			ui: {
				notify: (message: string, level: string) => {
					notifications.push({ message, level });
				},
			},
			waitForIdle: () => undefined,
		});

		expect(navigateCalls).toHaveLength(0);
		expect(notifications).toContainEqual({
			level: "warning",
			message: "Saved planning branch is unavailable. Continuing from the current branch tip.",
		});
		expect(startCalls).toStrictEqual([
			{
				originLeafId: "current-leaf",
				planFilePath,
			},
		]);
	});
});

describe("/plan start location prompt", () => {
	it("skips empty-vs-current selection when there is no prior history", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-flow-"));
		tempDirs.push(tmpDir);
		const planFilePath = path.join(tmpDir, "session-1.plan.md");

		const startCalls: { originLeafId?: string; planFilePath: string }[] = [];
		let state = {
			active: false,
			lastPlanLeafId: undefined,
			planFilePath,
			version: 1,
		};
		const handler = createRegisteredHandler({
			getState: () => state,
			setState: (_ctx, nextState) => {
				state = nextState;
			},
			startPlanMode: (_ctx, options) => {
				startCalls.push(options);
			},
		});

		const selectCalls: { prompt: string; choices: string[] }[] = [];
		await handler("", {
			cwd: tmpDir,
			hasUI: true,
			sessionManager: {
				getEntries: () => [{ id: "leaf-1", type: "message", message: { role: "user" } }],
				getLeafId: () => "leaf-1",
				getSessionDir: () => tmpDir,
				getSessionFile: () => undefined,
				getSessionId: () => "session-1",
			},
			ui: {
				notify: () => {},
				select: (prompt: string, choices: string[]) => {
					selectCalls.push({ prompt, choices });
					return "Current branch";
				},
			},
			waitForIdle: () => undefined,
		});

		expect(selectCalls).toStrictEqual([]);
		expect(startCalls).toStrictEqual([
			{
				originLeafId: "leaf-1",
				planFilePath,
			},
		]);
	});

	it("offers start-fresh without branch chooser when an existing plan is present", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-flow-"));
		tempDirs.push(tmpDir);
		const planFilePath = path.join(tmpDir, "session-1.plan.md");
		await writeFile(planFilePath, "# Existing plan\n", "utf8");

		const startCalls: { originLeafId?: string; planFilePath: string }[] = [];
		let state = {
			active: false,
			lastPlanLeafId: undefined,
			planFilePath,
			version: 1,
		};
		const handler = createRegisteredHandler({
			getState: () => state,
			setState: (_ctx, nextState) => {
				state = nextState;
			},
			startPlanMode: (_ctx, options) => {
				startCalls.push(options);
			},
		});

		const selectCalls: { prompt: string; choices: string[] }[] = [];
		await handler("", {
			cwd: tmpDir,
			hasUI: true,
			sessionManager: {
				getEntries: () => [{ id: "leaf-1", type: "message", message: { role: "user" } }],
				getLeafId: () => "leaf-1",
				getSessionDir: () => tmpDir,
				getSessionFile: () => undefined,
				getSessionId: () => "session-1",
			},
			ui: {
				notify: () => {},
				select: (prompt: string, choices: string[]) => {
					selectCalls.push({ prompt, choices });
					return "Start fresh";
				},
			},
			waitForIdle: () => undefined,
		});

		expect(selectCalls).toStrictEqual([
			{
				choices: ["Continue planning", "Start fresh"],
				prompt: `Start planning:\nPlan file: ${planFilePath}`,
			},
		]);
		expect(startCalls).toHaveLength(1);
		expect(startCalls[0]).toStrictEqual({
			originLeafId: "leaf-1",
			planFilePath: expect.any(String),
		});
		expect(startCalls[0].planFilePath).not.toBe(planFilePath);
	});
});
