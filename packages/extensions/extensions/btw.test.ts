import { completeSimple, streamSimple } from "@mariozechner/pi-ai";


vi.mock<typeof import('@mariozechner/pi-ai')>(import('@mariozechner/pi-ai'), () => ({
	completeSimple: vi.fn(),
	getEnvApiKey: vi.fn((provider: string) => (provider === "openai" ? "env-openai-key" : undefined)),
	streamSimple: vi.fn(),
}));

vi.mock<typeof import('@mariozechner/pi-tui')>(import('@mariozechner/pi-tui'), () => ({
	Text: class Text {
		constructor(public text: string) {}
	},
}));

vi.mock<typeof import('@mariozechner/pi-coding-agent')>(import('@mariozechner/pi-coding-agent'), () => ({
	AuthStorage: {
		create: vi.fn(() => ({ source: "auth-storage" })),
	},
	ModelRegistry: class ModelRegistry {
		async getApiKey(model: { provider: string; id: string }) {
			return `dynamic:${model.provider}/${model.id}`;
		}
	},
	buildSessionContext: vi.fn(() => ({ messages: [] })),
}));

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import btwExtension, { resolveBtwApiKey } from "./btw.js";

const mockStreamSimple = vi.mocked(streamSimple);
const mockCompleteSimple = vi.mocked(completeSimple);

const model = {
	api: "anthropic-messages",
	id: "claude-sonnet-4",
	provider: "anthropic",
};

async function* createStream(events: any[]) {
	for (const event of events) {
		yield event;
	}
}

describe(resolveBtwApiKey, () => {
	it("uses modelRegistry.getApiKey when available", async () => {
		const getApiKey = vi.fn().mockResolvedValue("direct-key");

		await expect(resolveBtwApiKey(model as never, { getApiKey })).resolves.toBe("direct-key");
		expect(getApiKey).toHaveBeenCalledWith(model);
	});

	it("falls back to modelRegistry.getApiKeyForProvider", async () => {
		const getApiKeyForProvider = vi.fn().mockResolvedValue("provider-key");

		await expect(resolveBtwApiKey(model as never, { getApiKeyForProvider })).resolves.toBe("provider-key");
		expect(getApiKeyForProvider).toHaveBeenCalledWith("anthropic");
	});

	it("falls back to modelRegistry.authStorage.getApiKey", async () => {
		const getApiKey = vi.fn().mockResolvedValue("auth-storage-key");

		await expect(resolveBtwApiKey(model as never, { authStorage: { getApiKey } })).resolves.toBe("auth-storage-key");
		expect(getApiKey).toHaveBeenCalledWith("anthropic");
	});

	it("reconstructs a registry when the runtime registry lacks getApiKey", async () => {
		await expect(resolveBtwApiKey(model as never, {})).resolves.toBe("dynamic:anthropic/claude-sonnet-4");
	});
});

