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

import { resetSafeModeStateForTests } from "./runtime-mode";
import watchdogExtension from "./watchdog";

function createMockPi() {
	const handlers = new Map<string, ((...args: any[]) => any)[]>();
	const commands = new Map<string, any>();

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
		events: {
			emit() {},
		},
		_commands: commands,
		async _emit(event: string, ...args: any[]) {
			for (const handler of handlers.get(event) ?? []) {
				await handler(...args);
			}
		},
	};
}

function createMockCtx() {
	return {
		hasUI: true,
		ui: {
			notify: vi.fn(),
			setStatus: vi.fn(),
			custom: vi.fn().mockResolvedValue(undefined),
		},
	};
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
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
	resetSafeModeStateForTests();
});

describe("watchdog session churn", () => {
	it("keeps a single sampling interval across repeated session starts and switches", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
		const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

		watchdogExtension(pi as any);

		for (let i = 0; i < 50; i++) {
			await pi._emit("session_start", {}, ctx);
			await pi._emit("session_switch", {}, ctx);
		}

		expect(setIntervalSpy).toHaveBeenCalledTimes(1);

		await pi._emit("session_shutdown");
		expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
	});

	it("restarts cleanly after shutdown without accumulating timers", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
		const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

		watchdogExtension(pi as any);

		for (let i = 0; i < 5; i++) {
			await pi._emit("session_start", {}, ctx);
			await pi._emit("session_shutdown");
		}

		expect(setIntervalSpy).toHaveBeenCalledTimes(5);
		expect(clearIntervalSpy).toHaveBeenCalledTimes(5);
	});
});
