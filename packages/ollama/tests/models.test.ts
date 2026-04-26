import {
	discoverOllamaCloudModels,
	discoverOllamaLocalModels,
	getCredentialModels,
	getFallbackOllamaCloudModels,
	toOllamaModel,
} from "../models.js";
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

describe("ollama models", () => {
	it("returns a cloud fallback catalog", () => {
		const models = getFallbackOllamaCloudModels();
		expect(models.some((model) => model.id === "gpt-oss:120b")).toBeTruthy();
		expect(models.some((model) => model.id === "qwen3-vl:235b")).toBeTruthy();
		expect(models.some((model) => model.id === "glm-5.1")).toBeTruthy();
		expect(models.some((model) => model.id === "kimi-k2.6")).toBeTruthy();
	});

	it("normalizes model defaults", () => {
		const model = toOllamaModel({ id: "gpt-oss:120b", input: ["text"], reasoning: true, source: "cloud" });
		const compat = model.compat as { supportsDeveloperRole?: boolean; maxTokensField?: string } | undefined;
		expect(model.name).toContain("GPT");
		expect(model.name).toContain("(Cloud)");
		expect(compat?.supportsDeveloperRole).toBeFalsy();
		expect(compat?.maxTokensField).toBe("max_tokens");
	});

	it("applies z.ai compat defaults to cloud glm models", () => {
		const model = toOllamaModel({
			id: "glm-5.1",
			input: ["text"],
			maxTokens: 25_344,
			reasoning: true,
			source: "cloud",
		});
		const compat = model.compat as
			| {
					supportsReasoningEffort?: boolean;
					thinkingFormat?: string;
					zaiToolStream?: boolean;
			  }
			| undefined;
		expect(model.maxTokens).toBe(131_072);
		expect(compat?.supportsReasoningEffort).toBeFalsy();
		expect(compat?.thinkingFormat).toBe("zai");
		expect(compat?.zaiToolStream).toBeTruthy();
	});

	it("discovers cloud models with bearer auth", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 131072,
				family: "gpt-oss",
				id: "gpt-oss:120b",
				parameterSize: "120B",
				quantization: "Q4_K_M",
			},
			{
				capabilities: ["completion", "tools", "thinking", "vision"],
				contextWindow: 262144,
				family: "qwen3-vl",
				id: "qwen3-vl:235b",
				parameterSize: "235B",
			},
		]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		const models = await discoverOllamaCloudModels("test-key");
		expect(models?.map((model) => model.id)).toStrictEqual(["gpt-oss:120b", "qwen3-vl:235b"]);
		expect(models?.[0]?.reasoning).toBeTruthy();
		expect(models?.[0]?.name).toContain("(Cloud)");
		expect(models?.[0]?.parameterSize).toBe("120B");
		expect(models?.[0]?.quantization).toBe("Q4_K_M");
		expect(models?.[1]?.input).toStrictEqual(["text", "image"]);
		expect(backend.getAuthHeaders()).toStrictEqual([
			"",
			"",
			"",
			"Bearer test-key",
			"Bearer test-key",
			"Bearer test-key",
		]);
		await backend.close();
	});

	it("prefers the public cloud catalog when authenticated discovery is narrower", async () => {
		const backend = await createTestOllamaBackend();
		backend.setPublicModels([
			{
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 202752,
				family: "glm5.1",
				id: "glm-5.1",
				parameterSize: "756B",
				quantization: "FP8",
			},
			{
				capabilities: ["completion", "tools", "thinking", "vision"],
				contextWindow: 262144,
				family: "kimi-k2.5",
				id: "kimi-k2.5",
				parameterSize: "1T",
			},
			{
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 262144,
				family: "qwen3-next",
				id: "qwen3-next:80b",
				parameterSize: "80B",
			},
		]);
		backend.setAuthenticatedModels([
			{
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 202752,
				family: "glm5.1",
				id: "glm-5.1",
				parameterSize: "756B",
				quantization: "FP8",
			},
		]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		const models = await discoverOllamaCloudModels("test-key");
		expect(models?.map((model) => model.id)).toStrictEqual(["glm-5.1", "kimi-k2.5", "qwen3-next:80b"]);
		await backend.close();
	});

	it("discovers public cloud models without auth", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 202752,
				family: "glm5.1",
				id: "glm-5.1",
				parameterSize: "756B",
				quantization: "FP8",
			},
			{
				capabilities: ["completion", "tools", "thinking", "vision"],
				contextWindow: 262144,
				family: "kimi-k2.5",
				id: "kimi-k2.5",
				parameterSize: "1T",
			},
		]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		const models = await discoverOllamaCloudModels();
		const glmCompat = models?.[0]?.compat as
			| {
					supportsReasoningEffort?: boolean;
					thinkingFormat?: string;
					zaiToolStream?: boolean;
			  }
			| undefined;
		expect(models?.map((model) => model.id)).toStrictEqual(["glm-5.1", "kimi-k2.5"]);
		expect(models?.[0]?.reasoning).toBeTruthy();
		expect(models?.[0]?.maxTokens).toBe(131_072);
		expect(glmCompat?.supportsReasoningEffort).toBeFalsy();
		expect(glmCompat?.thinkingFormat).toBe("zai");
		expect(glmCompat?.zaiToolStream).toBeTruthy();
		expect(models?.[1]?.input).toStrictEqual(["text", "image"]);
		expect(backend.getAuthHeaders()).toStrictEqual(["", "", ""]);
		await backend.close();
	});

	it("discovers local models without auth", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{
				capabilities: ["completion", "vision"],
				contextWindow: 131072,
				family: "gemma3",
				id: "gemma3:4b",
				parameterSize: "4.3B",
			},
			{
				capabilities: ["completion"],
				contextWindow: 32768,
				family: "qwen2.5-coder",
				id: "qwen2.5-coder:7b",
				parameterSize: "7B",
			},
		]);
		process.env.OLLAMA_HOST = backend.origin;
		const models = await discoverOllamaLocalModels();
		expect(models?.map((model) => model.id)).toStrictEqual(["gemma3:4b", "qwen2.5-coder:7b"]);
		expect(models?.[0]?.name).toContain("(Local)");
		expect(models?.[0]?.input).toStrictEqual(["text", "image"]);
		expect(models?.[0]?.parameterSize).toBe("4.3B");
		expect(backend.getAuthHeaders()).toStrictEqual(["", "", ""]);
		await backend.close();
	});

	it("falls back per model when metadata discovery fails", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{ capabilities: ["completion", "tools", "thinking"], contextWindow: 131072, id: "gpt-oss:120b" },
			{ capabilities: ["completion", "tools", "thinking", "vision"], contextWindow: 262144, id: "qwen3-vl:235b" },
		]);
		backend.setRejectedModelShows(["qwen3-vl:235b"]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		const models = await discoverOllamaCloudModels("test-key");
		expect(models?.map((model) => model.id)).toStrictEqual(["gpt-oss:120b", "qwen3-vl:235b"]);
		expect(models?.[1]?.input).toStrictEqual(["text", "image"]);
		expect(models?.[1]?.reasoning).toBeTruthy();
		await backend.close();
	});

	it("prefers models stored with the login credential", () => {
		const models = getCredentialModels({
			access: "a",
			expires: Date.now() + 1000,
			models: [
				toOllamaModel({
					id: "qwen3-next:80b",
					source: "cloud",
					reasoning: true,
					input: ["text"],
					contextWindow: 262144,
					maxTokens: 32768,
				}),
			],
			refresh: "r",
		});
		expect(models).toHaveLength(1);
		expect(models[0]?.id).toBe("qwen3-next:80b");
	});
});
