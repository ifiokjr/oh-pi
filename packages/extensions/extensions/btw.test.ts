import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-ai", () => ({
	completeSimple: vi.fn(),
	streamSimple: vi.fn(),
	getEnvApiKey: vi.fn((provider: string) => (provider === "openai" ? "env-openai-key" : undefined)),
}));

vi.mock("@mariozechner/pi-tui", () => ({
	Text: class Text {},
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
});
