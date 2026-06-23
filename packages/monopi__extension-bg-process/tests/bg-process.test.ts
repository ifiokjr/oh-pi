import { describe, expect, it, vi } from "vitest";

const backgroundTasks = vi.hoisted(() => ({
	createBgProcessShellEnv: vi.fn(() => ({ PATH: "/mock/bin" })),
	extension: vi.fn(),
	getBgProcessLogFilePath: vi.fn(() => "/tmp/bg.log"),
}));

vi.mock("@monopi/background-tasks", () => ({
	createBgProcessShellEnv: backgroundTasks.createBgProcessShellEnv,
	default: backgroundTasks.extension,
	getBgProcessLogFilePath: backgroundTasks.getBgProcessLogFilePath,
}));

import bgProcessExtension, {
	createBgProcessShellEnv as createShellEnv,
	getBgProcessLogFilePath as getLogFilePath,
} from "../index.js";

describe("bg-process compatibility extension", () => {
	it("re-exports the background task extension and helper functions", () => {
		const pi = { registerTool: vi.fn() };

		bgProcessExtension(pi as never);

		expect(backgroundTasks.extension).toHaveBeenCalledWith(pi);
		expect(createShellEnv()).toEqual({ PATH: "/mock/bin" });
		expect(getLogFilePath()).toBe("/tmp/bg.log");
	});
});
