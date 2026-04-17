import { delimiter, join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-coding-agent", () => ({
	getAgentDir: () => "/mock-home/.pi/agent",
}));

import {
	buildTaskSummaryLine,
	createBgProcessShellEnv,
	formatDuration,
	formatRelativeTime,
	getBgProcessLogFilePath,
	parseOutputMatcher,
	summarizeTaskStatus,
	tailText,
	trimOutputBuffer,
} from "../background-tasks-shared.js";

describe("background task shared helpers", () => {
	it("adds the pi managed bin dir to the active PATH key", () => {
		const env = createBgProcessShellEnv({ Path: "/usr/bin" }, "/mock-home/.pi/agent");
		expect(env.Path?.split(delimiter)[0]).toBe(join("/mock-home/.pi/agent", "bin"));
		expect(env.PATH).toBeUndefined();
	});

	it("builds temp log paths and output tails", () => {
		expect(getBgProcessLogFilePath(123, "C:/Temp", "bg-1")).toBe(join("C:/Temp", "oh-pi-bg-bg-1-123.log"));
		expect(tailText("abcdef", 4)).toContain("cdef");
	});

	it("parses output matchers as regex or substring tests", () => {
		expect(parseOutputMatcher("ready")?.("server READY now")).toBe(true);
		expect(parseOutputMatcher("/done\\s+now/i")?.("DONE now")).toBe(true);
		expect(parseOutputMatcher("/")?.("anything")).toBe(false);
		expect(parseOutputMatcher(undefined)).toBeNull();
	});

	it("formats durations, ages, and status summaries", () => {
		expect(formatDuration(950)).toBe("950ms");
		expect(formatDuration(9_500)).toBe("9.5s");
		expect(formatDuration(90_000)).toBe("1m 30s");
		expect(formatRelativeTime(Date.now() - 5_000, Date.now())).toBe("5s ago");
		expect(summarizeTaskStatus("running", null)).toBe("running");
		expect(summarizeTaskStatus("completed", 0)).toBe("completed (exit 0)");
	});

	it("trims buffered output and summarizes tracked tasks", () => {
		const trimmed = trimOutputBuffer("0123456789", 8, 6);
		expect(trimmed.output).toBe("456789");
		expect(trimmed.lastAlertLength).toBe(4);

		expect(
			buildTaskSummaryLine({
				id: "bg-1",
				title: "gh pr checks",
				command: "gh pr checks 123 --watch",
				cwd: "/repo",
				pid: 1234,
				logFile: "/tmp/bg.log",
				startedAt: Date.now() - 10_000,
				updatedAt: Date.now() - 1_000,
				lastOutputAt: Date.now() - 2_000,
				status: "running",
				exitCode: null,
				reactToOutput: true,
				notifyPattern: undefined,
				outputBytes: 42,
			}),
		).toContain("bg-1 · running · pid 1234");
	});
});
