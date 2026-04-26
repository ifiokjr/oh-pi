import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWidgetLines, formatElapsedMmSs, PtyLiveWidgetController, widgetInternals } from "../src/widget.js";

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

describe("PTY live widget", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-21T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("formats elapsed time and builds widget lines", () => {
		expect(formatElapsedMmSs(65_000)).toBe("01:05");
		expect(widgetInternals.toStatusColor("failed")).toBe("error");
		expect(widgetInternals.toStatusColor("cancelled")).toBe("warning");
		expect(widgetInternals.toStatusLabel("timed_out")).toBe("timed out");
		expect(widgetInternals.toStatusLabel("running")).toBe("running");
		expect(widgetInternals.truncateCommand("x".repeat(120))).toContain("…");

		const lines = buildWidgetLines(
			theme,
			{
				command: "pnpm test --watch",
				startedAt: Date.now() - 7_000,
				ansiLines: ["line-1", "line-2", "line-3"],
				status: "running",
				exitCode: null,
			},
			{ maxLines: 2 },
			Date.now(),
		);
		expect(lines[0]).toContain("🖥 Bash PTY");
		expect(lines[0]).toContain("00:07");
		expect(lines.slice(-2)).toEqual(["line-2", "line-3"]);
		expect(
			buildWidgetLines(theme, {
				command: "echo ready",
				startedAt: Date.now(),
				ansiLines: [],
				status: "completed",
				exitCode: 0,
			}),
		).toContain("(waiting for output)");
	});

	it("mounts, debounces renders, updates elapsed time, and clears the widget", async () => {
		const setWidget = vi.fn();
		const controller = new PtyLiveWidgetController(
			{
				hasUI: true,
				ui: { setWidget },
			},
			{ key: "pty-widget", renderDebounceMs: 5 },
		);

		controller.update({
			command: "pnpm dev",
			startedAt: Date.now() - 2_000,
			ansiLines: ["booting"],
			status: "running",
			exitCode: null,
		});
		controller.update({
			command: "pnpm dev",
			startedAt: Date.now() - 2_000,
			ansiLines: ["booting", "ready"],
			status: "running",
			exitCode: null,
		});

		expect(setWidget).toHaveBeenCalledTimes(1);
		const widgetFactory = setWidget.mock.calls[0][1] as (
			tui: { requestRender: () => void },
			themeArg: { fg: (color: string, text: string) => string; bold: (text: string) => string },
		) => { dispose: () => void; invalidate: () => void; render: () => string[] };
		const requestRender = vi.fn();
		const widget = widgetFactory({ requestRender }, theme);

		widget.invalidate();
		expect(widget.render()).toContain("ready");
		await vi.advanceTimersByTimeAsync(119);
		expect(requestRender).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(requestRender).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1_000);
		expect(requestRender).toHaveBeenCalledTimes(2);

		controller.update({
			command: "pnpm dev",
			startedAt: Date.now() - 2_000,
			ansiLines: ["done"],
			status: "completed",
			exitCode: 0,
		});
		await vi.advanceTimersByTimeAsync(120);
		expect(requestRender).toHaveBeenCalledTimes(3);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(requestRender).toHaveBeenCalledTimes(3);

		controller.clear();
		expect(setWidget).toHaveBeenLastCalledWith("pty-widget", undefined);
		widget.dispose();

		controller.dispose();
	});

	it("becomes a no-op when the context has no UI", () => {
		const controller = new PtyLiveWidgetController({ hasUI: false }, { key: "no-ui" });
		controller.update({
			command: "echo hi",
			startedAt: Date.now(),
			ansiLines: ["hi"],
			status: "running",
			exitCode: null,
		});
		controller.clear();
		controller.dispose();

		const setWidget = vi.fn();
		const controllerWithDefaultKey = new PtyLiveWidgetController({ hasUI: true, ui: { setWidget } });
		controllerWithDefaultKey.update({
			command: "echo hi",
			startedAt: Date.now(),
			ansiLines: ["hi"],
			status: "completed",
			exitCode: 0,
		});
		controllerWithDefaultKey.clear();
		expect(setWidget).toHaveBeenCalled();
	});
});
