
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";

const mocks = vi.hoisted(() => {
	const delegatedExecute = vi.fn();
	const executePtyCommand = vi.fn();
	const toAgentToolResult = vi.fn((result) => ({
		content: [{ text: `tool:${result.sessionId}`, type: "text" }],
		details: { ok: true },
	}));
	const toUserBashResult = vi.fn((result) => ({
		cancelled: false,
		exitCode: 0,
		output: `user:${result.sessionId}`,
		truncated: false,
	}));
	const createBashTool = vi.fn(() => ({
		description: "Built-in bash",
		execute: delegatedExecute,
		label: "Bash",
		parameters: { command: { type: "string" } },
		renderCall: vi.fn(),
		renderResult: vi.fn(),
	}));
	const sessionManagerDispose = vi.fn();
	return {
		createBashTool,
		delegatedExecute,
		executePtyCommand,
		sessionManagerDispose,
		toAgentToolResult,
		toUserBashResult,
	};
});

vi.mock<typeof import('@mariozechner/pi-coding-agent')>(import('@mariozechner/pi-coding-agent'), async () => {
	const actual = await vi.importActual<typeof import("@mariozechner/pi-coding-agent")>("@mariozechner/pi-coding-agent");
	return {
		...actual,
		createBashTool: mocks.createBashTool,
	};
});

vi.mock<typeof import('@sinclair/typebox')>(import('@sinclair/typebox'), () => ({
	Type: {
		Boolean: (options?: Record<string, unknown>) => ({ type: "boolean", ...options }),
		Integer: (options?: Record<string, unknown>) => ({ type: "integer", ...options }),
		Literal: (value: unknown) => ({ type: "literal", value }),
		Number: (options?: Record<string, unknown>) => ({ type: "number", ...options }),
		Object: (schema: unknown) => schema,
		Optional: (value: unknown) => ({ optional: true, ...((value as Record<string, unknown> | undefined) ?? {}) }),
		String: (options?: Record<string, unknown>) => ({ type: "string", ...options }),
	},
}));

vi.mock<typeof import('../src/pty-execute.js')>(import('../src/pty-execute.js'), () => ({
	executePtyCommand: mocks.executePtyCommand,
	toAgentToolResult: mocks.toAgentToolResult,
	toUserBashResult: mocks.toUserBashResult,
}));

vi.mock<typeof import('../src/pty-session.js')>(import('../src/pty-session.js'), () => ({
	PtySessionManager: class {
		dispose() {
			mocks.sessionManagerDispose();
		}
	},
}));

import bashLiveViewExtension, { BASH_LIVE_VIEW_TOOL, BASH_PTY_COMMAND, bashLiveViewInternals } from "../index.js";

