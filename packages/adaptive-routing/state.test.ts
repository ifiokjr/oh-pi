import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { getAgentDir } = vi.hoisted(() => ({
	getAgentDir: vi.fn(() => "/mock-home/.pi/agent"),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	getAgentDir,
}));

import { getAdaptiveRoutingStatePath, readAdaptiveRoutingState, writeAdaptiveRoutingState } from "./state.js";

describe("adaptive routing state", () => {
	it("reads default state when file does not exist", () => {
		const state = readAdaptiveRoutingState();
		expect(state).toEqual({});
	});

	it("debounces state writes", () => {
		vi.useFakeTimers();
		const tempDir = mkdtempSync(join(tmpdir(), "adaptive-routing-state-"));
		getAgentDir.mockReturnValue(tempDir);

		try {
			writeAdaptiveRoutingState({ mode: "auto" });
			// Before timer fires, file should not exist
			expect(() => readFileSync(getAdaptiveRoutingStatePath(), "utf-8")).toThrow();

			vi.advanceTimersByTime(2_100);

			const raw = readFileSync(getAdaptiveRoutingStatePath(), "utf-8");
			const parsed = JSON.parse(raw);
			expect(parsed.mode).toBe("auto");
		} finally {
			vi.useRealTimers();
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("coalesces multiple rapid writes into one file write", () => {
		vi.useFakeTimers();
		const tempDir = mkdtempSync(join(tmpdir(), "adaptive-routing-state-"));
		getAgentDir.mockReturnValue(tempDir);

		try {
			writeAdaptiveRoutingState({ mode: "auto" });
			writeAdaptiveRoutingState({ mode: "shadow" });
			writeAdaptiveRoutingState({ mode: "off" });

			vi.advanceTimersByTime(2_100);

			const raw = readFileSync(getAdaptiveRoutingStatePath(), "utf-8");
			const parsed = JSON.parse(raw);
			// Should contain the last value written
			expect(parsed.mode).toBe("off");
		} finally {
			vi.useRealTimers();
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
