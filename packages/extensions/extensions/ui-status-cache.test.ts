import { describe, expect, it, vi } from "vitest";

import { createStatusBarState } from "./ui-status-cache";

describe("createStatusBarState", () => {
	it("skips initial undefined clears for unseen keys", () => {
		const setStatus = vi.fn();
		const statusBar = createStatusBarState();
		const target = {
			hasUI: true,
			ui: { setStatus },
		};

		expect(statusBar.set(target, "watchdog", undefined)).toBe(false);
		expect(setStatus).not.toHaveBeenCalled();
	});

	it("still clears keys after a value was previously written", () => {
		const setStatus = vi.fn();
		const statusBar = createStatusBarState();
		const target = {
			hasUI: true,
			ui: { setStatus },
		};

		expect(statusBar.set(target, "watchdog", "lag p99 80ms")).toBe(true);
		expect(statusBar.set(target, "watchdog", undefined)).toBe(true);
		expect(setStatus).toHaveBeenNthCalledWith(1, "watchdog", "lag p99 80ms");
		expect(setStatus).toHaveBeenNthCalledWith(2, "watchdog", undefined);
	});

	it("keeps targets isolated when the active UI target changes", () => {
		const firstSetStatus = vi.fn();
		const secondSetStatus = vi.fn();
		const statusBar = createStatusBarState();
		const firstTarget = {
			hasUI: true,
			ui: { setStatus: firstSetStatus },
		};
		const secondTarget = {
			hasUI: true,
			ui: { setStatus: secondSetStatus },
		};

		expect(statusBar.set(firstTarget, "watchdog", "active")).toBe(true);
		expect(statusBar.set(secondTarget, "watchdog", undefined)).toBe(false);
		expect(statusBar.set(secondTarget, "watchdog", "active")).toBe(true);
		expect(firstSetStatus).toHaveBeenCalledTimes(1);
		expect(secondSetStatus).toHaveBeenCalledTimes(1);
	});
});
