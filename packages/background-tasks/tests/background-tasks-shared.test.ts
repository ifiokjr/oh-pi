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
	isBackgroundTaskEventDetails,
	parseOutputMatcher,
	resolveTaskByToken,
	summarizeTaskStatus,
	tailText,
	taskDisplayName,
	trimOutputBuffer,
} from "../background-tasks-shared.js";

describe("background task shared helpers", () => {
	it("adds the pi managed bin dir to the active PATH key", () => {
		const env = createBgProcessShellEnv({ Path: "/usr/bin" }, "/mock-home/.pi/agent");
		expect(env.Path?.split(delimiter)[0]).toBe(join("/mock-home/.pi/agent", "bin"));
		expect(env.PATH).toBeUndefined();
	});

	it("preserves an existing managed bin dir and initializes PATH when missing", () => {
		const binDir = join("/mock-home/.pi/agent", "bin");
		expect(createBgProcessShellEnv({ PATH: `${binDir}${delimiter}/usr/bin` }, "/mock-home/.pi/agent").PATH).toBe(
			`${binDir}${delimiter}/usr/bin`,
		);
		expect(createBgProcessShellEnv({}, "/mock-home/.pi/agent").PATH).toBe(binDir);
	});

	it("builds temp log paths and output tails", () => {
		expect(getBgProcessLogFilePath(123, "C:/Temp", "bg-1")).toBe(join("C:/Temp", "oh-pi-bg-bg-1-123.log"));
		expect(getBgProcessLogFilePath(123, "/tmp", " ### ")).toBe(join("/tmp", "oh-pi-bg-123.log"));
		expect(tailText("abcdef", 4)).toContain("cdef");
		expect(tailText("abc", 4)).toBe("abc");
	});

	it("parses output matchers as regex or substring tests", () => {
		expect(parseOutputMatcher("ready")?.("server READY now")).toBe(true);
		expect(parseOutputMatcher("/done\\s+now/i")?.("DONE now")).toBe(true);
		expect(parseOutputMatcher("/(/")?.("/(/")).toBe(true);
		expect(parseOutputMatcher("   ")).toBeNull();
		expect(parseOutputMatcher(undefined)).toBeNull();
	});

	it("formats durations, ages, and status summaries", () => {
		expect(formatDuration(-1)).toBe("0ms");
		expect(formatDuration(950)).toBe("950ms");
		expect(formatDuration(9_500)).toBe("9.5s");
		expect(formatDuration(10_000)).toBe("10s");
		expect(formatDuration(60_000)).toBe("1m");
		expect(formatDuration(90_000)).toBe("1m 30s");
		expect(formatDuration(3_600_000)).toBe("1h");
		expect(formatDuration(7_200_000)).toBe("2h");
		expect(formatRelativeTime(Date.now(), Date.now())).toBe("just now");
		expect(formatRelativeTime(Date.now() - 5_000, Date.now())).toBe("5s ago");
		expect(formatRelativeTime(Date.now() - 120_000, Date.now())).toBe("2m ago");
		expect(formatRelativeTime(Date.now() - 7_200_000, Date.now())).toBe("2h ago");
		expect(formatRelativeTime(Date.now() - 172_800_000, Date.now())).toBe("2d ago");
		expect(summarizeTaskStatus("running", null)).toBe("running");
		expect(summarizeTaskStatus("completed", 0)).toBe("completed (exit 0)");
		expect(summarizeTaskStatus("failed", null)).toBe("failed (exit ?)");
		expect(summarizeTaskStatus("stopped", null)).toBe("stopped");
		expect(summarizeTaskStatus("stopped", 9)).toBe("stopped (exit 9)");
	});

	it("trims buffered output, resolves display names, and summarizes tracked tasks", () => {
		const trimmed = trimOutputBuffer("0123456789", 8, 6);
		expect(trimmed.output).toBe("456789");
		expect(trimmed.lastAlertLength).toBe(4);
		expect(trimOutputBuffer("abc", 2, 6)).toEqual({ output: "abc", lastAlertLength: 2 });
		expect(taskDisplayName({ title: "   ", command: "pnpm test --watch" })).toBe("pnpm test --watch");

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
				expiresAt: Date.now() + 590_000,
				status: "running",
				exitCode: null,
				reactToOutput: true,
				notifyPattern: undefined,
				outputBytes: 42,
			}),
		).toContain("bg-1 · running · pid 1234");
	});

	it("validates event payloads and resolves tasks by id or pid", () => {
		expect(isBackgroundTaskEventDetails(null)).toBe(false);
		expect(isBackgroundTaskEventDetails({ eventType: "noop", task: {}, outputTail: "x" })).toBe(false);
		expect(
			isBackgroundTaskEventDetails({
				eventType: "output",
				task: { id: "bg-1" },
				outputTail: "ready",
			}),
		).toBe(true);

		const tasks = [
			{ id: "bg-1", pid: 123 },
			{ id: "bg-2", pid: 456 },
		];
		expect(resolveTaskByToken(tasks, undefined)).toBeNull();
		expect(resolveTaskByToken(tasks, "   ")).toBeNull();
		expect(resolveTaskByToken(tasks, "bg-2")).toBe(tasks[1]);
		expect(resolveTaskByToken(tasks, 123)).toBe(tasks[0]);
		expect(resolveTaskByToken(tasks, "999")).toBeNull();
	});
});
