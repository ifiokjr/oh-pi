import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";

const mocks = vi.hoisted(() => {
	const delegatedExecute = vi.fn();
	const executePtyCommand = vi.fn();
	const toAgentToolResult = vi.fn((result) => ({ content: [{ type: "text", text: `tool:${result.sessionId}` }], details: { ok: true } }));
	const toUserBashResult = vi.fn((result) => ({
		output: `user:${result.sessionId}`,
		exitCode: 0,
		cancelled: false,
		truncated: false,
	}));
	const createBashTool = vi.fn(() => ({
		label: "Bash",
		description: "Built-in bash",
		parameters: { command: { type: "string" } },
		renderCall: vi.fn(),
		renderResult: vi.fn(),
		execute: delegatedExecute,
	}));
	const sessionManagerDispose = vi.fn();
	return {
		delegatedExecute,
		executePtyCommand,
		toAgentToolResult,
		toUserBashResult,
		createBashTool,
		sessionManagerDispose,
	};
});

vi.mock("@mariozechner/pi-coding-agent", () => ({
	createBashTool: mocks.createBashTool,
}));

vi.mock("@sinclair/typebox", () => ({
	Type: {
		Object: (schema: unknown) => schema,
		String: (options?: Record<string, unknown>) => ({ type: "string", ...options }),
		Number: (options?: Record<string, unknown>) => ({ type: "number", ...options }),
		Boolean: (options?: Record<string, unknown>) => ({ type: "boolean", ...options }),
		Optional: (value: unknown) => ({ optional: true, ...((value as Record<string, unknown> | undefined) ?? {}) }),
	},
}));

vi.mock("../src/pty-execute.js", () => ({
	executePtyCommand: mocks.executePtyCommand,
	toAgentToolResult: mocks.toAgentToolResult,
	toUserBashResult: mocks.toUserBashResult,
}));

vi.mock("../src/pty-session.js", () => ({
	PtySessionManager: class {
		dispose() {
			mocks.sessionManagerDispose();
		}
	},
}));

import bashLiveViewExtension, { BASH_PTY_COMMAND, bashLiveViewInternals } from "../index.js";

