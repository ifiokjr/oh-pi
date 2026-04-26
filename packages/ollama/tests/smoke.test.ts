import http from "node:http";
import type { AddressInfo } from "node:net";

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import ollamaProviderExtension from "../index.js";
import * as localModule from "../local.js";
import * as modelsModule from "../models.js";
import { createTestOllamaBackend } from "./test-backend.js";

const envSnapshot = { ...process.env };
const harnesses: ReturnType<typeof createExtensionHarness>[] = [];

async function createDelayedCloudBootstrapBackend(
	delayMs = 50,
): Promise<{ apiUrl: string; origin: string; close: () => Promise<void> }> {
	const server = http.createServer((req, res) => {
		const reply = () => {
			if (req.url === "/v1/models" && req.method === "GET") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						data: [
							{ id: "glm-5.1", object: "model" },
							{ id: "kimi-k2.5", object: "model" },
						],
					}),
				);
				return;
			}

			if (req.url === "/api/show" && req.method === "POST") {
				let body = "";
				req.on("data", (chunk) => {
					body += String(chunk);
				});
				req.on("end", () => {
					const parsed = JSON.parse(body || "{}") as { model?: string };
					const contextWindow = parsed.model === "kimi-k2.5" ? 262_144 : 202_752;
					const capabilities =
						parsed.model === "kimi-k2.5"
							? ["completion", "tools", "thinking", "vision"]
							: ["completion", "tools", "thinking"];
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(
						JSON.stringify({
							capabilities,
							details: {},
							model_info: { [`${(parsed.model ?? "glm").split(/[:.-]/)[0]}.context_length`]: contextWindow },
						}),
					);
				});
				return;
			}

			res.writeHead(404, { "Content-Type": "text/plain" });
			res.end("not found");
		};

		setTimeout(reply, delayMs);
	});

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const {port} = (server.address() as AddressInfo);
	const origin = `http://127.0.0.1:${port}`;
	return {
		apiUrl: `${origin}/v1`,
		async close() {
			await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
		},
		origin,
	};
}

afterEach(async () => {
	for (const harness of harnesses.splice(0)) {
		await harness.emitAsync("session_shutdown", { type: "session_shutdown" }, harness.ctx);
	}

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
		harnesses.push(harness);
		ollamaProviderExtension(harness.pi as never);

		expect(harness.commands.has("ollama")).toBeTruthy();
		expect(harness.commands.has("ollama:status")).toBeTruthy();
		expect(harness.commands.has("ollama-cloud")).toBeTruthy();
		expect(harness.providers.has("ollama")).toBeTruthy();
		expect(harness.providers.has("ollama-cloud")).toBeTruthy();
		expectTypeOf(harness.providers.get("ollama-cloud")?.streamSimple).toBeFunction();
	});

	it("does not crash on session_start when auth storage is not ready", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([{ capabilities: ["completion", "tools", "thinking"], contextWindow: 202752, id: "glm-5.1" }]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		delete process.env.OLLAMA_API_KEY;

		const harness = createExtensionHarness();
		harnesses.push(harness);
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

	it("returns from session_start before delayed cloud discovery finishes", async () => {
		const backend = await createDelayedCloudBootstrapBackend(250);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		delete process.env.OLLAMA_API_KEY;

		const harness = createExtensionHarness();
		harnesses.push(harness);
		ollamaProviderExtension(harness.pi as never);

		const startedAt = Date.now();
		await expect(harness.emitAsync("session_start", { type: "session_start" }, harness.ctx)).resolves.toBeDefined();
		expect(Date.now() - startedAt).toBeLessThan(150);

		await backend.close();
	});

	it("exposes a cloud glm model immediately on startup", async () => {
		const backend = await createDelayedCloudBootstrapBackend();
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		delete process.env.OLLAMA_API_KEY;

		const harness = createExtensionHarness();
		harnesses.push(harness);
		ollamaProviderExtension(harness.pi as never);

		const initialModels = harness.providers.get("ollama-cloud")?.models as { id: string }[] | undefined;
		expect(initialModels?.some((model) => model.id === "glm-5.1")).toBeTruthy();

		await backend.close();
	});

	it("bootstraps the public cloud catalog without an API key", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{ capabilities: ["completion", "tools", "thinking"], contextWindow: 202752, id: "glm-5.1" },
			{ capabilities: ["completion", "tools", "thinking", "vision"], contextWindow: 262144, id: "kimi-k2.5" },
		]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		delete process.env.OLLAMA_API_KEY;

		const harness = createExtensionHarness();
		harnesses.push(harness);
		ollamaProviderExtension(harness.pi as never);

		for (let attempt = 0; attempt < 80; attempt += 1) {
			const models = harness.providers.get("ollama-cloud")?.models as { id: string }[] | undefined;
			if (models?.length === 2) {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 10));
		}

		expect(
			(harness.providers.get("ollama-cloud")?.models as { id: string }[] | undefined)?.map((model) => model.id),
		).toStrictEqual(["glm-5.1", "kimi-k2.5"]);
		expect(backend.getAuthHeaders()).toStrictEqual(["", "", ""]);
		await backend.close();
	});

	it("supports colon aliases for info and pull usage", async () => {
		const harness = createExtensionHarness();
		harnesses.push(harness);
		(harness.ctx as any).modelRegistry = {
			...(harness.ctx.modelRegistry as object),
			authStorage: {
				get: vi.fn(() => {}),
				set: vi.fn(),
			},
		};
		ollamaProviderExtension(harness.pi as never);

		await harness.commands.get("ollama:pull")?.handler?.("", harness.ctx as never);
		expect(harness.notifications.at(-1)?.msg).toContain("Usage: /ollama:pull <model>");

		await harness.commands.get("ollama:pull")?.handler?.("missing-model", harness.ctx as never);
		expect(harness.notifications.at(-1)?.msg).toContain("Run /ollama:refresh-models first.");

		await harness.commands.get("ollama:info")?.handler?.("", harness.ctx as never);
		expect(harness.notifications.at(-1)?.msg).toContain("Usage: /ollama:info <model>");

		await harness.commands.get("ollama:info")?.handler?.("missing-model", harness.ctx as never);
		expect(harness.notifications.at(-1)?.msg).toContain("Run /ollama:refresh-models first.");

		await harness.commands.get("ollama:status")?.handler?.("", harness.ctx as never);
		expect(harness.notifications.at(-1)?.msg).toContain("Ollama");
	});

	it("uses colon-style guidance when a local model is not installed yet", async () => {
		vi.spyOn(localModule, "getOllamaCliStatus").mockResolvedValue({ available: true, version: "0.9.0" });
		vi.spyOn(modelsModule, "discoverOllamaLocalModels").mockResolvedValue([]);
		const harness = createExtensionHarness();
		harnesses.push(harness);
		ollamaProviderExtension(harness.pi as never);

		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);
		await new Promise((resolve) => setTimeout(resolve, 300));

		const provider = harness.providers.get("ollama");
		expect(provider).toBeDefined();
		expect(() =>
			provider?.streamSimple?.({ id: "missing-model", provider: "ollama" } as never, {} as never),
		).toThrow(/\/ollama:pull missing-model/);
	});
});
