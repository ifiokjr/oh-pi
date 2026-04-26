import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	formatExtensionDiagnostic,
	getExtensionDiagnostics,
	recordRuntimeMetric,
	recordRuntimeSample,
	recordRuntimeUiActivity,
	resetRuntimeDiagnosticsForTests,
} from "./watchdog-runtime-diagnostics.js";

describe("watchdog runtime diagnostics", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-15T10:00:00Z"));
		resetRuntimeDiagnosticsForTests();
	});

	afterEach(() => {
		vi.useRealTimers();
		resetRuntimeDiagnosticsForTests();
	});

	it("ranks likely culprit extensions using recent runtime activity", () => {
		recordRuntimeSample("scheduler", "event", "turn_end", 140, "scheduler");
		recordRuntimeUiActivity("scheduler", "status", "scheduler");
		recordRuntimeUiActivity("scheduler", "status", "scheduler");
		recordRuntimeMetric({ extensionId: "scheduler", pendingTasks: 6, dueTasks: 2, note: "observer mode" });

		recordRuntimeSample("git-guard", "event", "tool_call", 20, "git-guard");

		const diagnostics = getExtensionDiagnostics();
		expect(diagnostics[0]?.extensionId).toBe("scheduler");
		expect(formatExtensionDiagnostic(diagnostics[0])).toContain("queued tasks");
		expect(diagnostics[0]?.reasons.join(" ")).toContain("due tasks");
	});

	it("drops stale activity outside the recent diagnostic window", async () => {
		recordRuntimeSample("bg-process", "tool", "bash", 200, "bg-process");
		await vi.advanceTimersByTimeAsync(125_000);

		expect(getExtensionDiagnostics()).toEqual([]);
	});
});