describe("@ifi/pi-bash-live-view index", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.delegatedExecute.mockResolvedValue({ content: [{ text: "delegated", type: "text" }] });
		mocks.executePtyCommand.mockResolvedValue({ sessionId: "pty-1" });
	});

	it("registers the live-view bash tool and slash command", () => {
		mocks.createBashTool.mockImplementationOnce(
			() =>
				({
					description: "Built-in bash",
					execute: mocks.delegatedExecute,
					parameters: { command: { type: "string" } },
					renderCall: vi.fn(),
					renderResult: vi.fn(),
				}) as never,
		);
		const harness = createExtensionHarness();
		bashLiveViewExtension(harness.pi as never);

		expect(harness.tools.has(BASH_LIVE_VIEW_TOOL)).toBeTruthy();
		expect(harness.commands.has(BASH_PTY_COMMAND)).toBeTruthy();
		expect(harness.tools.get(BASH_LIVE_VIEW_TOOL)?.description).toContain("usePTY=true");
		expect(bashLiveViewInternals.buildToolDescription("base")).toContain("pseudo-terminal");
		expect(bashLiveViewInternals.resolveCwd({ cwd: "/ctx" } as never, { cwd: "/fallback" } as never, "/explicit")).toBe(
			"/explicit",
		);
		expect(bashLiveViewInternals.resolveCwd({ cwd: "/ctx" } as never, null)).toBe("/ctx");
		expect(bashLiveViewInternals.resolveCwd(undefined, null)).toBe(process.cwd());
		expect(bashLiveViewInternals.toErrorToolResult("boom")).toMatchObject({
			content: [{ text: "PTY execution failed: boom" }],
		});
	});

	it("delegates non-PTY bash calls to the original tool using the resolved cwd", async () => {
		const harness = createExtensionHarness();
		harness.ctx.cwd = process.cwd();
		bashLiveViewExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);

		const result = await harness.tools.get(BASH_LIVE_VIEW_TOOL)?.execute("tool-1", {
			command: "echo delegated",
			timeout: 5,
			usePTY: false,
		});

		expect(result).toBeDefined();
		expect(bashLiveViewInternals.resolveCwd(undefined, { cwd: "/fallback" } as never)).toBe("/fallback");
	});

	it("runs PTY-backed bash calls when usePTY=true and converts the result", async () => {
		const harness = createExtensionHarness();
		harness.ctx.cwd = "/workspace/b";
		bashLiveViewExtension(harness.pi as never);

		const result = await harness.tools.get(BASH_LIVE_VIEW_TOOL)?.execute(
			"tool-2",
			{
				command: "pnpm dev",
				cwd: "/custom/cwd",
				usePTY: true,
			},
			new AbortController().signal,
			vi.fn(),
			harness.ctx,
		);

		expect(mocks.executePtyCommand).toHaveBeenCalledWith(
			expect.objectContaining({ command: "pnpm dev", ctx: harness.ctx, cwd: "/custom/cwd" }),
		);
		expect(mocks.toAgentToolResult).toHaveBeenCalledWith({ sessionId: "pty-1" });
		expect(result).toMatchObject({ content: [{ text: "tool:pty-1" }] });
	});

	it("returns a PTY error tool result when execution fails", async () => {
		const harness = createExtensionHarness();
		bashLiveViewExtension(harness.pi as never);
		mocks.executePtyCommand.mockRejectedValueOnce(new Error("boom"));

		const result = await harness.tools
			.get(BASH_LIVE_VIEW_TOOL)
			?.execute("tool-3", { command: "broken", usePTY: true }, undefined, undefined, harness.ctx);
		expect(result).toMatchObject({
			content: [{ text: "PTY execution failed: boom" }],
			details: { error: true, pty: true },
		});
		expect(bashLiveViewInternals.toErrorToolResult(new Error("x"))).toMatchObject({
			content: [{ text: "PTY execution failed: x" }],
		});
	});

	it("runs the /bash-pty command and reports empty or failed commands via the UI", async () => {
		const harness = createExtensionHarness();
		harness.ctx.ui.notify = vi.fn();
		bashLiveViewExtension(harness.pi as never);

		await harness.commands.get(BASH_PTY_COMMAND)?.handler?.("", harness.ctx);
		expect(harness.ctx.ui.notify).toHaveBeenCalledWith("/bash-pty requires a command.", "warning");

		mocks.executePtyCommand.mockResolvedValueOnce({
			exitCode: 0,
			sessionId: "pty-2",
			status: "completed",
			text: "done",
		});
		await harness.commands.get(BASH_PTY_COMMAND)?.handler?.("pnpm test", harness.ctx);
		expect(harness.messages.at(-1)).toMatchObject({
			content: "done",
			customType: "pi-bash-live-view:result",
			details: { exitCode: 0, sessionId: "pty-2", status: "completed" },
		});

		mocks.executePtyCommand.mockRejectedValueOnce(new Error("nope"));
		await harness.commands.get(BASH_PTY_COMMAND)?.handler?.("pnpm broken", harness.ctx);
		expect(harness.ctx.ui.notify).toHaveBeenLastCalledWith("PTY execution failed: nope", "error");

		mocks.executePtyCommand.mockRejectedValueOnce("raw-failure");
		await harness.commands.get(BASH_PTY_COMMAND)?.handler?.("pnpm raw", harness.ctx);
		expect(harness.ctx.ui.notify).toHaveBeenLastCalledWith("PTY execution failed: raw-failure", "error");
	});

	it("handles user_bash events and falls back to an error result on failure", async () => {
		const harness = createExtensionHarness();
		bashLiveViewExtension(harness.pi as never);

		const [okResult] = await harness.emitAsync(
			"user_bash",
			{ command: "htop", cwd: "/tmp", excludeFromContext: false, type: "user_bash" },
			harness.ctx,
		);
		expect(mocks.toUserBashResult).toHaveBeenCalledWith({ sessionId: "pty-1" });
		expect(okResult).toMatchObject({ result: { exitCode: 0, output: "user:pty-1" } });

		mocks.executePtyCommand.mockRejectedValueOnce(new Error("bad-user-bash"));
		const [errorResult] = await harness.emitAsync(
			"user_bash",
			{ command: "broken", cwd: "/tmp", excludeFromContext: true, type: "user_bash" },
			harness.ctx,
		);
		expect(errorResult).toMatchObject({
			result: {
				cancelled: false,
				exitCode: 1,
				output: "PTY execution failed: bad-user-bash",
				truncated: false,
			},
		});

		mocks.executePtyCommand.mockRejectedValueOnce("user-raw");
		const [rawErrorResult] = await harness.emitAsync(
			"user_bash",
			{ command: "broken", cwd: "/tmp", excludeFromContext: true, type: "user_bash" },
			harness.ctx,
		);
		expect(rawErrorResult).toMatchObject({ result: { output: "PTY execution failed: user-raw" } });
	});

	it("disposes PTY sessions on session shutdown", () => {
		const harness = createExtensionHarness();
		bashLiveViewExtension(harness.pi as never);
		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
		expect(mocks.sessionManagerDispose).toHaveBeenCalledOnce();
	});
});
