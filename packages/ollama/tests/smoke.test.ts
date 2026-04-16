import { afterEach, describe, expect, it } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import ollamaProviderExtension from "../index.js";
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

describe("ollama provider smoke tests", () => {
	it("registers local + cloud ollama providers and commands without crashing", () => {
		const harness = createExtensionHarness();
		ollamaProviderExtension(harness.pi as never);

		expect(harness.commands.has("ollama")).toBe(true);
		expect(harness.commands.has("ollama-cloud")).toBe(true);
		expect(harness.providers.has("ollama")).toBe(true);
		expect(harness.providers.has("ollama-cloud")).toBe(true);
		expect(typeof harness.providers.get("ollama-cloud")?.streamSimple).toBe("function");
	});

	it("does not crash on session_start when auth storage is not ready", async () => {
		const harness = createExtensionHarness();
		(harness.ctx as any).modelRegistry = {
			...(harness.ctx.modelRegistry as object),
			authStorage: {
				get() {
					throw new Error("auth storage not initialized");
				},
				set() {},
			},
		};
		ollamaProviderExtension(harness.pi as never);

		await expect(harness.emitAsync("session_start", { type: "session_start" }, harness.ctx)).resolves.toBeDefined();
	});

	it("seeds cloud fallback models before async discovery finishes", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{ id: "glm-5.1", capabilities: ["completion", "tools", "thinking"], contextWindow: 202752 },
			{ id: "kimi-k2.5", capabilities: ["completion", "tools", "thinking", "vision"], contextWindow: 262144 },
		]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		delete process.env.OLLAMA_API_KEY;

		const harness = createExtensionHarness();
		ollamaProviderExtension(harness.pi as never);

		const initialModels = harness.providers.get("ollama-cloud")?.models as Array<{ id: string }> | undefined;
		expect(initialModels?.some((model) => model.id === "glm-5.1")).toBe(true);
		expect((initialModels?.length ?? 0) > 2).toBe(true);

		await backend.close();
	});

	it("bootstraps the public cloud catalog without an API key", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{ id: "glm-5.1", capabilities: ["completion", "tools", "thinking"], contextWindow: 202752 },
			{ id: "kimi-k2.5", capabilities: ["completion", "tools", "thinking", "vision"], contextWindow: 262144 },
		]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		delete process.env.OLLAMA_API_KEY;

		const harness = createExtensionHarness();
		ollamaProviderExtension(harness.pi as never);

		for (let attempt = 0; attempt < 40; attempt += 1) {
			const models = harness.providers.get("ollama-cloud")?.models as Array<{ id: string }> | undefined;
			if (models?.length === 2) {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 10));
		}

		expect((harness.providers.get("ollama-cloud")?.models as Array<{ id: string }> | undefined)?.map((model) => model.id)).toEqual([
			"glm-5.1",
			"kimi-k2.5",
		]);
		expect(backend.getAuthHeaders()).toEqual(["", "", ""]);
		await backend.close();
	});
});
