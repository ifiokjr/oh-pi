import { EventEmitter } from "node:events";

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";

const { createBashToolMock, getShellConfigMock, spawnMock } = vi.hoisted(() => ({
	createBashToolMock: vi.fn(),
	getShellConfigMock: vi.fn(() => ({ args: ["-lc"], shell: "/bin/bash" })),
	spawnMock: vi.fn(),
}));

vi.mock<typeof import('node:child_process')>(import('node:child_process'), () => ({
	spawn: spawnMock,
}));

vi.mock<typeof import('@mariozechner/pi-coding-agent')>(import('@mariozechner/pi-coding-agent'), async () => {
	const actual = await vi.importActual<typeof import("@mariozechner/pi-coding-agent")>("@mariozechner/pi-coding-agent");
	return {
		...actual,
		createBashTool: createBashToolMock,
		getAgentDir: () => "/mock-home/.pi/agent",
		getShellConfig: getShellConfigMock,
	};
});

vi.mock<typeof import('@mariozechner/pi-ai')>(import('@mariozechner/pi-ai'), () => ({
	StringEnum: (values: readonly string[], options?: Record<string, unknown>) => ({
		enum: [...values],
		type: "string",
		...options,
	}),
}));

vi.mock<typeof import('@sinclair/typebox')>(import('@sinclair/typebox'), () => ({
	Type: {
		Boolean: (options?: Record<string, unknown>) => ({ type: "boolean", ...options }),
		Number: (options?: Record<string, unknown>) => ({ type: "number", ...options }),
		Object: (schema: unknown) => schema,
		Optional: (value: unknown) => ({ optional: true, ...((value as object | undefined) ?? {}) }),
		String: (options?: Record<string, unknown>) => ({ type: "string", ...options }),
	},
}));

import backgroundTasksExtension from "../index.js";

function createMockChild() {
	const child = new EventEmitter() as EventEmitter & {
		pid: number;
		stdout: EventEmitter;
		stderr: EventEmitter;
		kill: ReturnType<typeof vi.fn>;
	};
	child.pid = 4321;
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	child.kill = vi.fn();
	return child;
}

describe("background tasks extension", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		createBashToolMock.mockImplementation(() => ({
			description: "Built-in bash tool.",
			execute: vi.fn(async () => ({ content: [{ type: "text", text: "" }] })),
			label: "Bash",
			renderCall: undefined,
			renderResult: undefined,
		}));
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	it("spawns tasks, tails logs, reacts to output, and reports completion", async () => {
		const child = createMockChild();
		spawnMock.mockReturnValueOnce(child);

		const harness = createExtensionHarness();
		backgroundTasksExtension(harness.pi as never);
		const tool = harness.tools.get("bg_task");

		const spawnResult = await tool.execute("tool-1", { action: "spawn", command: "echo hello" });
		expect(spawnResult.content[0].text).toContain("Started bg-1");
		expect(getShellConfigMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledWith(
			"/bin/bash",
			["-lc", "echo hello"],
			expect.objectContaining({ cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }),
		);

		child.stdout.emit("data", Buffer.from("watching\n"));
		await vi.advanceTimersByTimeAsync(1500);
		expect(harness.messages).toHaveLength(1);
		expect(harness.messages[0].details.eventType).toBe("output");

		const listResult = await tool.execute("tool-2", { action: "list" });
		expect(listResult.content[0].text).toContain("bg-1 · running");

		const logResult = await tool.execute("tool-3", { action: "log", id: "bg-1" });
		expect(logResult.content[0].text).toContain("watching");

		child.emit("close", 0);
		expect(harness.messages).toHaveLength(2);
		expect(harness.messages[1].details.eventType).toBe("exit");
		expect(harness.messages[1].details.task.status).toBe("completed");
	});

	it("opens the dashboard from the slash command and shortcut, and supports /bg watch --follow", async () => {
		const child = createMockChild();
		spawnMock.mockReturnValueOnce(child);

		const harness = createExtensionHarness();
		harness.ctx.ui.custom = vi.fn().mockResolvedValue();
		backgroundTasksExtension(harness.pi as never);

		await harness.commands.get("bg").handler("", harness.ctx);
		expect(harness.ctx.ui.custom).toHaveBeenCalledWith(expect.any(Function), {
			overlay: true,
			overlayOptions: { anchor: "center", maxHeight: "80%", width: 96 },
		});

		await harness.commands.get("bg").handler("run gh pr checks 123 --watch", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("Started bg-1");

		await harness.commands.get("bg").handler("watch --follow bg-1", harness.ctx);
		expect(harness.ctx.ui.custom).toHaveBeenCalledTimes(2);

		await harness.shortcuts.get("ctrl+shift+b").handler(harness.ctx);
		expect(harness.ctx.ui.custom).toHaveBeenCalledTimes(3);
	});

	it("stops tracked tasks and clears finished ones", async () => {
		const child = createMockChild();
		spawnMock.mockReturnValueOnce(child);

		const harness = createExtensionHarness();
		backgroundTasksExtension(harness.pi as never);
		const tool = harness.tools.get("bg_task");

		await tool.execute("tool-1", { action: "spawn", command: "pnpm test --watch" });
		const stopResult = await tool.execute("tool-2", { action: "stop", id: "bg-1" });
		expect(stopResult.content[0].text).toContain("Stopping bg-1");

		child.emit("close", null);
		const clearResult = await tool.execute("tool-3", { action: "clear" });
		expect(clearResult.content[0].text).toContain("Removed 1 finished");
	});
});
