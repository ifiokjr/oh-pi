import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadCachedOllamaCloudModels, saveCachedOllamaCloudModels } from "../cache.js";
import {
	discoverOllamaCloudModelList,
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
		expect(models.some((model) => model.id === "gpt-oss:120b")).toBe(true);
		expect(models.some((model) => model.id === "qwen3-vl:235b")).toBe(true);
		expect(models.some((model) => model.id === "glm-5.1")).toBe(true);
		expect(models.some((model) => model.id === "kimi-k2.6")).toBe(true);
	});

	it("normalizes model defaults", () => {
		const model = toOllamaModel({
			id: "gpt-oss:120b",
			source: "cloud",
			reasoning: true,
			input: ["text"],
		});
		const compat = model.compat as
			| {
					supportsDeveloperRole?: boolean;
					maxTokensField?: string;
			  }
			| undefined;
		expect(model.name).toContain("GPT");
		expect(model.name).toContain("(Cloud)");
		expect(compat?.supportsDeveloperRole).toBe(false);
		expect(compat?.maxTokensField).toBe("max_tokens");
	});

	it("applies z.ai compat defaults to cloud glm models", () => {
		const model = toOllamaModel({
			id: "glm-5.1",
			source: "cloud",
			reasoning: true,
			input: ["text"],
			maxTokens: 25_344,
		});
		const compat = model.compat as
			| {
					supportsReasoningEffort?: boolean;
					thinkingFormat?: string;
					zaiToolStream?: boolean;
			  }
			| undefined;
		expect(model.maxTokens).toBe(131_072);
		expect(compat?.supportsReasoningEffort).toBe(false);
		expect(compat?.thinkingFormat).toBe("zai");
		expect(compat?.zaiToolStream).toBe(true);
	});

	it("discovers cloud model ids before metadata enrichment", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{ id: "brand-new-cloud-model" },
			{
				id: "gpt-oss:120b",
			},
		]);
		backend.setRejectedModelShows(["brand-new-cloud-model", "gpt-oss:120b"]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		const models = await discoverOllamaCloudModelList("test-key");
		expect(models?.map((model) => model.id)).toEqual(["brand-new-cloud-model", "gpt-oss:120b"]);
		expect(models?.[0]?.source).toBe("cloud");
		expect(backend.getAuthHeaders()).toEqual(["Bearer test-key"]);
		await backend.close();
	});

	it("loads cloud models from the startup cache", async () => {
		const cacheDir = await mkdtemp(join(tmpdir(), "pi-ollama-cache-"));
		process.env.PI_OLLAMA_CLOUD_CACHE_PATH = join(cacheDir, "models.json");
		await saveCachedOllamaCloudModels([
			toOllamaModel({
				id: "brand-new-cloud-model",
				reasoning: true,
				source: "cloud",
			}),
		]);
		const models = loadCachedOllamaCloudModels();
		expect(models.map((model) => model.id)).toEqual(["brand-new-cloud-model"]);
		expect(models[0]?.reasoning).toBe(true);
		await rm(cacheDir, { force: true, recursive: true });
	});

	it("discovers cloud models with bearer auth", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{
				id: "gpt-oss:120b",
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 131072,
				family: "gpt-oss",
				parameterSize: "120B",
				quantization: "Q4_K_M",
			},
			{
				id: "qwen3-vl:235b",
				capabilities: ["completion", "tools", "thinking", "vision"],
				contextWindow: 262144,
				family: "qwen3-vl",
				parameterSize: "235B",
			},
		]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		const models = await discoverOllamaCloudModels("test-key");
		expect(models?.map((model) => model.id)).toEqual(["gpt-oss:120b", "qwen3-vl:235b"]);
		expect(models?.[0]?.reasoning).toBe(true);
		expect(models?.[0]?.name).toContain("(Cloud)");
		expect(models?.[0]?.parameterSize).toBe("120B");
		expect(models?.[0]?.quantization).toBe("Q4_K_M");
		expect(models?.[1]?.input).toEqual(["text", "image"]);
		expect(backend.getAuthHeaders()).toEqual(["", "", "", "Bearer test-key", "Bearer test-key", "Bearer test-key"]);
		await backend.close();
	});

	it("prefers the public cloud catalog when authenticated discovery is narrower", async () => {
		const backend = await createTestOllamaBackend();
		backend.setPublicModels([
			{
				id: "glm-5.1",
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 202752,
				family: "glm5.1",
				parameterSize: "756B",
				quantization: "FP8",
			},
			{
				id: "kimi-k2.5",
				capabilities: ["completion", "tools", "thinking", "vision"],
				contextWindow: 262144,
				family: "kimi-k2.5",
				parameterSize: "1T",
			},
			{
				id: "qwen3-next:80b",
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 262144,
				family: "qwen3-next",
				parameterSize: "80B",
			},
		]);
		backend.setAuthenticatedModels([
			{
				id: "glm-5.1",
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 202752,
				family: "glm5.1",
				parameterSize: "756B",
				quantization: "FP8",
			},
		]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		const models = await discoverOllamaCloudModels("test-key");
		expect(models?.map((model) => model.id)).toEqual(["glm-5.1", "kimi-k2.5", "qwen3-next:80b"]);
		await backend.close();
	});

	it("discovers public cloud models without auth", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{
				id: "glm-5.1",
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 202752,
				family: "glm5.1",
				parameterSize: "756B",
				quantization: "FP8",
			},
			{
				id: "kimi-k2.5",
				capabilities: ["completion", "tools", "thinking", "vision"],
				contextWindow: 262144,
				family: "kimi-k2.5",
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
		expect(models?.map((model) => model.id)).toEqual(["glm-5.1", "kimi-k2.5"]);
		expect(models?.[0]?.reasoning).toBe(true);
		expect(models?.[0]?.maxTokens).toBe(131_072);
		expect(glmCompat?.supportsReasoningEffort).toBe(false);
		expect(glmCompat?.thinkingFormat).toBe("zai");
		expect(glmCompat?.zaiToolStream).toBe(true);
		expect(models?.[1]?.input).toEqual(["text", "image"]);
		expect(backend.getAuthHeaders()).toEqual(["", "", ""]);
		await backend.close();
	});

	it("discovers local models without auth", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{
				id: "gemma3:4b",
				capabilities: ["completion", "vision"],
				contextWindow: 131072,
				family: "gemma3",
				parameterSize: "4.3B",
			},
			{
				id: "qwen2.5-coder:7b",
				capabilities: ["completion"],
				contextWindow: 32768,
				family: "qwen2.5-coder",
				parameterSize: "7B",
			},
		]);
		process.env.OLLAMA_HOST = backend.origin;
		const models = await discoverOllamaLocalModels();
		expect(models?.map((model) => model.id)).toEqual(["gemma3:4b", "qwen2.5-coder:7b"]);
		expect(models?.[0]?.name).toContain("(Local)");
		expect(models?.[0]?.input).toEqual(["text", "image"]);
		expect(models?.[0]?.parameterSize).toBe("4.3B");
		expect(backend.getAuthHeaders()).toEqual(["", "", ""]);
		await backend.close();
	});

	it("falls back per model when metadata discovery fails", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{
				id: "gpt-oss:120b",
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 131072,
			},
			{
				id: "qwen3-vl:235b",
				capabilities: ["completion", "tools", "thinking", "vision"],
				contextWindow: 262144,
			},
		]);
		backend.setRejectedModelShows(["qwen3-vl:235b"]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		const models = await discoverOllamaCloudModels("test-key");
		expect(models?.map((model) => model.id)).toEqual(["gpt-oss:120b", "qwen3-vl:235b"]);
		expect(models?.[1]?.input).toEqual(["text", "image"]);
		expect(models?.[1]?.reasoning).toBe(true);
		await backend.close();
	});

	it("prefers models stored with the login credential", () => {
		const models = getCredentialModels({
			refresh: "r",
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
		});
		expect(models).toHaveLength(1);
		expect(models[0]?.id).toBe("qwen3-next:80b");
	});
});
