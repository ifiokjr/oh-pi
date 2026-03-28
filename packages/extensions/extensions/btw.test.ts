import { describe, expect, it, vi } from "vitest";

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

import { resolveBtwApiKey } from "./btw.js";

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
