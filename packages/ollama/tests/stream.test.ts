import http from "node:http";
import type { AddressInfo } from "node:net";
import { registerApiProvider, resetApiProviders, streamSimple, streamSimpleOpenAICompletions } from '@mariozechner/pi-ai';
import type { Model } from '@mariozechner/pi-ai';

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import ollamaProviderExtension from "../index.js";
import { OLLAMA_API } from "../config.js";
import { toOllamaModel } from "../models.js";

interface ChatCompletionPayload {
	model?: string;
	max_tokens?: number;
	reasoning_effort?: string;
	enable_thinking?: boolean;
	stream?: boolean;
}

async function createReasoningAwareChatBackend(): Promise<{
	apiUrl: string;
	requests: ChatCompletionPayload[];
	close: () => Promise<void>;
}> {
	const requests: ChatCompletionPayload[] = [];
	const server = http.createServer((req, res) => {
		if (req.url !== "/v1/chat/completions" || req.method !== "POST") {
			res.writeHead(404, { "Content-Type": "text/plain" });
			res.end("not found");
			return;
		}

		let body = "";
		req.on("data", (chunk) => {
			body += String(chunk);
		});
		req.on("end", () => {
			const payload = JSON.parse(body || "{}") as ChatCompletionPayload;
			requests.push(payload);

			const shouldReturnVisibleText =
				typeof payload.max_tokens === "number" &&
				payload.max_tokens >= 32_000 &&
				payload.reasoning_effort === undefined &&
				typeof payload.enable_thinking === "boolean";

			res.writeHead(200, {
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				"Content-Type": "text/event-stream",
			});

			if (payload.enable_thinking) {
				writeSse(res, {
					choices: [{ delta: { reasoning: "Plan the exact reply first." }, finish_reason: null }],
				});
			}

			if (shouldReturnVisibleText) {
				writeSse(res, {
					choices: [{ delta: { content: "OK" }, finish_reason: null }],
				});
			} else {
				writeSse(res, {
					choices: [{ delta: { reasoning: "Spent the full budget reasoning." }, finish_reason: null }],
				});
			}

			writeSse(res, {
				choices: [{ delta: {}, finish_reason: "stop" }],
				usage: {
					completion_tokens: shouldReturnVisibleText ? 12 : 96,
					completion_tokens_details: { reasoning_tokens: shouldReturnVisibleText ? 4 : 96 },
					prompt_tokens: 10,
					prompt_tokens_details: { cached_tokens: 0 },
				},
			});
			writeSse(res, "[DONE]");
			res.end();
		});
	});

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const {port} = (server.address() as AddressInfo);
	const apiUrl = `http://127.0.0.1:${port}/v1`;

	return {
		apiUrl,
		async close() {
			await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
		},
		requests,
	};
}

function writeSse(res: http.ServerResponse, chunk: unknown): void {
	const data = typeof chunk === "string" ? chunk : JSON.stringify(chunk);
	res.write(`data: ${data}\n\n`);
}

function createCloudGlmModel(baseUrl: string): Model<"openai-completions"> {
	return {
		...toOllamaModel({ id: "glm-5.1", input: ["text"], maxTokens: 25_344, reasoning: true, source: "cloud" }),
		api: "openai-completions",
		baseUrl,
		provider: "ollama-cloud",
	};
}

function extractText(blocks: { type: string; text?: string }[]): string {
	return blocks
		.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join("");
}

afterEach(() => {
	resetApiProviders();
});

describe("ollama glm cloud streaming", () => {
	it("uses z.ai thinking flags and a larger default token budget when reasoning is enabled", async () => {
		const backend = await createReasoningAwareChatBackend();

		try {
			const payloads: ChatCompletionPayload[] = [];
			const result = await streamSimpleOpenAICompletions(
				createCloudGlmModel(backend.apiUrl),
				{
					messages: [{ content: "Reply with exactly: OK", role: "user", timestamp: Date.now() }],
				},
				{
					apiKey: "test-key",
					onPayload: (payload) => {
						payloads.push(payload as ChatCompletionPayload);
					},
					reasoning: "medium",
				},
			).result();

			expect(extractText(result.content as { type: string; text?: string }[])).toBe("OK");
			expect(payloads[0]).toMatchObject({
				enable_thinking: true,
				max_tokens: 32_000,
				model: "glm-5.1",
			});
			expect(payloads[0]?.reasoning_effort).toBeUndefined();
			expect(backend.requests[0]).toMatchObject({ enable_thinking: true, max_tokens: 32_000 });
		} finally {
			await backend.close();
		}
	});

	it("explicitly disables z.ai thinking by default so glm replies stay visible", async () => {
		const backend = await createReasoningAwareChatBackend();

		try {
			const payloads: ChatCompletionPayload[] = [];
			const result = await streamSimpleOpenAICompletions(
				createCloudGlmModel(backend.apiUrl),
				{
					messages: [{ content: "Reply with exactly: OK", role: "user", timestamp: Date.now() }],
				},
				{
					apiKey: "test-key",
					onPayload: (payload) => {
						payloads.push(payload as ChatCompletionPayload);
					},
				},
			).result();

			expect(extractText(result.content as { type: string; text?: string }[])).toBe("OK");
			expect(payloads[0]).toMatchObject({
				enable_thinking: false,
				max_tokens: 32_000,
				model: "glm-5.1",
			});
			expect(payloads[0]?.reasoning_effort).toBeUndefined();
			expect(backend.requests[0]).toMatchObject({ enable_thinking: false, max_tokens: 32_000 });
		} finally {
			await backend.close();
		}
	});

	it("keeps cloud glm requests on the cloud path even when the local provider registers last", async () => {
		const backend = await createReasoningAwareChatBackend();
		const harness = createExtensionHarness();
		ollamaProviderExtension(harness.pi as never);

		const cloudProvider = harness.providers.get("ollama-cloud");
		const localProvider = harness.providers.get("ollama");
		if (!cloudProvider || !localProvider) {
			throw new Error("Expected ollama providers to be registered");
		}

		registerApiProvider(
			{
				api: OLLAMA_API,
				stream: (model, context, options) => cloudProvider.streamSimple(model, context, options),
				streamSimple: cloudProvider.streamSimple,
			},
			"test:ollama-cloud",
		);
		registerApiProvider(
			{
				api: OLLAMA_API,
				stream: (model, context, options) => localProvider.streamSimple(model, context, options),
				streamSimple: localProvider.streamSimple,
			},
			"test:ollama-local",
		);

		try {
			const result = await streamSimple(
				createCloudGlmModel(backend.apiUrl),
				{
					messages: [{ content: "Reply with exactly: OK", role: "user", timestamp: Date.now() }],
				},
				{ apiKey: "test-key" },
			).result();

			expect(extractText(result.content as { type: string; text?: string }[])).toBe("OK");
			expect(backend.requests[0]).toMatchObject({ enable_thinking: false, max_tokens: 32_000, model: "glm-5.1" });
		} finally {
			await backend.close();
		}
	});
});
