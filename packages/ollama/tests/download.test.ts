import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import { createTestOllamaBackend, type TestOllamaBackend } from "./test-backend.js";

const execFileMock = vi.fn();
const spawnMock = vi.fn();
const envSnapshot = { ...process.env };
const backends: TestOllamaBackend[] = [];

vi.mock("node:child_process", () => ({
	execFile: execFileMock,
	spawn: spawnMock,
}));

beforeEach(() => {
	execFileMock.mockReset();
	spawnMock.mockReset();
	execFileMock.mockImplementation((_command, _args, _options, callback) => {
		queueMicrotask(() => {
			callback(null, "ollama version 0.8.0", "");
		});
		return {};
	});
});

afterEach(async () => {
	for (const backend of backends.splice(0)) {
		await backend.close();
	}

	for (const key of Object.keys(process.env)) {
		if (!(key in envSnapshot)) {
			delete process.env[key];
		}
	}
	Object.assign(process.env, envSnapshot);
	vi.resetModules();
});

describe("ollama local downloads", () => {
	it("registers downloadable local models with cloud context metadata when the CLI is available", async () => {
		execFileMock.mockImplementation((_command, _args, _options, callback) => {
			queueMicrotask(() => {
				callback(null, "ollama version 0.8.0", "");
			});
			return {};
		});

		const cloudBackend = await createTestOllamaBackend();
		backends.push(cloudBackend);
		cloudBackend.setModels([
			{ id: "glm-5.1", capabilities: ["completion", "tools", "thinking"], contextWindow: 202752 },
			{ id: "kimi-k2.5", capabilities: ["completion", "tools", "thinking", "vision"], contextWindow: 262144 },
		]);

		const localBackend = await createTestOllamaBackend();
		backends.push(localBackend);
		localBackend.setModels([]);

		process.env.PI_OLLAMA_CLOUD_API_URL = cloudBackend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${cloudBackend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${cloudBackend.origin}/api/show`;
		process.env.OLLAMA_HOST = localBackend.origin;

		const { default: ollamaProviderExtension } = await import("../index.js");
		const harness = createExtensionHarness();
		await ollamaProviderExtension(harness.pi as never);

		await waitFor(
			() => ((harness.providers.get("ollama")?.models as Array<{ id: string }> | undefined)?.length ?? 0) === 2,
		);

		const models = harness.providers.get("ollama")?.models as
			| Array<{ id: string; contextWindow: number; localAvailability?: string }>
			| undefined;
		expect(models?.map((model) => model.id)).toEqual(["glm-5.1", "kimi-k2.5"]);
		expect(models?.[0]?.contextWindow).toBe(202752);
		expect(models?.every((model) => model.localAvailability === "downloadable")).toBe(true);
	});

	it("prompts to download a local model and refreshes the installed catalog", async () => {
		execFileMock.mockImplementation((_command, _args, _options, callback) => {
			queueMicrotask(() => {
				callback(null, "ollama version 0.8.0", "");
			});
			return {};
		});

		const cloudBackend = await createTestOllamaBackend();
		backends.push(cloudBackend);
		cloudBackend.setModels([
			{ id: "glm-5.1", capabilities: ["completion", "tools", "thinking"], contextWindow: 202752 },
		]);

		const localBackend = await createTestOllamaBackend();
		backends.push(localBackend);
		localBackend.setModels([]);

		spawnMock.mockImplementation(() => {
			const child = new EventEmitter() as EventEmitter & {
				stdout: PassThrough;
				stderr: PassThrough;
				kill: ReturnType<typeof vi.fn>;
			};
			child.stdout = new PassThrough();
			child.stderr = new PassThrough();
			child.kill = vi.fn();
			queueMicrotask(() => {
				localBackend.setModels([
					{ id: "glm-5.1", capabilities: ["completion", "tools", "thinking"], contextWindow: 202752 },
				]);
				child.stdout.write("pulling glm-5.1\n");
				child.stdout.end();
				child.stderr.end();
				child.emit("close", 0);
			});
			return child;
		});

		process.env.PI_OLLAMA_CLOUD_API_URL = cloudBackend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${cloudBackend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${cloudBackend.origin}/api/show`;
		process.env.OLLAMA_HOST = localBackend.origin;

		const { default: ollamaProviderExtension } = await import("../index.js");
		const harness = createExtensionHarness();
		harness.ctx.ui.confirm = vi.fn(async () => true);
		(harness.ctx.modelRegistry as { refresh?: ReturnType<typeof vi.fn> }).refresh = vi.fn();
		await ollamaProviderExtension(harness.pi as never);

		await waitFor(
			() => ((harness.providers.get("ollama")?.models as Array<{ id: string }> | undefined)?.length ?? 0) === 1,
		);

		await harness.emitAsync(
			"model_select",
			{
				type: "model_select",
				model: { provider: "ollama", id: "glm-5.1" },
				previousModel: undefined,
				source: "set",
			},
			harness.ctx,
		);

		await waitFor(() => {
			const models = harness.providers.get("ollama")?.models as
				| Array<{ id: string; localAvailability?: string }>
				| undefined;
			return models?.[0]?.localAvailability === "installed";
		});

		expect(harness.ctx.ui.confirm).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect((harness.ctx.modelRegistry as { refresh?: ReturnType<typeof vi.fn> }).refresh).toHaveBeenCalledTimes(1);
	});

	it("warns on session start when the Ollama CLI is missing", async () => {
		execFileMock.mockImplementation((_command, _args, _options, callback) => {
			queueMicrotask(() => {
				callback(new Error("command not found"), "", "command not found");
			});
			return {};
		});

		const cloudBackend = await createTestOllamaBackend();
		backends.push(cloudBackend);
		cloudBackend.setModels([
			{ id: "kimi-k2.5", capabilities: ["completion", "tools", "thinking", "vision"], contextWindow: 262144 },
		]);
		process.env.PI_OLLAMA_CLOUD_API_URL = cloudBackend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${cloudBackend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${cloudBackend.origin}/api/show`;

		const { default: ollamaProviderExtension } = await import("../index.js");
		const harness = createExtensionHarness();
		await ollamaProviderExtension(harness.pi as never);
		expect(execFileMock).not.toHaveBeenCalled();

		const sessionStart = harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);
		expect(execFileMock).not.toHaveBeenCalled();
		await sessionStart;
		expect(execFileMock).not.toHaveBeenCalled();

		await waitFor(() =>
			harness.notifications.some((item) => item.msg.includes("Only ollama-cloud models are available right now")),
		);

		expect(execFileMock).toHaveBeenCalled();
		expect(harness.notifications.some((item) => item.type === "warning")).toBe(true);
		expect((harness.providers.get("ollama")?.models as Array<{ id: string }> | undefined) ?? []).toEqual([]);
	});
});

async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
	const startedAt = Date.now();
	while (!check()) {
		if (Date.now() - startedAt > timeoutMs) {
			throw new Error("Timed out waiting for condition.");
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}
