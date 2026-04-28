import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
	mockExistsSync: vi.fn(() => false),
	mockReadFileSync: vi.fn(),
}));

const histogram = {
	enable: vi.fn(),
	disable: vi.fn(),
	reset: vi.fn(),
	percentile: vi.fn(() => 0),
	mean: 0,
	max: 0,
};

vi.mock("node:fs", () => ({
	existsSync: mockExistsSync,
	readFileSync: mockReadFileSync,
}));

vi.mock("node:perf_hooks", () => ({
	monitorEventLoopDelay: vi.fn(() => histogram),
}));

vi.mock("node:os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	return {
		...actual,
		cpus: () => [{}, {}, {}, {}],
	};
});

vi.mock("@mariozechner/pi-coding-agent", () => ({}));

import { getSafeModeState, resetSafeModeStateForTests } from "./runtime-mode";
import watchdogExtension, {
	applySafeMode,
	calculateCpuPercent,
	createWatchdogSample,
	evaluateWatchdogSample,
	formatWatchdogStatus,
	loadWatchdogConfig,
	resolveWatchdogSampleIntervalMs,
	resolveWatchdogThresholds,
	WATCHDOG_CONFIG_PATH,
} from "./watchdog";
import { recordRuntimeMetric, resetRuntimeDiagnosticsForTests } from "./watchdog-runtime-diagnostics";

function createMockPi() {
	const handlers = new Map<string, ((...args: any[]) => any)[]>();
	const commands = new Map<string, any>();
	const tools = new Map<string, any>();
	const shortcuts = new Map<string, any>();
	const eventHandlers = new Map<string, ((data: unknown) => void)[]>();

	return {
		on(event: string, handler: (...args: any[]) => any) {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			handlers.get(event)?.push(handler);
		},
		registerCommand(name: string, command: any) {
			commands.set(name, command);
		},
		registerTool(tool: any) {
			tools.set(tool.name, tool);
		},
		registerShortcut(name: string, shortcut: any) {
			shortcuts.set(name, shortcut);
		},
		events: {
			on(event: string, handler: (data: unknown) => void) {
				if (!eventHandlers.has(event)) {
					eventHandlers.set(event, []);
				}
				eventHandlers.get(event)?.push(handler);
			},
			emit(event: string, data: unknown) {
				for (const handler of eventHandlers.get(event) ?? []) {
					handler(data);
				}
			},
		},
		_commands: commands,
		_tools: tools,
		_shortcuts: shortcuts,
		async _emit(event: string, ...args: any[]) {
			for (const handler of handlers.get(event) ?? []) {
				await handler(...args);
			}
		},
	};
}

function createMockCtx() {
	const notifications: Array<{ msg: string; level: string }> = [];
	const statuses = new Map<string, string | undefined>();
	const statusCalls: Array<{ key: string; value: string | undefined }> = [];
	const custom = vi.fn().mockResolvedValue(undefined);
	return {
		hasUI: true,
		ui: {
			notify(msg: string, level: string) {
				notifications.push({ msg, level });
			},
			setStatus(key: string, value: string | undefined) {
				statusCalls.push({ key, value });
				statuses.set(key, value);
			},
			custom,
		},
		_notifications: notifications,
		_statuses: statuses,
		_statusCalls: statusCalls,
		_custom: custom,
	};
}

function mockCpuUsageSequence(values: Array<{ user: number; system: number }>) {
	const fallback = values[values.length - 1] ?? { user: 0, system: 0 };
	return vi.spyOn(process, "cpuUsage").mockImplementation(() => values.shift() ?? fallback);
}

