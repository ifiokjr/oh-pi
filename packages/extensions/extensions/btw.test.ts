import { completeSimple, streamSimple } from "@mariozechner/pi-ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-ai", () => ({
	completeSimple: vi.fn(),
	streamSimple: vi.fn(),
	getEnvApiKey: vi.fn((provider: string) => (provider === "openai" ? "env-openai-key" : undefined)),
}));

vi.mock("@mariozechner/pi-tui", () => ({
	Container: class Container {
		children: any[] = [];
		addChild(child: any) {
			this.children.push(child);
		}
	},
	Markdown: class Markdown {
		constructor(
			public text: string,
			public x: number,
			public y: number,
			public theme?: unknown,
		) {}
	},
	Text: class Text {
		constructor(public text: string) {}
	},
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	buildSessionContext: vi.fn(() => ({ messages: [] })),
	getMarkdownTheme: () => ({ theme: "markdown" }),
	AuthStorage: {
		create: vi.fn(() => ({ source: "auth-storage" })),
	},
	ModelRegistry: class ModelRegistry {
		async getApiKey(model: { provider: string; id: string }) {
			return `dynamic:${model.provider}/${model.id}`;
		}
	},
}));

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import btwExtension, { resolveBtwApiKey } from "./btw.js";

const mockStreamSimple = vi.mocked(streamSimple);
const mockCompleteSimple = vi.mocked(completeSimple);

const model = {
	provider: "anthropic",
	id: "claude-sonnet-4",
	api: "anthropic-messages",
};

async function* createStream(events: any[]) {
	for (const event of events) {
		yield event;
	}
}