describe("@ifi/pi-bash-live-view index", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.delegatedExecute.mockResolvedValue({ content: [{ type: "text", text: "delegated" }] });
		mocks.executePtyCommand.mockResolvedValue({ sessionId: "pty-1" });
	});

	it("registers the bash override and slash command", () => {
		mocks.createBashTool.mockImplementationOnce(
			() =>
				({
					description: "Built-in bash",
					parameters: { command: { type: "string" } },
					renderCall: vi.fn(),
					renderResult: vi.fn(),
					execute: mocks.delegatedExecute,
				}) as never,
		);
		const harness = createExtensionHarness();
		bashLiveViewExtension(harness.pi as never);

		expect(harness.tools.has("bash")).toBe(true);
		expect(harness.commands.has(BASH_PTY_COMMAND)).toBe(true);
		expect(harness.tools.get("bash")?.description).toContain("usePTY=true");
		expect(bashLiveViewInternals.buildToolDescription("base")).toContain("pseudo-terminal");
		expect(bashLiveViewInternals.resolveCwd({ cwd: "/ctx" } as never, { cwd: "/fallback" } as never, "/explicit")).toBe(
			"/explicit",
		);
		expect(bashLiveViewInternals.resolveCwd({ cwd: "/ctx" } as never, null, undefined)).toBe("/ctx");
		expect(bashLiveViewInternals.resolveCwd(undefined, null, undefined)).toBe(process.cwd());
		expect(bashLiveViewInternals.toErrorToolResult("boom")).toMatchObject({
			content: [{ text: "PTY execution failed: boom" }],
		});
	});

	it("delegates non-PTY bash calls to the original tool using the resolved cwd", async () => {
		const harness = createExtensionHarness();
		harness.ctx.cwd = "/workspace/a";
		bashLiveViewExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);

		const result = await harness.tools.get("bash")?.execute("tool-1", {
			command: "pwd",
			timeout: 5,
			usePTY: false,
		});

		expect(result).toMatchObject({ content: [{ text: "delegated" }] });
		expect(mocks.createBashTool).toHaveBeenNthCalledWith(1, process.cwd());
		expect(mocks.createBashTool).toHaveBeenNthCalledWith(2, "/workspace/a");
		expect(mocks.delegatedExecute).toHaveBeenCalledWith("tool-1", { command: "pwd", timeout: 5 }, undefined, undefined);
		expect(bashLiveViewInternals.resolveCwd(undefined, { cwd: "/fallback" } as never, undefined)).toBe("/fallback");
	});

	it("runs PTY-backed bash calls when usePTY=true and converts the result", async () => {
		const harness = createExtensionHarness();
		harness.ctx.cwd = "/workspace/b";
		bashLiveViewExtension(harness.pi as never);

		const result = await harness.tools.get("bash")?.execute(
			"tool-2",
			{
				command: "pnpm dev",
				usePTY: true,
				cwd: "/custom/cwd",
			},
			new AbortController().signal,
			vi.fn(),
			harness.ctx,
		);

		expect(mocks.executePtyCommand).toHaveBeenCalledWith(
			expect.objectContaining({ command: "pnpm dev", cwd: "/custom/cwd", ctx: harness.ctx }),
		);
		expect(mocks.toAgentToolResult).toHaveBeenCalledWith({ sessionId: "pty-1" });
		expect(result).toMatchObject({ content: [{ text: "tool:pty-1" }] });
	});

	it("returns a PTY error tool result when execution fails", async () => {
		const harness = createExtensionHarness();
		bashLiveViewExtension(harness.pi as never);
		mocks.executePtyCommand.mockRejectedValueOnce(new Error("boom"));

		const result = await harness.tools.get("bash")?.execute("tool-3", { command: "broken", usePTY: true }, undefined, undefined, harness.ctx);
		expect(result).toMatchObject({
			content: [{ text: "PTY execution failed: boom" }],
			details: { error: true, pty: true },
		});
		expect(bashLiveViewInternals.toErrorToolResult(new Error("x"))).toMatchObject({ content: [{ text: "PTY execution failed: x" }] });
	});

	it("runs the /bash-pty command and reports empty or failed commands via the UI", async () => {
		const harness = createExtensionHarness();
		harness.ctx.ui.notify = vi.fn();
		bashLiveViewExtension(harness.pi as never);

		await harness.commands.get(BASH_PTY_COMMAND)?.handler?.("", harness.ctx);
		expect(harness.ctx.ui.notify).toHaveBeenCalledWith("/bash-pty requires a command.", "warning");

		mocks.executePtyCommand.mockResolvedValueOnce({
			sessionId: "pty-2",
			status: "completed",
			exitCode: 0,
			text: "done",
		});
		await harness.commands.get(BASH_PTY_COMMAND)?.handler?.("pnpm test", harness.ctx);
		expect(harness.messages.at(-1)).toMatchObject({
			customType: "pi-bash-live-view:result",
			content: "done",
			details: { sessionId: "pty-2", status: "completed", exitCode: 0 },
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
			{ type: "user_bash", command: "htop", cwd: "/tmp", excludeFromContext: false },
			harness.ctx,
		);
		expect(mocks.toUserBashResult).toHaveBeenCalledWith({ sessionId: "pty-1" });
		expect(okResult).toMatchObject({ result: { output: "user:pty-1", exitCode: 0 } });

		mocks.executePtyCommand.mockRejectedValueOnce(new Error("bad-user-bash"));
		const [errorResult] = await harness.emitAsync(
			"user_bash",
			{ type: "user_bash", command: "broken", cwd: "/tmp", excludeFromContext: true },
			harness.ctx,
		);
		expect(errorResult).toMatchObject({
			result: {
				output: "PTY execution failed: bad-user-bash",
				exitCode: 1,
				cancelled: false,
				truncated: false,
			},
		});

		mocks.executePtyCommand.mockRejectedValueOnce("user-raw");
		const [rawErrorResult] = await harness.emitAsync(
			"user_bash",
			{ type: "user_bash", command: "broken", cwd: "/tmp", excludeFromContext: true },
			harness.ctx,
		);
		expect(rawErrorResult).toMatchObject({ result: { output: "PTY execution failed: user-raw" } });
	});

	it("disposes PTY sessions on session shutdown", () => {
		const harness = createExtensionHarness();
		bashLiveViewExtension(harness.pi as never);
		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
		expect(mocks.sessionManagerDispose).toHaveBeenCalledTimes(1);
	});
});
