import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-ai", () => ({
	getEnvApiKey: vi.fn((provider: string) => (provider === "openai" ? "env-openai-key" : undefined)),
}));

vi.mock("@earendil-works/pi-tui", () => ({
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
		private value = "";
		setValue(value: string) {
			this.value = value;
		}
		getValue() {
			return this.value;
		}
		handleInput(_data: string) {}
		render(_width: number) {
			return [this.value];
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

vi.mock("@earendil-works/pi-coding-agent", () => ({
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
import btwExtension from "../index.js";

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

function configureModel(harness: ReturnType<typeof createExtensionHarness>) {
	harness.ctx.model = model as never;
	harness.ctx.modelRegistry = {
		getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "direct-key", headers: {} }),
		getAvailable: () => [],
	} as never;
}

describe("btw command", () => {
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

	it("registers the upstream single-command BTW flow", () => {
		const harness = createExtensionHarness();
		btwExtension(harness.pi as never);

		expect(Array.from(harness.commands.keys()).sort()).toEqual(["btw"]);
	});

	it("opens the overlay when /btw is called without a question", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		const customSpy = vi.fn().mockResolvedValue(null);
		harness.ctx.ui.custom = customSpy;

		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("", harness.ctx);

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
		configureModel(harness);
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

	it("restores thread entries on session_start", async () => {
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

	it("does not reset the thread on session_tree while a side prompt is busy", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);

		let resolvePrompt: (() => void) | undefined;
		mockSession.prompt.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolvePrompt = resolve;
				}),
		);

		btwExtension(harness.pi as never);
		const runPromise = harness.commands.get("btw").handler("Question?", harness.ctx);
		await new Promise((resolve) => setTimeout(resolve, 0));

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

	it("ignores entries before the last reset marker", async () => {
		const harness = createExtensionHarness();
		const getBranch = vi.fn(() => [
			{
				type: "custom",
				customType: "btw-thread-entry",
				data: {
					question: "Old question",
					answer: "Old answer",
					provider: "anthropic",
					model: "claude-sonnet-4",
					thinkingLevel: "off",
					timestamp: Date.now(),
				},
			},
			{ type: "custom", customType: "btw-thread-reset", data: { timestamp: Date.now() } },
		]);
		harness.ctx.sessionManager.getBranch = getBranch;

		btwExtension(harness.pi as never);
		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);

		expect(getBranch).toHaveBeenCalled();
	});
});
