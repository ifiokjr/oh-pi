import { createOllamaCloudOAuthProvider, loginOllamaCloud, refreshOllamaCloudCredential } from "../auth.js";
import { createTestOllamaBackend } from "./test-backend.js";

const envSnapshot = { ...process.env };

afterEach(() => {
	for (const key of Object.keys(process.env)) {
		if (!(key in envSnapshot)) {
			delete process.env[key];
		}
	}
	Object.assign(process.env, envSnapshot);
});

describe("ollama cloud auth", () => {
	it("opens the keys page and exchanges a pasted API key for a static credential with discovered models", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{ capabilities: ["completion", "tools", "thinking"], contextWindow: 131072, id: "gpt-oss:120b" },
		]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		process.env.PI_OLLAMA_CLOUD_KEYS_URL = backend.keysUrl;

		let openedUrl = "";
		const credential = await loginOllamaCloud({
			onAuth(params) {
				openedUrl = params.url;
			},
			onPrompt: vi.fn(async () => "test-key"),
		});

		expect(openedUrl).toBe(backend.keysUrl);
		expect(credential.access).toBe("test-key");
		expect(credential.models?.[0]?.id).toBe("gpt-oss:120b");
		await backend.close();
	});

	it("refreshes credentials and preserves discovered models when discovery fails", async () => {
		const backend = await createTestOllamaBackend();
		backend.setRejectAuth(true);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;

		const refreshed = await refreshOllamaCloudCredential({
			access: "test-key",
			expires: Date.now() - 1000,
			models: [
				{
					id: "qwen3-next:80b",
					name: "Qwen3 Next 80B",
					reasoning: true,
					input: ["text"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 262144,
					maxTokens: 32768,
					source: "cloud",
				},
			],
			refresh: "test-key",
		} as never);

		expect(refreshed.models?.[0]?.id).toBe("qwen3-next:80b");
		await backend.close();
	});

	it("modifies provider models using runtime cloud models when available", () => {
		const runtimeModels = [
			{
				contextWindow: 262144,
				cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
				id: "kimi-k2.6",
				input: ["text", "image"] as const,
				maxTokens: 32768,
				name: "Kimi K2.6",
				reasoning: true,
				source: "cloud" as const,
			},
		];
		const provider = createOllamaCloudOAuthProvider(() => runtimeModels as never);
		const modified = provider.modifyModels?.(
			[
				{
					api: "openai-completions",
					baseUrl: "https://example.com/v1",
					contextWindow: 1,
					cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
					id: "placeholder",
					input: ["text"],
					maxTokens: 1,
					name: "Placeholder",
					provider: "ollama-cloud",
					reasoning: false,
				},
			],
			{
				access: "a",
				expires: Date.now() + 1000,
				models: [
					{
						id: "gpt-oss:120b",
						name: "GPT OSS 120B",
						reasoning: true,
						input: ["text"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 131072,
						maxTokens: 16384,
						source: "cloud",
					},
				],
				refresh: "r",
			} as never,
		);

		expect(modified?.map((model) => model.id)).toStrictEqual(["kimi-k2.6"]);
	});

	it("falls back to credential models when runtime state is empty", () => {
		const provider = createOllamaCloudOAuthProvider(() => []);
		const modified = provider.modifyModels?.(
			[
				{
					api: "openai-completions",
					baseUrl: "https://example.com/v1",
					contextWindow: 1,
					cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
					id: "placeholder",
					input: ["text"],
					maxTokens: 1,
					name: "Placeholder",
					provider: "ollama-cloud",
					reasoning: false,
				},
			],
			{
				access: "a",
				expires: Date.now() + 1000,
				models: [
					{
						id: "gpt-oss:120b",
						name: "GPT OSS 120B",
						reasoning: true,
						input: ["text"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 131072,
						maxTokens: 16384,
						source: "cloud",
					},
				],
				refresh: "r",
			} as never,
		);

		expect(modified?.map((model) => model.id)).toStrictEqual(["gpt-oss:120b"]);
	});
});
