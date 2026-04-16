import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import ollamaProviderExtension from "../index.js";
import { createTestOllamaBackend } from "./test-backend.js";

const envSnapshot = { ...process.env };

async function createDelayedCloudBootstrapBackend(): Promise<{ apiUrl: string; origin: string; close: () => Promise<void> }> {
	const server = http.createServer((req, res) => {
		const reply = () => {
			if (req.url === "/v1/models" && req.method === "GET") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ data: [{ id: "glm-5.1", object: "model" }, { id: "kimi-k2.5", object: "model" }] }));
				return;
			}

			if (req.url === "/api/show" && req.method === "POST") {
				let body = "";
				req.on("data", (chunk) => {
					body += String(chunk);
				});
				req.on("end", () => {
					const parsed = JSON.parse(body || "{}") as { model?: string };
					const contextWindow = parsed.model === "kimi-k2.5" ? 262144 : 202752;
					const capabilities = parsed.model === "kimi-k2.5"
						? ["completion", "tools", "thinking", "vision"]
						: ["completion", "tools", "thinking"];
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(
						JSON.stringify({
							capabilities,
							model_info: { [`${(parsed.model ?? "glm").split(/[:.-]/)[0]}.context_length`]: contextWindow },
							details: {},
						}),
					);
				});
				return;
			}

			res.writeHead(404, { "Content-Type": "text/plain" });
			res.end("not found");
		};

		setTimeout(reply, 50);
	});

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const port = (server.address() as AddressInfo).port;
	const origin = `http://127.0.0.1:${port}`;
	return {
		apiUrl: `${origin}/v1`,
		origin,
		async close() {
			await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
		},
	};
}

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
		const backend = await createTestOllamaBackend();
		backend.setModels([{ id: "glm-5.1", capabilities: ["completion", "tools", "thinking"], contextWindow: 202752 }]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		delete process.env.OLLAMA_API_KEY;

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
		await backend.close();
	});

	it("exposes a cloud glm model immediately on startup", async () => {
		const backend = await createDelayedCloudBootstrapBackend();
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		delete process.env.OLLAMA_API_KEY;

		const harness = createExtensionHarness();
		ollamaProviderExtension(harness.pi as never);

		const initialModels = harness.providers.get("ollama-cloud")?.models as Array<{ id: string }> | undefined;
		expect(initialModels?.some((model) => model.id === "glm-5.1")).toBe(true);

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
