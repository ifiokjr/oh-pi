import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-ai", () => ({
	completeSimple: vi.fn(),
	streamSimple: vi.fn(),
	getEnvApiKey: vi.fn((provider: string) => (provider === "openai" ? "env-openai-key" : undefined)),
}));

vi.mock("@mariozechner/pi-tui", () => ({
	Text: class Text {
		text: string;
		x: number;
		y: number;

		constructor(text: string, x: number, y: number) {
			this.text = text;
			this.x = x;
			this.y = y;
		}
	},
	Key: {
		enter: "\r",
		escape: "\u001b",
		up: "\u001b[A",
		down: "\u001b[B",
		ctrl: (key: string) => key,
	},
	matchesKey: (input: string, key: string) => input === key,
	truncateToWidth: (text: string, width: number) => text.slice(0, width),
	wrapTextWithAnsi: (text: string, width: number) => {
		const lines: string[] = [];
		for (let i = 0; i < text.length; i += width) {
			lines.push(text.slice(i, i + width));
		}
		return lines.length > 0 ? lines : [""];
	},
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	buildSessionContext: vi.fn(() => ({ messages: [] })),
	AuthStorage: {
		create: vi.fn(() => ({ source: "auth-storage" })),
	},
	ModelRegistry: class ModelRegistry {
		async getApiKey(model: { provider: string; id: string }) {
			return `dynamic:${model.provider}/${model.id}`;
		}
	},
}));

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import btwExtension, { resolveBtwApiKey } from "./btw.js";

const model = {
	provider: "anthropic",
	id: "claude-sonnet-4",
	api: "anthropic-messages",
};

describe("resolveBtwApiKey", () => {
	it("uses modelRegistry.getApiKey when available", async () => {
		const getApiKey = vi.fn().mockResolvedValue("direct-key");

		await expect(resolveBtwApiKey(model as never, { getApiKey })).resolves.toBe("direct-key");
		expect(getApiKey).toHaveBeenCalledWith(model);
	});

	it("falls back to modelRegistry.getApiKeyForProvider", async () => {
		const getApiKeyForProvider = vi.fn().mockResolvedValue("provider-key");

		await expect(resolveBtwApiKey(model as never, { getApiKeyForProvider })).resolves.toBe("provider-key");
		expect(getApiKeyForProvider).toHaveBeenCalledWith("anthropic");
	});

	it("falls back to modelRegistry.authStorage.getApiKey", async () => {
		const getApiKey = vi.fn().mockResolvedValue("auth-storage-key");

		await expect(resolveBtwApiKey(model as never, { authStorage: { getApiKey } })).resolves.toBe("auth-storage-key");
		expect(getApiKey).toHaveBeenCalledWith("anthropic");
	});

	it("reconstructs a registry when the runtime registry lacks getApiKey", async () => {
		await expect(resolveBtwApiKey(model as never, {})).resolves.toBe("dynamic:anthropic/claude-sonnet-4");
	});
});

describe("btw startup restore", () => {
	const fakeTheme = {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
		italic: (text: string) => text,
	};

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("defers session_start thread restoration until after the startup window", async () => {
		const harness = createExtensionHarness();
		const getBranch = vi.fn(() => [
			{
				type: "custom",
				customType: "btw-thread-entry",
				data: {
					question: "What changed?",
					thinking: "",
					answer: "A few startup paths were deferred.",
					provider: "anthropic",
					model: "claude-sonnet-4",
					thinkingLevel: "off",
					timestamp: Date.now(),
				},
			},
		]);
		harness.ctx.sessionManager.getBranch = getBranch;
		harness.ctx.ui.setWidget = vi.fn();

		btwExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		expect(getBranch).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(250);
		expect(getBranch).toHaveBeenCalledTimes(1);
		expect(harness.ctx.ui.setWidget).toHaveBeenCalledWith(
			"btw",
			expect.any(Function),
			expect.objectContaining({ placement: "aboveEditor" }),
		);
	});

	it("cancels deferred session_start restoration on session_shutdown", async () => {
		const harness = createExtensionHarness();
		const getBranch = vi.fn(() => []);
		harness.ctx.sessionManager.getBranch = getBranch;

		btwExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
		await vi.advanceTimersByTimeAsync(250);

		expect(getBranch).not.toHaveBeenCalled();
	});

	it("keeps the widget compact and points long threads to /btw:open", async () => {
		const harness = createExtensionHarness();
		harness.ctx.sessionManager.getBranch = vi.fn(() => [
			{
				type: "custom",
				customType: "btw-thread-entry",
				data: {
					question: "What changed?",
					thinking: "outline\ntradeoffs\nedge-cases",
					answer: Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join("\n"),
					provider: "anthropic",
					model: "claude-sonnet-4",
					thinkingLevel: "off",
					timestamp: Date.now(),
				},
			},
		]);
		harness.ctx.ui.setWidget = vi.fn();

		btwExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		await vi.advanceTimersByTimeAsync(250);

		const widgetFactory = (harness.ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1];
		const rendered = widgetFactory({}, fakeTheme);

		expect(rendered.text).toContain("/btw:open");
		expect(rendered.text).toContain("more lines");
		expect(rendered.text).toContain("line 1");
		expect(rendered.text).not.toContain("line 12");
	});

	it("opens a scrollable overlay for the full BTW thread", async () => {
		const harness = createExtensionHarness();
		harness.ctx.sessionManager.getBranch = vi.fn(() => [
			{
				type: "custom",
				customType: "btw-thread-entry",
				data: {
					question: "Walk through every step",
					thinking: "",
					answer: Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n"),
					provider: "anthropic",
					model: "claude-sonnet-4",
					thinkingLevel: "off",
					timestamp: Date.now(),
				},
			},
		]);
		let overlayFactory: any;
		harness.ctx.ui.custom = vi.fn(async (factory: any) => {
			overlayFactory = factory;
			return undefined;
		}) as never;

		btwExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		await vi.advanceTimersByTimeAsync(250);
		await harness.commands.get("btw:open").handler("", harness.ctx);

		expect(harness.ctx.ui.custom).toHaveBeenCalledWith(expect.any(Function), {
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: "80%",
				maxHeight: "80%",
			},
		});

		const overlay = overlayFactory({ requestRender: vi.fn() }, fakeTheme, {}, () => undefined);
		const firstRender = overlay.render(60).join("\n");
		expect(firstRender).toContain("BTW thread");
		expect(firstRender).toContain("[↑↓/j/k] scroll");
		expect(firstRender).not.toContain("line 30");

		for (let i = 0; i < 20; i++) {
			overlay.handleInput("j");
		}

		const scrolledRender = overlay.render(60).join("\n");
		expect(scrolledRender).toContain("line 30");
	});
});
