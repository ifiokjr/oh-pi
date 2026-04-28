import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearModelsDevCatalogCache, getCatalogModels, resolveProviderModels } from "../catalog.js";
import { getSupportedProvider, SUPPORTED_PROVIDERS } from "../config.js";

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

const sampleCatalog = {
	opencode: {
		models: {
			"kimi-k2.5": {
				id: "kimi-k2.5",
				name: "Kimi K2.5",
				reasoning: true,
				attachment: true,
				cost: { input: 0.6, output: 3, cache_read: 0.1, cache_write: 0 },
				limit: { context: 262144, output: 32768 },
				modalities: { input: ["text", "image"], output: ["text"] },
			},
			"text-embedding-3-large": {
				id: "text-embedding-3-large",
				name: "Embedding",
				reasoning: false,
				attachment: false,
				limit: { context: 8192, output: 0 },
				modalities: { input: ["text"], output: [] },
			},
		},
	},
	minimax: {
		models: {
			"minimax-m2.5": {
				id: "minimax-m2.5",
				name: "MiniMax M2.5",
				reasoning: true,
				attachment: true,
				limit: { context: 200000, output: 20000 },
				modalities: { input: ["text", "image"], output: ["text"] },
			},
		},
	},
} satisfies Record<string, unknown>;

beforeEach(() => {
	clearModelsDevCatalogCache();
	vi.restoreAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("provider catalog", () => {
	it("includes upstream-backed providers like xAI, OpenCode Go, and Moonshot while excluding Ollama Cloud", () => {
		const ids = new Set(SUPPORTED_PROVIDERS.map((provider) => provider.id));
		expect(ids.has("xai")).toBe(true);
		expect(ids.has("opencode-go")).toBe(true);
		expect(ids.has("moonshotai")).toBe(true);
		expect(ids.has("ollama-cloud")).toBe(false);
	});

	it("maps native Mistral to the Mistral conversations API", () => {
		const provider = getSupportedProvider("mistral");
		expect(provider.api).toBe("mistral-conversations");
		expect(provider.baseUrl).toBe("https://api.mistral.ai");
	});

	it("filters the models.dev catalog down to pi-usable text models", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse(sampleCatalog)),
		);

		const models = await getCatalogModels(getSupportedProvider("opencode"));
		expect(models.map((model) => model.id)).toEqual(["kimi-k2.5"]);
		expect(models[0]?.input).toEqual(["text", "image"]);
		expect(models[0]?.reasoning).toBe(true);
	});

	it("merges anthropic-style live discovery with catalog metadata for providers like MiniMax", async () => {
		const fetch = vi
			.fn<() => Promise<Response>>()
			.mockImplementationOnce(async () => jsonResponse(sampleCatalog))
			.mockImplementationOnce(async () =>
				jsonResponse({
					data: [
						{
							id: "minimax-m2.5",
							thinking_enabled: true,
							max_tokens: 8192,
						},
					],
				}),
			);
		vi.stubGlobal("fetch", fetch);

		const models = await resolveProviderModels(getSupportedProvider("minimax"), "test-key");
		expect(models.map((model) => model.id)).toEqual(["minimax-m2.5"]);
		expect(models[0]?.input).toEqual(["text", "image"]);
		expect(models[0]?.contextWindow).toBe(200000);
	});

	it("falls back to catalog models when live discovery fails", async () => {
		const fetch = vi
			.fn<() => Promise<Response>>()
			.mockImplementationOnce(async () => jsonResponse(sampleCatalog))
			.mockRejectedValueOnce(new Error("boom"));
		vi.stubGlobal("fetch", fetch);

		const models = await resolveProviderModels(getSupportedProvider("opencode"), "test-key");
		expect(models.map((model) => model.id)).toEqual(["kimi-k2.5"]);
	});
});
