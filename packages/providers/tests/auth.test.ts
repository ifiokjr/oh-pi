import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiKeyOAuthProvider, loginProvider, refreshProviderCredential } from "../auth.js";
import { clearModelsDevCatalogCache } from "../catalog.js";
import { getSupportedProvider } from "../config.js";

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

const sampleCatalog = {
	moonshotai: {
		models: {
			"kimi-k2.5": {
				id: "kimi-k2.5",
				name: "Kimi K2.5",
				reasoning: true,
				attachment: true,
				limit: { context: 262144, output: 32768 },
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

describe("multi-provider api-key auth", () => {
	it("opens the provider auth URL and stores discovered models with the credential", async () => {
		const provider = getSupportedProvider("moonshotai");
		const fetch = vi
			.fn<() => Promise<Response>>()
			.mockImplementationOnce(async () => jsonResponse(sampleCatalog))
			.mockImplementationOnce(async () => jsonResponse({ data: [{ id: "kimi-k2.5", max_output: 24576 }] }));
		vi.stubGlobal("fetch", fetch);

		let openedUrl = "";
		const credential = await loginProvider(provider, {
			onAuth(params) {
				openedUrl = params.url;
			},
			onPrompt: vi.fn(async () => "moonshot-key"),
		});

		expect(openedUrl).toBe(provider.authUrl);
		expect(credential.access).toBe("moonshot-key");
		expect(credential.models?.map((model) => model.id)).toEqual(["kimi-k2.5"]);
	});

	it("preserves previous models when a refresh cannot rediscover them", async () => {
		const provider = getSupportedProvider("moonshotai");
		const fetch = vi.fn<() => Promise<Response>>().mockRejectedValue(new Error("offline"));
		vi.stubGlobal("fetch", fetch);

		const refreshed = await refreshProviderCredential(provider, {
			refresh: "moonshot-key",
			access: "moonshot-key",
			expires: Date.now() - 1000,
			models: [
				{
					id: "kimi-k2.5",
					name: "Kimi K2.5",
					reasoning: true,
					input: ["text", "image"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 262144,
					maxTokens: 32768,
				},
			],
		} as never);

		expect(refreshed.models?.map((model) => model.id)).toEqual(["kimi-k2.5"]);
	});

	it("modifies provider models from the stored credential", () => {
		const provider = getSupportedProvider("moonshotai");
		const oauth = createApiKeyOAuthProvider(provider);
		const modified = oauth.modifyModels?.(
			[
				{
					id: "placeholder",
					name: "Placeholder",
					api: "openai-completions",
					provider: "moonshotai",
					baseUrl: provider.baseUrl,
					reasoning: false,
					input: ["text"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 1,
					maxTokens: 1,
				},
			],
			{
				refresh: "r",
				access: "a",
				expires: Date.now() + 1000,
				models: [
					{
						id: "kimi-k2.5",
						name: "Kimi K2.5",
						reasoning: true,
						input: ["text", "image"],
						cost: { input: 0.6, output: 3, cacheRead: 0.1, cacheWrite: 0 },
						contextWindow: 262144,
						maxTokens: 32768,
					},
				],
			} as never,
		);

		expect(modified?.map((model) => model.id)).toEqual(["kimi-k2.5"]);
	});
});
