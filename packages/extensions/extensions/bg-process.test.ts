import { EventEmitter } from "node:events";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getShellConfigMock, spawnMock } = vi.hoisted(() => ({
	getShellConfigMock: vi.fn(() => ({ shell: "C:/Program Files/Git/bin/bash.exe", args: ["-c"] })),
	spawnMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	spawn: spawnMock,
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	getAgentDir: () => "/mock-home/.pi/agent",
	getShellConfig: getShellConfigMock,
}));

vi.mock("@mariozechner/pi-ai", () => ({
	StringEnum: (values: readonly string[], options?: Record<string, unknown>) => ({
		type: "string",
		enum: [...values],
		...options,
	}),
}));

vi.mock("@ifi/pi-background-tasks", async () => await import("../../background-tasks/index.ts"));

vi.mock("@sinclair/typebox", () => ({
	Type: {
		Object: (schema: unknown) => schema,
		String: (options?: Record<string, unknown>) => ({ type: "string", ...options }),
		Number: (options?: Record<string, unknown>) => ({ type: "number", ...options }),
		Boolean: (options?: Record<string, unknown>) => ({ type: "boolean", ...options }),
		Optional: (value: unknown) => ({ optional: true, ...((value as object | undefined) ?? {}) }),
	},
}));

import bgProcessExtension, { createBgProcessShellEnv, getBgProcessLogFilePath } from "./bg-process.js";

function createMockPi() {
	const tools = new Map<string, any>();
	return {
		registerTool(tool: any) {
			tools.set(tool.name, tool);
		},
		registerMessageRenderer() {},
		registerCommand() {},
		registerShortcut() {},
		on() {},
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
	getShellConfigMock.mockReturnValue({ shell: "C:/Program Files/Git/bin/bash.exe", args: ["-c"] });
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

	it("uses pi shell resolution instead of spawning a bare bash command", async () => {
		const child = createMockChild();
		spawnMock.mockReturnValueOnce(child);

		const pi = createMockPi();
		bgProcessExtension(pi as never);
		const tool = pi.tools.get("bash");

		const resultPromise = tool.execute("tool-1", { command: "echo hello" });
		child.stdout.emit("data", Buffer.from("hello\n"));
		child.emit("close", 0);

		const result = await resultPromise;

		expect(getShellConfigMock).toHaveBeenCalledOnce();
		expect(spawnMock).toHaveBeenCalledWith(
			"C:/Program Files/Git/bin/bash.exe",
			["-c", "echo hello"],
			expect.objectContaining({
				cwd: process.cwd(),
				stdio: ["ignore", "pipe", "pipe"],
				env: expect.objectContaining({
					PATH: expect.stringContaining(join("/mock-home/.pi/agent", "bin")),
				}),
			}),
		);
		expect(result.content[0].text).toBe("hello");
	});
});
