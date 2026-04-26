

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
	mockExistsSync: vi.fn(() => false),
	mockReadFileSync: vi.fn(),
}));

const histogram = {
	disable: vi.fn(),
	enable: vi.fn(),
	max: 0,
	mean: 0,
	percentile: vi.fn(() => 0),
	reset: vi.fn(),
};

vi.mock<typeof import('node:fs')>(import('node:fs'), () => ({
	existsSync: mockExistsSync,
	readFileSync: mockReadFileSync,
}));

vi.mock<typeof import('node:perf_hooks')>(import('node:perf_hooks'), () => ({
	monitorEventLoopDelay: vi.fn(() => histogram),
}));

vi.mock<typeof import('node:os')>(import('node:os'), async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	return {
		...actual,
		cpus: () => [{}, {}, {}, {}],
	};
});

vi.mock<typeof import('@mariozechner/pi-coding-agent')>(import('@mariozechner/pi-coding-agent'), () => ({}));

import { resetSafeModeStateForTests } from "./runtime-mode";
import watchdogExtension from "./watchdog";

function createMockPi() {
	const handlers = new Map<string, ((...args: any[]) => any)[]>();
	const eventHandlers = new Map<string, ((...args: any[]) => any)[]>();
	const commands = new Map<string, any>();
	const tools = new Map<string, any>();

	return {
		_commands: commands,
		async _emit(event: string, ...args: any[]) {
			for (const handler of handlers.get(event) ?? []) {
				await handler(...args);
			}
		},
		_tools: tools,
		events: {
			emit(event: string, ...args: any[]) {
				for (const handler of eventHandlers.get(event) ?? []) {
					handler(...args);
				}
			},
			on(event: string, handler: (...args: any[]) => any) {
				if (!eventHandlers.has(event)) {
					eventHandlers.set(event, []);
				}
				eventHandlers.get(event)?.push(handler);
			},
		},
		on(event: string, handler: (...args: any[]) => any) {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			handlers.get(event)?.push(handler);
		},
		registerCommand(name: string, command: any) {
			commands.set(name, command);
		},
		registerTool(tool: { name: string }) {
			tools.set(tool.name, tool);
		},
	};
}

function createMockCtx() {
	return {
		hasUI: true,
		ui: {
			custom: vi.fn().mockResolvedValue(undefined),
			notify: vi.fn(),
			setStatus: vi.fn(),
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

		expect(setIntervalSpy).toHaveBeenCalledOnce();

		await pi._emit("session_shutdown");
		expect(clearIntervalSpy).toHaveBeenCalledOnce();
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
