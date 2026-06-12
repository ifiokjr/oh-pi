import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-ai", () => ({
	getEnvApiKey: vi.fn((provider: string) => (provider === "openai" ? "env-openai-key" : undefined)),
}));

vi.mock("@mariozechner/pi-tui", () => ({
	Container: class Container {
		children: any[] = [];
		addChild(child: any) {
			this.children.push(child);
		}
	},
	Input: class Input {
		focused = false;
		onSubmit: ((value: string) => void) | null = null;
		onEscape: (() => void) | null = null;
		setValue(_value: string) {}
		getValue() {
			return "";
		}
		handleInput(_data: string) {}
		render(_width: number) {
			return [""];
		}
	},
	Markdown: class Markdown {
		constructor(
			public text: string,
			public x: number,
			public y: number,
			public theme?: unknown,
		) {}
		render(_width: number) {
			return [this.text];
		}
	},
	Text: class Text {
		constructor(public text: string) {}
	},
	truncateToWidth: (text: string, _width: number, _ellipsis = "") => text,
	visibleWidth: (text: string) => text.length,
}));

const mockSession = {
	agent: {
		state: {
			messages: [] as any[],
		},
	},
	subscribe: vi.fn(() => vi.fn()),
	prompt: vi.fn(),
	abort: vi.fn(),
	dispose: vi.fn(),
	state: {
		messages: [] as any[],
	},
};

vi.mock("@mariozechner/pi-coding-agent", () => ({
	buildSessionContext: vi.fn(() => ({ messages: [] })),
	createAgentSession: vi.fn(() =>
		Promise.resolve({
			session: mockSession,
			extensionsResult: { extensions: [], errors: [], runtime: {} },
		}),
	),
	createExtensionRuntime: vi.fn(() => ({})),
	getMarkdownTheme: () => ({ theme: "markdown" }),
	SessionManager: {
		inMemory: vi.fn(() => ({})),
	},
}));

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import btwExtension from "./btw.js";

const model = {
	provider: "anthropic",
	id: "claude-sonnet-4",
	api: "anthropic-messages",
};

function makeAssistantResponse(text: string, stopReason = "stop") {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		provider: "anthropic",
		model: "claude-sonnet-4",
		api: "anthropic-messages",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		timestamp: Date.now(),
	};
}

