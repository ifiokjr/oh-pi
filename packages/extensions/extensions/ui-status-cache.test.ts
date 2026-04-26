import { createStatusBarState } from "./ui-status-cache";

describe(createStatusBarState, () => {
	it("skips initial undefined clears for unseen keys", () => {
		const setStatus = vi.fn();
		const statusBar = createStatusBarState();
		const target = {
			hasUI: true,
			ui: { setStatus },
		};

		expect(statusBar.set(target, "watchdog", undefined)).toBeFalsy();
		expect(setStatus).not.toHaveBeenCalled();
	});

	it("still clears keys after a value was previously written", () => {
		const setStatus = vi.fn();
		const statusBar = createStatusBarState();
		const target = {
			hasUI: true,
			ui: { setStatus },
		};

		expect(statusBar.set(target, "watchdog", "lag p99 80ms")).toBeTruthy();
		expect(statusBar.set(target, "watchdog", undefined)).toBeTruthy();
		expect(setStatus).toHaveBeenNthCalledWith(1, "watchdog", "lag p99 80ms");
		expect(setStatus).toHaveBeenNthCalledWith(2, "watchdog");
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

		expect(statusBar.set(firstTarget, "watchdog", "active")).toBeTruthy();
		expect(statusBar.set(secondTarget, "watchdog", undefined)).toBeFalsy();
		expect(statusBar.set(secondTarget, "watchdog", "active")).toBeTruthy();
		expect(firstSetStatus).toHaveBeenCalledOnce();
		expect(secondSetStatus).toHaveBeenCalledOnce();
	});
});
