
import { clearModelsDevCatalogCache, getCatalogModels, resolveProviderModels } from "../catalog.js";
import { SUPPORTED_PROVIDERS, getSupportedProvider } from "../config.js";

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		headers: { "Content-Type": "application/json" },
		status: 200,
	});
}

const sampleCatalog = {
	minimax: {
		models: {
			"minimax-m2.5": {
				attachment: true,
				id: "minimax-m2.5",
				limit: { context: 200000, output: 20000 },
				modalities: { input: ["text", "image"], output: ["text"] },
				name: "MiniMax M2.5",
				reasoning: true,
			},
		},
	},
	opencode: {
		models: {
			"kimi-k2.5": {
				attachment: true,
				cost: { cache_read: 0.1, cache_write: 0, input: 0.6, output: 3 },
				id: "kimi-k2.5",
				limit: { context: 262144, output: 32768 },
				modalities: { input: ["text", "image"], output: ["text"] },
				name: "Kimi K2.5",
				reasoning: true,
			},
			"text-embedding-3-large": {
				attachment: false,
				id: "text-embedding-3-large",
				limit: { context: 8192, output: 0 },
				modalities: { input: ["text"], output: [] },
				name: "Embedding",
				reasoning: false,
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
		expect(ids.has("xai")).toBeTruthy();
		expect(ids.has("opencode-go")).toBeTruthy();
		expect(ids.has("moonshotai")).toBeTruthy();
		expect(ids.has("ollama-cloud")).toBeFalsy();
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
		expect(models.map((model) => model.id)).toStrictEqual(["kimi-k2.5"]);
		expect(models[0]?.input).toStrictEqual(["text", "image"]);
		expect(models[0]?.reasoning).toBeTruthy();
	});

	it("merges anthropic-style live discovery with catalog metadata for providers like MiniMax", async () => {
		const fetch = vi
			.fn<() => Promise<Response>>()
			.mockImplementationOnce(async () => jsonResponse(sampleCatalog))
			.mockImplementationOnce(async () =>
				jsonResponse({
					data: [{ id: "minimax-m2.5", max_tokens: 8192, thinking_enabled: true }],
				}),
			);
		vi.stubGlobal("fetch", fetch);

		const models = await resolveProviderModels(getSupportedProvider("minimax"), "test-key");
		expect(models.map((model) => model.id)).toStrictEqual(["minimax-m2.5"]);
		expect(models[0]?.input).toStrictEqual(["text", "image"]);
		expect(models[0]?.contextWindow).toBe(200_000);
	});

	it("falls back to catalog models when live discovery fails", async () => {
		const fetch = vi
			.fn<() => Promise<Response>>()
			.mockImplementationOnce(async () => jsonResponse(sampleCatalog))
			.mockRejectedValueOnce(new Error("boom"));
		vi.stubGlobal("fetch", fetch);

		const models = await resolveProviderModels(getSupportedProvider("opencode"), "test-key");
		expect(models.map((model) => model.id)).toStrictEqual(["kimi-k2.5"]);
	});
});