describe("btw commands and rendering", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSession.agent.state.messages = [];
		mockSession.state.messages = [];
		mockSession.prompt.mockImplementation(async () => {
			const response = makeAssistantResponse("Test answer");
			mockSession.state.messages = [{ role: "user" }, response];
			mockSession.agent.state.messages = mockSession.state.messages;
		});
	});

	it("registers btw and qq command families", () => {
		const harness = createExtensionHarness();
		btwExtension(harness.pi as never);

		const commands = Array.from(harness.commands.keys()).sort();
		expect(commands).toContain("btw");
		expect(commands).toContain("btw clear");
		expect(commands).toContain("btw inject");
		expect(commands).toContain("btw summarize");
		expect(commands).toContain("qq");
		expect(commands).toContain("qq clear");
		expect(commands).toContain("qq inject");
		expect(commands).toContain("qq summarize");
	});

	it("opens overlay when /btw is called without a question if no thread exists", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = model as never;
		harness.ctx.modelRegistry = {
			getApiKey: vi.fn().mockResolvedValue("direct-key"),
			getAvailable: () => [],
		} as never;
		const customSpy = vi.fn().mockResolvedValue(null);
		harness.ctx.ui.custom = customSpy;

		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("", harness.ctx);

		// Should have attempted to open the overlay
		expect(customSpy).toHaveBeenCalled();
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

	it("creates a side session and persists the thread entry", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = model as never;
		harness.ctx.modelRegistry = {
			getApiKey: vi.fn().mockResolvedValue("direct-key"),
			getAvailable: () => [],
		} as never;
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		harness.ctx.ui.custom = vi.fn().mockResolvedValue(null);

		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("What changed?", harness.ctx);

		expect(appendEntry).toHaveBeenCalledWith(
			"btw-thread-entry",
			expect.objectContaining({
				question: "What changed?",
				answer: "Test answer",
			}),
		);
	});

	it("persists a btw-thread-reset on clear", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = model as never;
		harness.ctx.modelRegistry = {
			getApiKey: vi.fn().mockResolvedValue("direct-key"),
			getAvailable: () => [],
		} as never;
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;

		btwExtension(harness.pi as never);
		await harness.commands.get("btw clear").handler("", harness.ctx);

		expect(appendEntry).toHaveBeenCalledWith(
			"btw-thread-reset",
			expect.objectContaining({ timestamp: expect.any(Number) }),
		);
		expect(harness.notifications).toContainEqual({
			msg: "Cleared BTW thread.",
			type: "info",
		});
	});

	it("warns when inject is requested without a thread", async () => {
		const harness = createExtensionHarness();
		btwExtension(harness.pi as never);

		await harness.commands.get("btw inject").handler("", harness.ctx);

		expect(harness.notifications).toContainEqual({
			msg: "No BTW thread to inject.",
			type: "warning",
		});
	});

	it("warns when summarize is requested without a thread", async () => {
		const harness = createExtensionHarness();
		btwExtension(harness.pi as never);

		await harness.commands.get("btw summarize").handler("", harness.ctx);

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
		expect(rendered.children.length).toBeGreaterThanOrEqual(1);
		const markdownChildren = rendered.children.filter((c: any) => c.constructor.name === "Markdown");
		expect(markdownChildren.length).toBeGreaterThanOrEqual(2);
		// Second Markdown child is the content
		expect(markdownChildren[1].text).toContain("Because.");
	});

	it("injects a full thread into the main session", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = model as never;
		harness.ctx.modelRegistry = {
			getApiKey: vi.fn().mockResolvedValue("direct-key"),
			getAvailable: () => [],
		} as never;
		const appendEntry = vi.fn();
		const sendUserMessage = vi.fn();
		harness.pi.appendEntry = appendEntry;
		harness.pi.sendUserMessage = sendUserMessage;

		btwExtension(harness.pi as never);
		// First create a thread entry
		await harness.commands.get("btw").handler("Investigate auth", harness.ctx);
		// Then inject it
		await harness.commands.get("btw inject").handler("", harness.ctx);

		expect(sendUserMessage).toHaveBeenCalledWith(expect.stringContaining("side conversation"));
		expect(appendEntry).toHaveBeenCalledWith("btw-thread-reset", expect.any(Object));
	});

	it("does not reset thread on session_tree while busy", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = model as never;
		harness.ctx.modelRegistry = {
			getApiKey: vi.fn().mockResolvedValue("direct-key"),
			getAvailable: () => [],
		} as never;

		// Make the prompt never resolve (simulating busy state)
		let resolvePrompt: (() => void) | undefined;
		mockSession.prompt.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolvePrompt = resolve;
				}),
		);

		btwExtension(harness.pi as never);

		const runPromise = harness.commands.get("btw").handler("Question?", harness.ctx);

		await new Promise((r) => setTimeout(r, 0));

		const getBranch = vi.fn(() => []);
		harness.ctx.sessionManager.getBranch = getBranch;

		harness.emit("session_tree", { type: "session_tree" }, harness.ctx);

		expect(getBranch).not.toHaveBeenCalled();

		resolvePrompt?.();
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

	it("restores thread on session_start", async () => {
		const harness = createExtensionHarness();
		const getBranch = vi.fn(() => [
			{
				type: "custom",
				customType: "btw-thread-entry",
				data: {
					question: "What changed?",
					answer: "A few startup paths were deferred.",
					provider: "anthropic",
					model: "claude-sonnet-4",
					thinkingLevel: "off",
					timestamp: Date.now(),
				},
			},
		]);
		harness.ctx.sessionManager.getBranch = getBranch;

		btwExtension(harness.pi as never);
		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);

		expect(getBranch).toHaveBeenCalled();
	});
});
