import { PtyLiveWidgetController, buildWidgetLines, formatElapsedMmSs, widgetInternals } from "../src/widget.js";

const theme = {
	bold: (text: string) => text,
	fg: (_color: string, text: string) => text,
};

describe("pTY live widget", () => {
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
				ansiLines: ["line-1", "line-2", "line-3"],
				command: "pnpm test --watch",
				exitCode: null,
				startedAt: Date.now() - 7_000,
				status: "running",
			},
			{ maxLines: 2 },
			Date.now(),
		);
		expect(lines[0]).toContain("🖥 Bash PTY");
		expect(lines[0]).toContain("00:07");
		expect(lines.slice(-2)).toStrictEqual(["line-2", "line-3"]);
		expect(
			buildWidgetLines(theme, {
				ansiLines: [],
				command: "echo ready",
				exitCode: 0,
				startedAt: Date.now(),
				status: "completed",
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
			ansiLines: ["booting"],
			command: "pnpm dev",
			exitCode: null,
			startedAt: Date.now() - 2_000,
			status: "running",
		});
		controller.update({
			ansiLines: ["booting", "ready"],
			command: "pnpm dev",
			exitCode: null,
			startedAt: Date.now() - 2_000,
			status: "running",
		});

		expect(setWidget).toHaveBeenCalledOnce();
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
		expect(requestRender).toHaveBeenCalledOnce();

		await vi.advanceTimersByTimeAsync(1000);
		expect(requestRender).toHaveBeenCalledTimes(2);

		controller.update({
			ansiLines: ["done"],
			command: "pnpm dev",
			exitCode: 0,
			startedAt: Date.now() - 2_000,
			status: "completed",
		});
		await vi.advanceTimersByTimeAsync(120);
		expect(requestRender).toHaveBeenCalledTimes(3);
		await vi.advanceTimersByTimeAsync(1000);
		expect(requestRender).toHaveBeenCalledTimes(3);

		controller.clear();
		expect(setWidget).toHaveBeenLastCalledWith("pty-widget");
		widget.dispose();

		controller.dispose();
	});

	it("becomes a no-op when the context has no UI", () => {
		const controller = new PtyLiveWidgetController({ hasUI: false }, { key: "no-ui" });
		controller.update({
			ansiLines: ["hi"],
			command: "echo hi",
			exitCode: null,
			startedAt: Date.now(),
			status: "running",
		});
		controller.clear();
		controller.dispose();

		const setWidget = vi.fn();
		const controllerWithDefaultKey = new PtyLiveWidgetController({ hasUI: true, ui: { setWidget } });
		controllerWithDefaultKey.update({
			ansiLines: ["hi"],
			command: "echo hi",
			exitCode: 0,
			startedAt: Date.now(),
			status: "completed",
		});
		controllerWithDefaultKey.clear();
		expect(setWidget).toHaveBeenCalledWith();
	});
});
