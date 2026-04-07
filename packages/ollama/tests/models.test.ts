import { afterEach, describe, expect, it } from "vitest";
import {
	discoverOllamaCloudModels,
	getCredentialModels,
	getFallbackOllamaCloudModels,
	toOllamaCloudModel,
} from "../models.js";
import { createTestOllamaCloudBackend } from "./test-backend.js";

const envSnapshot = { ...process.env };

afterEach(() => {
	for (const key of Object.keys(process.env)) {
		if (!(key in envSnapshot)) {
			delete process.env[key];
		}
	}
	Object.assign(process.env, envSnapshot);
});

describe("ollama cloud models", () => {
	it("returns a fallback catalog", () => {
		const models = getFallbackOllamaCloudModels();
		expect(models.some((model) => model.id === "gpt-oss:120b")).toBe(true);
		expect(models.some((model) => model.id === "qwen3-vl:235b")).toBe(true);
	});

	it("normalizes model defaults", () => {
		const model = toOllamaCloudModel({ id: "gpt-oss:120b", reasoning: true, input: ["text"] });
		const compat = model.compat as { supportsDeveloperRole?: boolean; maxTokensField?: string } | undefined;
		expect(model.name).toContain("GPT");
		expect(compat?.supportsDeveloperRole).toBe(false);
		expect(compat?.maxTokensField).toBe("max_tokens");
	});

	it("discovers models from the cloud API and uses bearer auth", async () => {
		const backend = await createTestOllamaCloudBackend();
		backend.setModels([
			{ id: "gpt-oss:120b", capabilities: ["completion", "tools", "thinking"], contextWindow: 131072 },
			{ id: "qwen3-vl:235b", capabilities: ["completion", "tools", "thinking", "vision"], contextWindow: 262144 },
		]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.apiUrl.replace(/\/v1$/, "")}/api/show`;
		const models = await discoverOllamaCloudModels("test-key");
		expect(models?.map((model) => model.id)).toEqual(["gpt-oss:120b", "qwen3-vl:235b"]);
		expect(models?.[0]?.reasoning).toBe(true);
		expect(models?.[1]?.input).toEqual(["text", "image"]);
		expect(backend.getAuthHeaders().every((header) => header === "Bearer test-key")).toBe(true);
		await backend.close();
	});

	it("falls back per model when metadata discovery fails", async () => {
		const backend = await createTestOllamaCloudBackend();
		backend.setModels([
			{ id: "gpt-oss:120b", capabilities: ["completion", "tools", "thinking"], contextWindow: 131072 },
			{ id: "qwen3-vl:235b", capabilities: ["completion", "tools", "thinking", "vision"], contextWindow: 262144 },
		]);
		backend.setRejectedModelShows(["qwen3-vl:235b"]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.apiUrl.replace(/\/v1$/, "")}/api/show`;
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
			models: [toOllamaCloudModel({ id: "qwen3-next:80b", reasoning: true, input: ["text"], contextWindow: 262144, maxTokens: 32768 })],
		});
		expect(models).toHaveLength(1);
		expect(models[0]?.id).toBe("qwen3-next:80b");
	});
});