describe("resolveBtwApiKey", () => {
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

		expect(Array.from(harness.commands.keys()).sort()).toEqual([
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
		harness.ctx.modelRegistry = {
			getApiKey: vi.fn().mockResolvedValue("direct-key"),
		} as never;
		harness.ctx.ui.setWidget = vi.fn();
		const appendEntry = vi.fn();
		const sendMessage = vi.fn();
		harness.pi.appendEntry = appendEntry;
		harness.pi.sendMessage = sendMessage;
		mockStreamSimple.mockReturnValueOnce(
			createStream([
				{ type: "thinking_delta", delta: "Thinking" },
				{ type: "text_delta", delta: "Answer" },
				{
					type: "done",
					message: {
						content: [
							{ type: "thinking", thinking: "Thinking" },
							{ type: "text", text: "Answer" },
						],
						provider: "anthropic",
						model: "claude-sonnet-4",
						api: "anthropic-messages",
						usage: {
							input: 1,
							output: 2,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 3,
						},
						stopReason: "stop",
						timestamp: Date.now(),
					},
				},
			]) as never,
		);

		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("--save What changed?", harness.ctx);

		expect(appendEntry).toHaveBeenCalledWith(
			"btw-thread-entry",
			expect.objectContaining({
				question: "What changed?",
				answer: "Answer",
				thinking: "Thinking",
			}),
		);
		expect(sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "btw-note",
				content: "**Question:** What changed?\n\nAnswer",
			}),
		);
		expect(harness.notifications).toContainEqual({
			msg: "Saved BTW note to the session.",
			type: "info",
		});
		expect(harness.ctx.ui.setWidget).toHaveBeenCalled();
	});

	it("queues saved btw notes as follow-up messages when the session is busy", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = model as never;
		harness.ctx.modelRegistry = {
			getApiKey: vi.fn().mockResolvedValue("direct-key"),
		} as never;
		harness.ctx.isIdle = () => false;
		const sendMessage = vi.fn();
		harness.pi.sendMessage = sendMessage;
		mockStreamSimple.mockReturnValueOnce(
			createStream([
				{
					type: "done",
					message: {
						content: [{ type: "text", text: "Busy answer" }],
						provider: "anthropic",
						model: "claude-sonnet-4",
						api: "anthropic-messages",
						usage: {
							input: 1,
							output: 1,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 2,
						},
						stopReason: "stop",
						timestamp: Date.now(),
					},
				},
			]) as never,
		);

		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("--save Busy?", harness.ctx);

		expect(sendMessage).toHaveBeenCalledWith(expect.anything(), {
			deliverAs: "followUp",
		});
		expect(harness.notifications).toContainEqual({
			msg: "BTW note queued to save after the current turn finishes.",
			type: "info",
		});
	});

	it("injects or summarizes a thread back into the main session", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = model as never;
		harness.ctx.modelRegistry = {
			getApiKey: vi.fn().mockResolvedValue("direct-key"),
		} as never;
		const appendEntry = vi.fn();
		const sendUserMessage = vi.fn();
		harness.pi.appendEntry = appendEntry;
		harness.pi.sendUserMessage = sendUserMessage;
		mockStreamSimple.mockReturnValueOnce(
			createStream([
				{
					type: "done",
					message: {
						content: [{ type: "text", text: "Initial answer" }],
						provider: "anthropic",
						model: "claude-sonnet-4",
						api: "anthropic-messages",
						usage: {
							input: 1,
							output: 1,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 2,
						},
						stopReason: "stop",
						timestamp: Date.now(),
					},
				},
			]) as never,
		);
		mockCompleteSimple.mockResolvedValueOnce({
			content: [{ type: "text", text: "Summary of the side thread" }],
			provider: "anthropic",
			model: "claude-sonnet-4",
			api: "anthropic-messages",
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 2,
			},
			stopReason: "stop",
			timestamp: Date.now(),
		} as never);

		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("Investigate auth", harness.ctx);
		await harness.commands.get("btw:summarize").handler("Use this to update the plan.", harness.ctx);

		expect(sendUserMessage).toHaveBeenCalledWith(
			expect.stringContaining("Here is a summary of a side conversation I had. Use this to update the plan."),
		);
		expect(appendEntry).toHaveBeenCalledWith("btw-thread-reset", expect.any(Object));
		expect(harness.notifications).toContainEqual({
			msg: "Injected BTW summary (1 exchange).",
			type: "info",
		});
	});

	it("warns when inject or summarize is requested without a thread", async () => {
		const harness = createExtensionHarness();
		btwExtension(harness.pi as never);

		await harness.commands.get("btw:inject").handler("", harness.ctx);
		await harness.commands.get("btw:summarize").handler("", harness.ctx);

		expect(harness.notifications).toContainEqual({
			msg: "No BTW thread to inject.",
			type: "warning",
		});
		expect(harness.notifications).toContainEqual({
			msg: "No BTW thread to summarize.",
			type: "warning",
		});
	});

	it("filters visible BTW notes out of the main context and renders expanded messages", async () => {
		const harness = createExtensionHarness();
		btwExtension(harness.pi as never);

		const [result] = await harness.emitAsync("context", {
			messages: [
				{ role: "user", content: "keep" },
				{ role: "custom", customType: "btw-note", content: "hide" },
			],
		});
		expect(result.messages).toEqual([{ role: "user", content: "keep" }]);

		const renderer = harness.messageRenderers.get("btw-note");
		const rendered = renderer(
			{
				content: "**Question:** Why?\n\nBecause.",
				details: {
					provider: "anthropic",
					model: "claude-sonnet-4",
					thinkingLevel: "low",
					usage: { input: 1, output: 2, totalTokens: 3 },
				},
			},
			{ expanded: true },
			{
				bold: (text: string) => text,
				fg: (_tone: string, text: string) => text,
			},
		);
		expect(rendered.children[0].text).toContain("[BTW]");
		expect(rendered.children[0].text).toContain("model: anthropic/claude-sonnet-4");
		expect(rendered.children[0].text).toContain("tokens: in 1 · out 2 · total 3");
		const markdownChild = rendered.children.find((c: any) => c.constructor.name === "Markdown");
		expect(markdownChild).toBeDefined();
		expect(markdownChild.text).toContain("Because.");
	});

	it("does not reset active BTW slots on session_tree", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = model as never;
		harness.ctx.modelRegistry = {
			getApiKey: vi.fn().mockResolvedValue("direct-key"),
		} as never;

		let finishStream: (() => void) | undefined;
		mockStreamSimple.mockReturnValueOnce(
			(async function* () {
				yield { type: "text_delta", delta: "partial" };
				await new Promise<void>((resolve) => {
					finishStream = resolve;
				});
				yield {
					type: "done",
					message: {
						content: [{ type: "text", text: "Answer" }],
						provider: "anthropic",
						model: "claude-sonnet-4",
						api: "anthropic-messages",
						usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
						stopReason: "stop",
						timestamp: Date.now(),
					},
				};
			})() as never,
		);

		btwExtension(harness.pi as never);

		const runPromise = harness.commands.get("btw").handler("Question?", harness.ctx);

		await new Promise((r) => setTimeout(r, 0));

		const getBranch = vi.fn(() => []);
		harness.ctx.sessionManager.getBranch = getBranch;

		harness.emit("session_tree", { type: "session_tree" }, harness.ctx);

		expect(getBranch).not.toHaveBeenCalled();

		finishStream?.();
		await runPromise;
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
				type: "custom",
				customType: "btw-thread-entry",
				data: {
					question: "What changed?",
					thinking: "",
					answer: "A few startup paths were deferred.",
					provider: "anthropic",
					model: "claude-sonnet-4",
					thinkingLevel: "off",
					timestamp: Date.now(),
				},
			},
		]);
		harness.ctx.sessionManager.getBranch = getBranch;
		harness.ctx.ui.setWidget = vi.fn();

		btwExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		expect(getBranch).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(250);
		expect(getBranch).toHaveBeenCalledTimes(1);
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