describe("btw commands and rendering", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("registers btw and qq command families", () => {
		const harness = createExtensionHarness();
		btwExtension(harness.pi as never);

		expect([...harness.commands.keys()].toSorted()).toStrictEqual([
			"btw",
			"btw:clear",
			"btw:inject",
			"btw:new",
			"btw:summarize",
			"qq",
			"qq:clear",
			"qq:inject",
			"qq:new",
			"qq:summarize",
		]);
	});

	it("warns when /btw is called without a question", async () => {
		const harness = createExtensionHarness();
		btwExtension(harness.pi as never);

		await harness.commands.get("btw").handler("   ", harness.ctx);

		expect(harness.notifications).toContainEqual({
			msg: "Usage: /btw [--save] <question>",
			type: "warning",
		});
	});

	it("shows an error when no model is active", async () => {
		const harness = createExtensionHarness();
		btwExtension(harness.pi as never);

		await harness.commands.get("btw").handler("What changed?", harness.ctx);

		expect(harness.notifications).toContainEqual({
			msg: "No active model selected.",
			type: "error",
		});
	});

	it("streams a BTW answer, persists the thread entry, and saves visible notes", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = model as never;
		harness.ctx.modelRegistry = { getApiKey: vi.fn().mockResolvedValue("direct-key") } as never;
		harness.ctx.ui.setWidget = vi.fn();
		const appendEntry = vi.fn();
		const sendMessage = vi.fn();
		harness.pi.appendEntry = appendEntry;
		harness.pi.sendMessage = sendMessage;
		mockStreamSimple.mockReturnValueOnce(
			createStream([
				{ delta: "Thinking", type: "thinking_delta" },
				{ delta: "Answer", type: "text_delta" },
				{
					message: {
						api: "anthropic-messages",
						content: [
							{ type: "thinking", thinking: "Thinking" },
							{ type: "text", text: "Answer" },
						],
						model: "claude-sonnet-4",
						provider: "anthropic",
						stopReason: "stop",
						timestamp: Date.now(),
						usage: { cacheRead: 0, cacheWrite: 0, input: 1, output: 2, totalTokens: 3 },
					},
					type: "done",
				},
			]) as never,
		);

		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("--save What changed?", harness.ctx);

		expect(appendEntry).toHaveBeenCalledWith(
			"btw-thread-entry",
			expect.objectContaining({ answer: "Answer", question: "What changed?", thinking: "Thinking" }),
		);
		expect(sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({ content: "Q: What changed?\n\nA: Answer", customType: "btw-note" }),
		);
		expect(harness.notifications).toContainEqual({ msg: "Saved BTW note to the session.", type: "info" });
		expect(harness.ctx.ui.setWidget).toHaveBeenCalledWith();
	});

	it("queues saved btw notes as follow-up messages when the session is busy", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = model as never;
		harness.ctx.modelRegistry = { getApiKey: vi.fn().mockResolvedValue("direct-key") } as never;
		harness.ctx.isIdle = () => false;
		const sendMessage = vi.fn();
		harness.pi.sendMessage = sendMessage;
		mockStreamSimple.mockReturnValueOnce(
			createStream([
				{
					message: {
						api: "anthropic-messages",
						content: [{ type: "text", text: "Busy answer" }],
						model: "claude-sonnet-4",
						provider: "anthropic",
						stopReason: "stop",
						timestamp: Date.now(),
						usage: { cacheRead: 0, cacheWrite: 0, input: 1, output: 1, totalTokens: 2 },
					},
					type: "done",
				},
			]) as never,
		);

		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("--save Busy?", harness.ctx);

		expect(sendMessage).toHaveBeenCalledWith(expect.anything(), { deliverAs: "followUp" });
		expect(harness.notifications).toContainEqual({
			msg: "BTW note queued to save after the current turn finishes.",
			type: "info",
		});
	});

	it("injects or summarizes a thread back into the main session", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = model as never;
		harness.ctx.modelRegistry = { getApiKey: vi.fn().mockResolvedValue("direct-key") } as never;
		const appendEntry = vi.fn();
		const sendUserMessage = vi.fn();
		harness.pi.appendEntry = appendEntry;
		harness.pi.sendUserMessage = sendUserMessage;
		mockStreamSimple.mockReturnValueOnce(
			createStream([
				{
					message: {
						api: "anthropic-messages",
						content: [{ type: "text", text: "Initial answer" }],
						model: "claude-sonnet-4",
						provider: "anthropic",
						stopReason: "stop",
						timestamp: Date.now(),
						usage: { cacheRead: 0, cacheWrite: 0, input: 1, output: 1, totalTokens: 2 },
					},
					type: "done",
				},
			]) as never,
		);
		mockCompleteSimple.mockResolvedValueOnce({
			api: "anthropic-messages",
			content: [{ type: "text", text: "Summary of the side thread" }],
			model: "claude-sonnet-4",
			provider: "anthropic",
			stopReason: "stop",
			timestamp: Date.now(),
			usage: { cacheRead: 0, cacheWrite: 0, input: 1, output: 1, totalTokens: 2 },
		} as never);

		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("Investigate auth", harness.ctx);
		await harness.commands.get("btw:summarize").handler("Use this to update the plan.", harness.ctx);

		expect(sendUserMessage).toHaveBeenCalledWith(
			expect.stringContaining("Here is a summary of a side conversation I had. Use this to update the plan."),
		);
		expect(appendEntry).toHaveBeenCalledWith("btw-thread-reset", expect.any(Object));
		expect(harness.notifications).toContainEqual({ msg: "Injected BTW summary (1 exchange).", type: "info" });
	});

	it("warns when inject or summarize is requested without a thread", async () => {
		const harness = createExtensionHarness();
		btwExtension(harness.pi as never);

		await harness.commands.get("btw:inject").handler("", harness.ctx);
		await harness.commands.get("btw:summarize").handler("", harness.ctx);

		expect(harness.notifications).toContainEqual({ msg: "No BTW thread to inject.", type: "warning" });
		expect(harness.notifications).toContainEqual({ msg: "No BTW thread to summarize.", type: "warning" });
	});

	it("filters visible BTW notes out of the main context and renders expanded messages", async () => {
		const harness = createExtensionHarness();
		btwExtension(harness.pi as never);

		const [result] = await harness.emitAsync("context", {
			messages: [
				{ content: "keep", role: "user" },
				{ content: "hide", customType: "btw-note", role: "custom" },
			],
		});
		expect(result.messages).toStrictEqual([{ content: "keep", role: "user" }]);

		const renderer = harness.messageRenderers.get("btw-note");
		const rendered = renderer(
			{
				content: "Q: Why?\n\nA: Because.",
				details: {
					model: "claude-sonnet-4",
					provider: "anthropic",
					thinkingLevel: "low",
					usage: { input: 1, output: 2, totalTokens: 3 },
				},
			},
			{ expanded: true },
			{ bold: (text: string) => text, fg: (_tone: string, text: string) => text },
		);
		expect(rendered.text).toContain("[BTW]");
		expect(rendered.text).toContain("model: anthropic/claude-sonnet-4");
		expect(rendered.text).toContain("tokens: in 1 · out 2 · total 3");
	});
});

describe("btw startup restore", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("defers session_start thread restoration until after the startup window", async () => {
		const harness = createExtensionHarness();
		const getBranch = vi.fn(() => [
			{
				customType: "btw-thread-entry",
				data: {
					answer: "A few startup paths were deferred.",
					model: "claude-sonnet-4",
					provider: "anthropic",
					question: "What changed?",
					thinking: "",
					thinkingLevel: "off",
					timestamp: Date.now(),
				},
				type: "custom",
			},
		]);
		harness.ctx.sessionManager.getBranch = getBranch;
		harness.ctx.ui.setWidget = vi.fn();

		btwExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		expect(getBranch).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(250);
		expect(getBranch).toHaveBeenCalledOnce();
		expect(harness.ctx.ui.setWidget).toHaveBeenCalledWith(
			"btw",
			expect.any(Function),
			expect.objectContaining({ placement: "aboveEditor" }),
		);
	});

	it("cancels deferred session_start restoration on session_shutdown", async () => {
		const harness = createExtensionHarness();
		const getBranch = vi.fn(() => []);
		harness.ctx.sessionManager.getBranch = getBranch;

		btwExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
		await vi.advanceTimersByTimeAsync(250);

		expect(getBranch).not.toHaveBeenCalled();
	});
});
