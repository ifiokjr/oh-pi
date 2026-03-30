import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-coding-agent", () => ({}));
vi.mock("@mariozechner/pi-ai", () => ({}));
vi.mock("@mariozechner/pi-tui", () => ({
	truncateToWidth: (text: string, width: number) => text.slice(0, width),
}));

import customFooter, { collectFooterUsageTotals, fmt, formatElapsed } from "./custom-footer";
import { resetSafeModeStateForTests, setSafeModeState } from "./runtime-mode";

function makeAssistantMessage(overrides: Partial<{ input: number; output: number; cost: number }> = {}) {
	return {
		role: "assistant",
		usage: {
			input: overrides.input ?? 1200,
			output: overrides.output ?? 800,
			cost: {
				total: overrides.cost ?? 0.03,
			},
		},
	};
}

function createMockPi() {
	const handlers = new Map<string, ((...args: any[]) => any)[]>();

	return {
		on(event: string, handler: (...args: any[]) => any) {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			handlers.get(event)?.push(handler);
		},
		getThinkingLevel() {
			return "medium";
		},
		_handlers: handlers,
		async _emit(event: string, ...args: any[]) {
			for (const handler of handlers.get(event) ?? []) {
				await handler(...args);
			}
		},
	};
}

afterEach(() => {
	resetSafeModeStateForTests();
});

describe("custom-footer helpers", () => {
	it("formats elapsed time compactly", () => {
		expect(formatElapsed(42_000)).toBe("42s");
		expect(formatElapsed(3 * 60_000 + 12_000)).toBe("3m12s");
		expect(formatElapsed(65 * 60_000)).toBe("1h5m");
	});

	it("formats token counts with a compact suffix", () => {
		expect(fmt(999)).toBe("999");
		expect(fmt(1200)).toBe("1.2k");
	});

	it("collects assistant-only totals from the current branch", () => {
		const ctx = {
			sessionManager: {
				getBranch: () => [
					{ type: "message", message: makeAssistantMessage({ input: 400, output: 200, cost: 0.01 }) },
					{ type: "message", message: { role: "user", content: "hello" } },
					{ type: "custom", data: {} },
					{ type: "message", message: makeAssistantMessage({ input: 600, output: 300, cost: 0.02 }) },
				],
			},
		};

		expect(collectFooterUsageTotals(ctx as any)).toEqual({ input: 1000, output: 500, cost: 0.03 });
	});
});

describe("custom-footer extension", () => {
	it("hydrates once and reuses cached totals during footer renders", async () => {
		const pi = createMockPi();
		customFooter(pi as any);

		const getBranch = vi.fn(() => [
			{ type: "message", message: makeAssistantMessage({ input: 1200, output: 800, cost: 0.03 }) },
			{ type: "message", message: { role: "user", content: "hello" } },
		]);

		let footerFactory: any;
		const ctx = {
			model: { id: "claude-sonnet", provider: "anthropic" },
			getContextUsage: () => ({ percent: 12 }),
			sessionManager: { getBranch },
			ui: {
				setFooter(factory: any) {
					footerFactory = factory;
				},
			},
		};

		await pi._emit("session_start", {}, ctx);
		expect(getBranch).toHaveBeenCalledTimes(1);
		expect(footerFactory).toBeTypeOf("function");

		const component = footerFactory(
			{ requestRender: vi.fn() },
			{ fg: (_color: string, text: string) => text },
			{ onBranchChange: () => () => undefined, getGitBranch: () => "main" },
		);

		const firstRender = component.render(200)[0];
		expect(firstRender).toContain("1.2k/800");
		expect(firstRender).toContain("$0.03");
		expect(getBranch).toHaveBeenCalledTimes(1);

		await pi._emit("turn_end", { message: makeAssistantMessage({ input: 500, output: 100, cost: 0.04 }) });
		const secondRender = component.render(200)[0];
		expect(secondRender).toContain("1.7k/900");
		expect(secondRender).toContain("$0.07");
		expect(getBranch).toHaveBeenCalledTimes(1);
	});

	it("does not rescan branch during repeated renders for long sessions", async () => {
		const pi = createMockPi();
		customFooter(pi as any);

		const branch = Array.from({ length: 50_000 }, (_, index) => ({
			type: "message",
			message: makeAssistantMessage({
				input: 1000 + (index % 5),
				output: 500 + (index % 3),
				cost: 0.01,
			}),
		}));
		const getBranch = vi.fn(() => branch);

		let footerFactory: any;
		const ctx = {
			model: { id: "claude-sonnet", provider: "anthropic" },
			getContextUsage: () => ({ percent: 48 }),
			sessionManager: { getBranch },
			ui: {
				setFooter(factory: any) {
					footerFactory = factory;
				},
			},
		};

		await pi._emit("session_start", {}, ctx);
		expect(getBranch).toHaveBeenCalledTimes(1);

		const component = footerFactory(
			{ requestRender: vi.fn() },
			{ fg: (_color: string, text: string) => text },
			{ onBranchChange: () => () => undefined, getGitBranch: () => "main" },
		);

		for (let i = 0; i < 100; i++) {
			component.render(200);
		}

		expect(getBranch).toHaveBeenCalledTimes(1);
	});

	it("returns no footer lines while safe mode is enabled", async () => {
		const pi = createMockPi();
		customFooter(pi as any);

		let footerFactory: any;
		const ctx = {
			model: { id: "claude-sonnet", provider: "anthropic" },
			getContextUsage: () => ({ percent: 12 }),
			sessionManager: { getBranch: () => [] },
			ui: {
				setFooter(factory: any) {
					footerFactory = factory;
				},
			},
		};

		await pi._emit("session_start", {}, ctx);
		const component = footerFactory(
			{ requestRender: vi.fn() },
			{ fg: (_color: string, text: string) => text },
			{ onBranchChange: () => () => undefined, getGitBranch: () => "main" },
		);

		setSafeModeState(true, { source: "manual", reason: "test" });
		expect(component.render(200)).toEqual([]);
	});
});