function mockMemoryUsage(overrides: Partial<NodeJS.MemoryUsage> = {}) {
	return vi.spyOn(process, "memoryUsage").mockReturnValue({
		rss: 200 * 1024 * 1024,
		heapTotal: 100 * 1024 * 1024,
		heapUsed: 80 * 1024 * 1024,
		external: 10,
		arrayBuffers: 5,
		...overrides,
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	histogram.mean = 0;
	histogram.max = 0;
	histogram.percentile.mockReturnValue(0);
	mockExistsSync.mockReset();
	mockExistsSync.mockReturnValue(false);
	mockReadFileSync.mockReset();
	resetSafeModeStateForTests();
	resetRuntimeDiagnosticsForTests();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
	resetSafeModeStateForTests();
	resetRuntimeDiagnosticsForTests();
});

describe("watchdog helpers", () => {
	it("calculates process cpu percentage across cores", () => {
		expect(calculateCpuPercent({ user: 400_000, system: 0 }, 1_000, 4)).toBeCloseTo(10);
	});

	it("builds a normalized watchdog sample", () => {
		const sample = createWatchdogSample({
			timestamp: 123,
			cpuUsage: { user: 500_000, system: 250_000 },
			elapsedMs: 1_000,
			coreCount: 2,
			memoryUsage: {
				rss: 300 * 1024 * 1024,
				heapUsed: 150 * 1024 * 1024,
				heapTotal: 200 * 1024 * 1024,
			},
			eventLoopMeanNs: 10_000_000,
			eventLoopP99Ns: 120_000_000,
			eventLoopMaxNs: 300_000_000,
			safeModeEnabled: false,
		});

		expect(sample.cpuPercent).toBeCloseTo(37.5);
		expect(sample.rssMb).toBe(300);
		expect(sample.eventLoopP99Ms).toBe(120);
		expect(sample.eventLoopMaxMs).toBe(300);
	});

	it("classifies problematic samples", () => {
		const alert = evaluateWatchdogSample({
			timestamp: Date.now(),
			cpuPercent: 92,
			rssMb: 1400,
			heapUsedMb: 900,
			heapTotalMb: 1000,
			eventLoopMeanMs: 40,
			eventLoopP99Ms: 180,
			eventLoopMaxMs: 320,
			safeModeEnabled: false,
		});

		expect(alert?.severity).toBe("critical");
		expect(alert?.reasons.join(",")).toContain("cpu 92%");
		expect(alert?.reasons.join(",")).toContain("rss 1400MB");
		expect(alert?.reasons.join(",")).toContain("event-loop max 320ms");
	});

	it("formats a readable status line", () => {
		const text = formatWatchdogStatus({
			timestamp: Date.now(),
			cpuPercent: 12,
			rssMb: 320,
			heapUsedMb: 140,
			heapTotalMb: 256,
			eventLoopMeanMs: 5,
			eventLoopP99Ms: 25,
			eventLoopMaxMs: 40,
			safeModeEnabled: true,
		});

		expect(text).toContain("cpu 12%");
		expect(text).toContain("safe-mode:on");
	});

	it("loads and resolves watchdog config overrides", () => {
		mockExistsSync.mockReturnValue(true);
		mockReadFileSync.mockReturnValue(
			JSON.stringify({
				enabled: false,
				sampleIntervalMs: 2500,
				thresholds: { cpuPercent: 70, eventLoopP99Ms: 90 },
			}),
		);

		const config = loadWatchdogConfig(WATCHDOG_CONFIG_PATH);

		expect(config.enabled).toBe(false);
		expect(resolveWatchdogSampleIntervalMs(config)).toBe(2500);
		expect(resolveWatchdogThresholds(config)).toMatchObject({
			cpuPercent: 70,
			eventLoopP99Ms: 90,
			rssMb: 1200,
		});
	});
});

describe("watchdog extension", () => {
	it("does not load watchdog config during extension registration", () => {
		const pi = createMockPi();
		watchdogExtension(pi as any);

		expect(mockExistsSync).not.toHaveBeenCalled();
		expect(mockReadFileSync).not.toHaveBeenCalled();
	});

	it("defers watchdog config loading until after the startup window", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		mockExistsSync.mockReturnValue(true);
		mockReadFileSync.mockReturnValue(JSON.stringify({ enabled: false }));
		watchdogExtension(pi as any);

		await pi._emit("session_start", {}, ctx);
		expect(mockExistsSync).not.toHaveBeenCalled();
		expect(mockReadFileSync).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(250);
		expect(mockExistsSync).toHaveBeenCalledTimes(1);
		expect(mockReadFileSync).toHaveBeenCalledTimes(1);
	});

	it("cancels deferred watchdog config loading on session_shutdown", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		mockExistsSync.mockReturnValue(true);
		mockReadFileSync.mockReturnValue(JSON.stringify({ enabled: false }));
		watchdogExtension(pi as any);

		await pi._emit("session_start", {}, ctx);
		await pi._emit("session_shutdown");
		await vi.advanceTimersByTimeAsync(250);

		expect(mockExistsSync).not.toHaveBeenCalled();
		expect(mockReadFileSync).not.toHaveBeenCalled();
	});

	it("applies safe mode and broadcasts an event", () => {
		const pi = createMockPi();
		const seen: any[] = [];
		pi.events.on("oh-pi:safe-mode", (state) => seen.push(state));

		const state = applySafeMode(pi as any, true, {
			source: "manual",
			reason: "test",
			auto: false,
		});

		expect(state.enabled).toBe(true);
		expect(getSafeModeState().enabled).toBe(true);
		expect(seen).toHaveLength(1);
	});

	it("ignores the first automatic startup sample", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		watchdogExtension(pi as any);

		mockCpuUsageSequence([
			{ user: 0, system: 0 },
			{ user: 0, system: 0 },
			{ user: 4_500_000, system: 0 },
		]);
		mockMemoryUsage({
			rss: 1400 * 1024 * 1024,
			heapUsed: 900 * 1024 * 1024,
			heapTotal: 1000 * 1024 * 1024,
		});
		histogram.mean = 30_000_000;
		histogram.max = 320_000_000;
		histogram.percentile.mockReturnValue(180_000_000);

		await pi._emit("session_start", {}, ctx);
		await vi.advanceTimersByTimeAsync(5000);

		expect(ctx._statuses.get("watchdog")).toBeUndefined();
		expect(ctx._notifications.some((item) => item.msg.includes("Performance watchdog"))).toBe(false);
	});

	it("ignores stale event-loop samples after long timer gaps", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		watchdogExtension(pi as any);

		mockCpuUsageSequence([
			{ user: 0, system: 0 },
			{ user: 0, system: 0 },
		]);
		mockMemoryUsage();
		histogram.mean = 173_007_000_000;
		histogram.max = 173_007_000_000;
		histogram.percentile.mockReturnValue(173_007_000_000);

		await pi._emit("session_start", {}, ctx);
		vi.setSystemTime(Date.now() + 178_000);
		await pi._commands.get("watchdog").handler("sample", ctx);

		expect(ctx._statuses.get("watchdog")).toBeUndefined();
		expect(ctx._notifications.some((item) => item.msg.includes("Performance watchdog"))).toBe(false);
		expect(getSafeModeState().enabled).toBe(false);
	});

	it("auto-enables safe mode after repeated laggy samples", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		watchdogExtension(pi as any);

		mockCpuUsageSequence([
			{ user: 0, system: 0 },
			{ user: 0, system: 0 },
			{ user: 4_500_000, system: 0 },
			{ user: 4_500_000, system: 0 },
		]);
		mockMemoryUsage({
			rss: 1400 * 1024 * 1024,
			heapUsed: 900 * 1024 * 1024,
			heapTotal: 1000 * 1024 * 1024,
		});
		histogram.mean = 30_000_000;
		histogram.max = 320_000_000;
		histogram.percentile.mockReturnValue(180_000_000);

		await pi._emit("session_start", {}, ctx);
		await vi.advanceTimersByTimeAsync(15_000);

		expect(getSafeModeState().enabled).toBe(true);
		expect(ctx._statuses.get("watchdog")).toContain("event-loop");
		expect(ctx._statuses.get("safe-mode")).toContain("watchdog");
		expect(ctx._notifications.some((item) => item.msg.includes("safe mode automatically"))).toBe(true);
	});

	it("suppresses repeated alert notifications after the limit", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		watchdogExtension(pi as any);

		mockCpuUsageSequence([
			{ user: 0, system: 0 },
			{ user: 0, system: 0 },
			{ user: 4_500_000, system: 0 },
			{ user: 4_500_000, system: 0 },
			{ user: 4_500_000, system: 0 },
			{ user: 4_500_000, system: 0 },
		]);
		mockMemoryUsage({
			rss: 1400 * 1024 * 1024,
			heapUsed: 900 * 1024 * 1024,
			heapTotal: 1000 * 1024 * 1024,
		});
		histogram.mean = 30_000_000;
		histogram.max = 320_000_000;
		histogram.percentile.mockReturnValue(180_000_000);

		await pi._emit("session_start", {}, ctx);
		await vi.advanceTimersByTimeAsync(10_000);
		await vi.advanceTimersByTimeAsync(55_000);

		expect(ctx._notifications.some((item) => item.msg.includes("Further alerts suppressed"))).toBe(true);
	});

	it("registers safe-mode commands that toggle shared state", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		watchdogExtension(pi as any);

		expect(pi._commands.has("watchdog:status")).toBe(true);
		const command = pi._commands.get("safe-mode");
		expect(command).toBeDefined();

		await command.handler("on", ctx);
		expect(getSafeModeState().enabled).toBe(true);

		await command.handler("off", ctx);
		expect(getSafeModeState().enabled).toBe(false);
		expect(ctx._statuses.get("safe-mode")).toBeUndefined();
	});

	it("skips repeated clean watchdog status clears when nothing was shown", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		watchdogExtension(pi as any);

		mockCpuUsageSequence([
			{ user: 0, system: 0 },
			{ user: 0, system: 0 },
			{ user: 0, system: 0 },
		]);
		mockMemoryUsage();

		await pi._emit("session_start", {}, ctx);
		await vi.advanceTimersByTimeAsync(10_000);

		const watchdogCalls = ctx._statusCalls.filter((call) => call.key === "watchdog");
		expect(watchdogCalls).toEqual([]);
	});

	it("resets watchdog history and clears alert status", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		watchdogExtension(pi as any);
		mockCpuUsageSequence([
			{ user: 0, system: 0 },
			{ user: 4_500_000, system: 0 },
			{ user: 4_500_000, system: 0 },
			{ user: 4_500_000, system: 0 },
		]);
		mockMemoryUsage({
			rss: 1400 * 1024 * 1024,
			heapUsed: 900 * 1024 * 1024,
			heapTotal: 1000 * 1024 * 1024,
		});
		histogram.mean = 30_000_000;
		histogram.max = 320_000_000;
		histogram.percentile.mockReturnValue(180_000_000);

		await pi._emit("session_start", {}, ctx);
		await pi._commands.get("watchdog").handler("sample", ctx);
		expect(ctx._statuses.get("watchdog")).toContain("event-loop");

		await pi._commands.get("watchdog").handler("reset", ctx);
		expect(ctx._statuses.get("watchdog")).toBeUndefined();
		expect(ctx._notifications.some((item) => item.msg.includes("history reset"))).toBe(true);

		mockCpuUsageSequence([
			{ user: 0, system: 0 },
			{ user: 0, system: 0 },
		]);
		mockMemoryUsage();
		histogram.mean = 0;
		histogram.max = 0;
		histogram.percentile.mockReturnValue(0);

		await pi._commands.get("watchdog").handler("overlay", ctx);
		const factory = ctx._custom.mock.calls.at(-1)[0] as (...args: unknown[]) => { render: (width: number) => string[] };
		const component = factory(
			{ requestRender: vi.fn() },
			{
				fg: (_color: string, text: string) => text,
				bold: (text: string) => text,
			},
			{},
			vi.fn(),
		);
		expect(component.render(200).join("\n")).toContain("No alerts yet.");
	});

	it("surfaces likely culprit extensions in watchdog diagnostics", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		watchdogExtension(pi as any);
		recordRuntimeMetric({
			extensionId: "scheduler",
			pendingTasks: 8,
			dueTasks: 3,
			note: "dispatch throttled",
		});

		await pi._commands.get("watchdog").handler("blame", ctx);

		expect(ctx._notifications.at(-1)?.msg).toContain("scheduler");
		expect(ctx._notifications.at(-1)?.msg).toContain("queued tasks");
	});

	it("opens a watchdog overlay dashboard", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		watchdogExtension(pi as any);
		mockCpuUsageSequence([
			{ user: 0, system: 0 },
			{ user: 0, system: 0 },
		]);
		mockMemoryUsage();

		await pi._emit("session_start", {}, ctx);
		await pi._commands.get("watchdog").handler("overlay", ctx);

		expect(ctx._custom).toHaveBeenCalledWith(expect.any(Function), {
			overlay: true,
			overlayOptions: { anchor: "center", width: 84, maxHeight: "80%" },
		});

		const factory = ctx._custom.mock.calls[0][0] as (...args: unknown[]) => { render: (width: number) => string[] };
		const component = factory(
			{ requestRender: vi.fn() },
			{
				fg: (_color: string, text: string) => text,
				bold: (text: string) => text,
			},
			{},
			vi.fn(),
		);
		const rendered = component.render(200).join("\n");
		expect(rendered).toContain("Performance Watchdog");
		expect(rendered).toContain("Current sample");
		expect(rendered).toContain("Recent alerts");
		expect(rendered).toContain("Config:");
	});

	it("supports colon aliases for startup and status guidance", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		watchdogExtension(pi as any);

		await pi._commands.get("watchdog:startup").handler("", ctx);
		expect(ctx._notifications.at(-1)?.msg).toContain("/watchdog:startup");

		expect(pi._commands.get("watchdog:status")?.description).toContain("watchdog status");
		await expect(pi._commands.get("watchdog:status").handler("", ctx)).resolves.toBeUndefined();
	});
});
