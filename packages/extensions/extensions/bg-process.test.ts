import { EventEmitter } from "node:events";
import { delimiter, join } from "node:path";

const { createBashToolMock, getShellConfigMock, spawnMock } = vi.hoisted(() => ({
	createBashToolMock: vi.fn(() => ({
		description: "Built-in bash tool.",
		execute: vi.fn(),
		label: "Bash",
		renderCall: undefined,
		renderResult: undefined,
	})),
	getShellConfigMock: vi.fn(() => ({ args: ["-c"], shell: "C:/Program Files/Git/bin/bash.exe" })),
	spawnMock: vi.fn(),
}));

vi.mock<typeof import("node:child_process")>(import("node:child_process"), () => ({
	spawn: spawnMock,
}));

vi.mock<typeof import("@mariozechner/pi-coding-agent")>(import("@mariozechner/pi-coding-agent"), () => ({
	createBashTool: createBashToolMock,
	getAgentDir: () => "/mock-home/.pi/agent",
	getShellConfig: getShellConfigMock,
}));

vi.mock<typeof import("@mariozechner/pi-ai")>(import("@mariozechner/pi-ai"), () => ({
	StringEnum: (values: readonly string[], options?: Record<string, unknown>) => ({
		enum: [...values],
		type: "string",
		...options,
	}),
}));

vi.mock<typeof import("@ifi/pi-background-tasks")>(
	import("@ifi/pi-background-tasks"),
	async () => await import("../../background-tasks/index.ts"),
);

vi.mock<typeof import("@sinclair/typebox")>(import("@sinclair/typebox"), () => ({
	Type: {
		Boolean: (options?: Record<string, unknown>) => ({ type: "boolean", ...options }),
		Number: (options?: Record<string, unknown>) => ({ type: "number", ...options }),
		Object: (schema: unknown) => schema,
		Optional: (value: unknown) => ({ optional: true, ...((value as object | undefined) ?? {}) }),
		String: (options?: Record<string, unknown>) => ({ type: "string", ...options }),
	},
}));

import bgProcessExtension, { createBgProcessShellEnv, getBgProcessLogFilePath } from "./bg-process.js";

function createMockPi() {
	const tools = new Map<string, any>();
	return {
		on() {},
		registerCommand() {},
		registerMessageRenderer() {},
		registerShortcut() {},
		registerTool(tool: any) {
			tools.set(tool.name, tool);
		},
		sendMessage() {},
		tools,
	};
}

function createMockChild() {
	const child = new EventEmitter() as EventEmitter & {
		pid: number;
		stdout: EventEmitter;
		stderr: EventEmitter;
		unref: ReturnType<typeof vi.fn>;
		kill: ReturnType<typeof vi.fn>;
	};
	child.pid = 4321;
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	child.unref = vi.fn();
	child.kill = vi.fn();
	return child;
}

afterEach(() => {
	vi.clearAllMocks();
	getShellConfigMock.mockReturnValue({ args: ["-c"], shell: "C:/Program Files/Git/bin/bash.exe" });
});

describe("bg-process", () => {
	it("adds the pi managed bin dir to the active PATH key", () => {
		const env = createBgProcessShellEnv({ Path: "/usr/bin" }, "/mock-home/.pi/agent");
		expect(env.Path?.split(delimiter)[0]).toBe(join("/mock-home/.pi/agent", "bin"));
		expect(env.PATH).toBeUndefined();
	});

	it("uses the system temp directory for background logs", () => {
		expect(getBgProcessLogFilePath(123, "C:/Temp")).toBe(join("C:/Temp", "oh-pi-bg-123.log"));
	});

	it("uses pi shell resolution for explicit background tasks", async () => {
		const child = createMockChild();
		spawnMock.mockReturnValueOnce(child);

		const pi = createMockPi();
		bgProcessExtension(pi as never);
		const tool = pi.tools.get("bg_task");

		const result = await tool.execute("tool-1", { action: "spawn", command: "echo hello" });

		expect(getShellConfigMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledWith(
			"C:/Program Files/Git/bin/bash.exe",
			["-c", "echo hello"],
			expect.objectContaining({
				cwd: process.cwd(),
				env: expect.objectContaining({
					PATH: expect.stringContaining(join("/mock-home/.pi/agent", "bin")),
				}),
				stdio: ["ignore", "pipe", "pipe"],
			}),
		);
		expect(result.content[0].text).toContain("Started bg-1");
	});
});
