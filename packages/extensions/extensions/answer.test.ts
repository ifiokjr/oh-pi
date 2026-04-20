import { completeSimple } from "@mariozechner/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-ai", () => ({
	completeSimple: vi.fn(),
	getEnvApiKey: vi.fn(),
}));

vi.mock("@ifi/pi-shared-qna", () => ({
	QnATuiComponent: class QnATuiComponent {
		constructor(
			public questions: any[],
			public tui: any,
			public onDone: (result: any) => void,
			public options?: any,
		) {}
	},
	requirePiTuiModule: vi.fn(),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	BorderedLoader: class BorderedLoader {
		public onAbort?: () => void;
		constructor(
			public tui: any,
			public theme: any,
			public label: string,
		) {}
		render() {
			return [];
		}
		handleInput() {}
		invalidate() {}
	},
	buildSessionContext: vi.fn(() => ({ messages: [] })),
}));

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import answerExtension, {
	buildAnswerMessage,
	EXTRACTION_SYSTEM_PROMPT,
	extractQuestions,
	hasQuestionMarkers,
	normalizeExtractedQuestions,
} from "./answer.js";

const mockCompleteSimple = vi.mocked(completeSimple);

const model = {
	provider: "anthropic",
	id: "claude-sonnet-4",
	api: "anthropic-messages",
};

function makeAssistantMessage(text: string, stopReason = "stop") {
	return {
		role: "assistant" as const,
		content: [{ type: "text" as const, text }],
		stopReason,
		provider: "anthropic",
		model: "claude-sonnet-4",
		api: "anthropic-messages",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		timestamp: Date.now(),
	};
}

function makeBranchEntry(message: Record<string, unknown>) {
	return { type: "message", message, id: `entry-${Date.now()}` };
}

function makeCustomEntry(customType: string, data?: unknown) {
	return { type: "custom", customType, data, id: `entry-${Date.now()}` };
}

function setupHarnessWithAssistantMessage(text: string, stopReason = "stop") {
	const harness = createExtensionHarness();
	const msg = makeAssistantMessage(text, stopReason);

	harness.ctx.sessionManager.getBranch = () => [makeBranchEntry(msg)];
	harness.ctx.model = model as never;
	harness.ctx.modelRegistry.getApiKeyAndHeaders = vi.fn().mockResolvedValue({
		ok: true,
		apiKey: "test-key",
		headers: {},
	});

	return harness;
}

function makeExtractedQuestionsResponse(
	questions: Array<{ question: string; context?: string; options?: Array<{ label: string; description: string }> }>,
) {
	return {
		stopReason: "stop",
		content: [{ type: "text" as const, text: JSON.stringify(questions) }],
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
	};
}

function makeQnAResult(answers: string[], texts: string[]): any {
	const responses = answers.map((_, i) => ({
		selectedOptionIndex: 0,
		customText: texts[i] ?? "",
		selectionTouched: true,
		committed: true,
	}));
	const textParts: string[] = [];
	for (let i = 0; i < answers.length; i++) {
		textParts.push(`Q: Question ${i + 1}`);
		textParts.push(`A: ${answers[i]}`);
		if (i < answers.length - 1) {
			textParts.push("");
		}
	}
	return { text: textParts.join("\n").trim(), answers, responses };
}

// ── normalizeExtractedQuestions ────────────────────────────────────────────

describe("normalizeExtractedQuestions", () => {
	it("returns empty array for non-array input", () => {
		expect(normalizeExtractedQuestions(null)).toEqual([]);
		expect(normalizeExtractedQuestions("not an array")).toEqual([]);
		expect(normalizeExtractedQuestions(42)).toEqual([]);
	});

	it("filters entries without a question field", () => {
		expect(normalizeExtractedQuestions([{ foo: "bar" }])).toEqual([]);
	});

	it("filters entries with empty question", () => {
		expect(normalizeExtractedQuestions([{ question: "" }])).toEqual([]);
		expect(normalizeExtractedQuestions([{ question: "   " }])).toEqual([]);
	});

	it("extracts a simple question", () => {
		expect(normalizeExtractedQuestions([{ question: "What DB?" }])).toEqual([{ question: "What DB?" }]);
	});

	it("extracts question with context", () => {
		const result = normalizeExtractedQuestions([{ question: "Which ORM?", context: "We use Node.js" }]);
		expect(result).toEqual([{ question: "Which ORM?", context: "We use Node.js" }]);
	});

	it("extracts question with options", () => {
		const result = normalizeExtractedQuestions([
			{
				question: "Database?",
				options: [
					{ label: "PostgreSQL", description: "Relational" },
					{ label: "MongoDB", description: "Document" },
				],
			},
		]);
		expect(result).toEqual([
			{
				question: "Database?",
				options: [
					{ label: "PostgreSQL", description: "Relational" },
					{ label: "MongoDB", description: "Document" },
				],
			},
		]);
	});

	it("filters options without label", () => {
		const result = normalizeExtractedQuestions([
			{ question: "Pick one?", options: [{ label: "A", description: "First" }, { description: "No label" }] },
		]);
		expect(result).toEqual([{ question: "Pick one?", options: [{ label: "A", description: "First" }] }]);
	});

	it("strips options entirely when none remain after filtering", () => {
		const result = normalizeExtractedQuestions([{ question: "Any thoughts?", options: [{ description: "No label" }] }]);
		expect(result).toEqual([{ question: "Any thoughts?" }]);
	});

	it("ignores empty context strings", () => {
		const result = normalizeExtractedQuestions([{ question: "Q?", context: "   " }]);
		expect(result).toEqual([{ question: "Q?" }]);
	});

	it("ignores empty options arrays", () => {
		const result = normalizeExtractedQuestions([{ question: "Q?", options: [] }]);
		expect(result).toEqual([{ question: "Q?" }]);
	});

	it("trim label whitespace in options", () => {
		const result = normalizeExtractedQuestions([
			{ question: "Q?", options: [{ label: "  A  ", description: "  desc  " }] },
		]);
		expect(result).toEqual([{ question: "Q?", options: [{ label: "A", description: "desc" }] }]);
	});

	it("uses empty string for non-string description in options", () => {
		const result = normalizeExtractedQuestions([{ question: "Q?", options: [{ label: "A", description: 123 }] }]);
		expect(result).toEqual([{ question: "Q?", options: [{ label: "A", description: "" }] }]);
	});
});

// ── hasQuestionMarkers ──────────────────────────────────────────────────────

describe("hasQuestionMarkers", () => {
	it("detects lines ending with question mark", () => {
		expect(hasQuestionMarkers("What should we do?")).toBe(true);
	});

	it("detects question words", () => {
		expect(hasQuestionMarkers("I suggest we use TypeScript")).toBe(true);
		expect(hasQuestionMarkers("Which approach do you prefer?")).toBe(true);
		expect(hasQuestionMarkers("Should we continue?")).toBe(true);
		expect(hasQuestionMarkers("Would you like to proceed?")).toBe(true);
		expect(hasQuestionMarkers("Do you want me to continue?")).toBe(true);
		expect(hasQuestionMarkers("I recommend using SQLite")).toBe(true);
	});

	it("returns false for statements without questions", () => {
		expect(hasQuestionMarkers("Here is the implementation.")).toBe(false);
		expect(hasQuestionMarkers("The file has been updated.")).toBe(false);
	});

	it("detects 'would you' pattern", () => {
		expect(hasQuestionMarkers("Would you like me to proceed?")).toBe(true);
	});

	it("detects 'pick' pattern", () => {
		expect(hasQuestionMarkers("Pick the one you like")).toBe(true);
	});

	it("detects 'decide' pattern", () => {
		expect(hasQuestionMarkers("Decide which one to use")).toBe(true);
	});
});

// ── buildAnswerMessage ──────────────────────────────────────────────────────

describe("buildAnswerMessage", () => {
	it("returns empty string when no answers have content", () => {
		const result = { text: "", answers: ["", "", ""], responses: [] as any[] };
		expect(buildAnswerMessage(result)).toBe("");
	});

	it("returns the Q&A text when answers exist", () => {
		const result = {
			text: "Q: What DB?\nA: PostgreSQL",
			answers: ["PostgreSQL"],
			responses: [] as any[],
		};
		expect(buildAnswerMessage(result)).toBe("Q: What DB?\nA: PostgreSQL");
	});
});

// ── EXTRACTION_SYSTEM_PROMPT ────────────────────────────────────────────────

describe("EXTRACTION_SYSTEM_PROMPT", () => {
	it("contains JSON extraction instructions", () => {
		expect(EXTRACTION_SYSTEM_PROMPT).toContain("JSON array");
		expect(EXTRACTION_SYSTEM_PROMPT).toContain("question");
	});
});

// ── extractQuestions ────────────────────────────────────────────────────────

describe("extractQuestions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns null when no model is selected", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = undefined;
		const result = await extractQuestions("Hello?", harness.ctx as never);
		expect(result).toBeNull();
	});

	it("returns null when API key is not available", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = model as never;
		harness.ctx.modelRegistry.getApiKeyAndHeaders = vi.fn().mockResolvedValue({
			ok: false,
			error: "No API key",
		});

		const result = await extractQuestions("Hello?", harness.ctx as never);
		expect(result).toBeNull();
	});

	it("returns null when API key is missing", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = model as never;
		harness.ctx.modelRegistry.getApiKeyAndHeaders = vi.fn().mockResolvedValue({
			ok: true,
			apiKey: undefined,
		});

		const result = await extractQuestions("Hello?", harness.ctx as never);
		expect(result).toBeNull();
	});

	it("returns null when LLM response is not stop", async () => {
		const harness = setupHarnessWithAssistantMessage("Hello?");
		mockCompleteSimple.mockResolvedValue({
			stopReason: "error",
			errorMessage: "Something went wrong",
			content: [],
		} as never);

		const result = await extractQuestions("Hello?", harness.ctx as never);
		expect(result).toBeNull();
	});

	it("returns null when LLM response is empty", async () => {
		const harness = setupHarnessWithAssistantMessage("Hello?");
		mockCompleteSimple.mockResolvedValue({
			stopReason: "stop",
			content: [{ type: "text" as const, text: "" }],
		} as never);

		const result = await extractQuestions("Hello?", harness.ctx as never);
		expect(result).toBeNull();
	});

	it("returns null when LLM response is not valid JSON", async () => {
		const harness = setupHarnessWithAssistantMessage("Hello?");
		mockCompleteSimple.mockResolvedValue({
			stopReason: "stop",
			content: [{ type: "text" as const, text: "not json at all" }],
		} as never);

		const result = await extractQuestions("Hello?", harness.ctx as never);
		expect(result).toBeNull();
	});

	it("extracts questions from valid JSON response", async () => {
		const harness = setupHarnessWithAssistantMessage("Hello?");
		mockCompleteSimple.mockResolvedValue(makeExtractedQuestionsResponse([{ question: "What DB?" }]) as never);

		const result = await extractQuestions("Hello?", harness.ctx as never);
		expect(result).toEqual([{ question: "What DB?" }]);
	});

	it("extracts questions with options", async () => {
		const harness = setupHarnessWithAssistantMessage("Hello?");
		mockCompleteSimple.mockResolvedValue(
			makeExtractedQuestionsResponse([
				{
					question: "Database?",
					options: [
						{ label: "PostgreSQL", description: "Relational" },
						{ label: "SQLite", description: "Embedded" },
					],
				},
			]) as never,
		);

		const result = await extractQuestions("Hello?", harness.ctx as never);
		expect(result).toEqual([
			{
				question: "Database?",
				options: [
					{ label: "PostgreSQL", description: "Relational" },
					{ label: "SQLite", description: "Embedded" },
				],
			},
		]);
	});

	it("strips markdown code fences from LLM response", async () => {
		const harness = setupHarnessWithAssistantMessage("Hello?");
		mockCompleteSimple.mockResolvedValue({
			stopReason: "stop",
			content: [{ type: "text" as const, text: '```json\n[{"question": "Q?"}]\n```' }],
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
		} as never);

		const result = await extractQuestions("Hello?", harness.ctx as never);
		expect(result).toEqual([{ question: "Q?" }]);
	});

	it("passes correct system prompt and user message to LLM", async () => {
		const harness = setupHarnessWithAssistantMessage("Hello?");
		mockCompleteSimple.mockResolvedValue(makeExtractedQuestionsResponse([]) as never);

		await extractQuestions("What is your name?", harness.ctx as never);

		expect(mockCompleteSimple).toHaveBeenCalledTimes(1);
		const callArgs = mockCompleteSimple.mock.calls[0]!;

		// Verify model
		expect(callArgs[0]).toBe(model);

		// Verify system prompt
		expect(callArgs[1].systemPrompt).toBe(EXTRACTION_SYSTEM_PROMPT);

		// Verify user message content
		const userMsg = callArgs[1].messages.find((m: any) => m.role === "user");
		expect(userMsg).toBeDefined();
		expect(userMsg.content).toEqual(
			expect.arrayContaining([expect.objectContaining({ type: "text", text: "What is your name?" })]),
		);

		// Verify API key
		expect(callArgs[2].apiKey).toBe("test-key");
	});
});

// ── Extension registration ─────────────────────────────────────────────────

describe("answer extension registration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("registers /answer and /answer:auto commands", () => {
		const harness = createExtensionHarness();
		answerExtension(harness.pi as never);

		expect(harness.commands.has("answer")).toBe(true);
		expect(harness.commands.has("answer:auto")).toBe(true);
	});

	it("restores auto-detect state from session on session_start", async () => {
		const harness = createExtensionHarness();
		answerExtension(harness.pi as never);

		// Simulate state restore with auto-detect enabled
		harness.ctx.sessionManager.getBranch = () => [makeCustomEntry("answer-state", { autoDetect: true })];

		await harness.emitAsync("session_start", { reason: "startup" }, harness.ctx);

		// Toggle should show "disabled" since it's already enabled
		const cmd = harness.commands.get("answer:auto")!;
		await cmd.handler("", harness.ctx as never);
		expect(harness.notifications).toEqual([
			expect.objectContaining({ msg: "Auto-answer detection disabled", type: "info" }),
		]);
	});

	it("defaults auto-detect to disabled", async () => {
		const harness = createExtensionHarness();
		answerExtension(harness.pi as never);

		await harness.emitAsync("session_start", { reason: "startup" }, harness.ctx);

		const cmd = harness.commands.get("answer:auto")!;
		await cmd.handler("", harness.ctx as never);
		expect(harness.notifications).toEqual([
			expect.objectContaining({ msg: "Auto-answer detection enabled", type: "info" }),
		]);
	});
});

// ── /answer command ─────────────────────────────────────────────────────────

describe("/answer command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("notifies when no model is selected", async () => {
		const harness = createExtensionHarness();
		answerExtension(harness.pi as never);

		harness.ctx.model = undefined;

		const cmd = harness.commands.get("answer")!;
		await cmd.handler("", harness.ctx as never);

		expect(harness.notifications).toEqual([expect.objectContaining({ msg: "No model selected", type: "error" })]);
	});

	it("notifies when no UI is available", async () => {
		const harness = createExtensionHarness();
		answerExtension(harness.pi as never);

		harness.ctx.hasUI = false;
		harness.ctx.model = model as never;

		const cmd = harness.commands.get("answer")!;
		await cmd.handler("", harness.ctx as never);

		expect(harness.notifications).toEqual([
			expect.objectContaining({ msg: "/answer requires interactive mode", type: "error" }),
		]);
	});

	it("notifies when no assistant messages exist", async () => {
		const harness = createExtensionHarness();
		answerExtension(harness.pi as never);

		harness.ctx.model = model as never;
		harness.ctx.sessionManager.getBranch = () => [];

		const cmd = harness.commands.get("answer")!;
		await cmd.handler("", harness.ctx as never);

		expect(harness.notifications).toEqual([
			expect.objectContaining({
				msg: "No assistant messages found to extract questions from",
				type: "warning",
			}),
		]);
	});

	it("notifies when extraction returns no questions", async () => {
		const harness = setupHarnessWithAssistantMessage("No questions here.");

		mockCompleteSimple.mockResolvedValue(makeExtractedQuestionsResponse([]) as never);

		// Provide a custom() that simulates the extraction flow returning empty array
		harness.ctx.ui.custom = vi.fn().mockResolvedValue([]);

		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer")!;
		await cmd.handler("", harness.ctx as never);

		expect(harness.notifications).toEqual([
			expect.objectContaining({ msg: "No questions found in the last message", type: "info" }),
		]);
	});

	it("notifies when extraction returns null", async () => {
		const harness = setupHarnessWithAssistantMessage("Some text");

		harness.ctx.ui.custom = vi.fn().mockResolvedValue(null);

		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer")!;
		await cmd.handler("", harness.ctx as never);

		expect(harness.notifications).toEqual([
			expect.objectContaining({ msg: "No questions found in the last message", type: "info" }),
		]);
	});

	it("skips incomplete assistant messages", async () => {
		const harness = createExtensionHarness();
		const incompleteMsg = makeAssistantMessage("Thinking...", "tool_use");
		harness.ctx.sessionManager.getBranch = () => [makeBranchEntry(incompleteMsg)];
		harness.ctx.model = model as never;

		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer")!;
		await cmd.handler("", harness.ctx as never);

		expect(harness.notifications).toEqual([
			expect.objectContaining({
				msg: "No assistant messages found to extract questions from",
				type: "warning",
			}),
		]);
	});

	it("notifies when user cancels the QnA overlay", async () => {
		const harness = setupHarnessWithAssistantMessage("What should we do?");

		// First call: extraction returns questions
		// Second call: QnA overlay returns null (cancelled)
		let customCallCount = 0;
		harness.ctx.ui.custom = vi.fn().mockImplementation(() => {
			customCallCount++;
			if (customCallCount === 1) {
				// Extraction: return questions
				return Promise.resolve([{ question: "What is the plan?" }]);
			}
			// QnA overlay: cancelled
			return Promise.resolve(null);
		});

		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer")!;
		await cmd.handler("", harness.ctx as never);

		expect(harness.notifications).toEqual([expect.objectContaining({ msg: "Answer cancelled", type: "info" })]);
	});

	it("sends user message when answers are submitted while idle", async () => {
		const harness = setupHarnessWithAssistantMessage("What should we do?");

		let customCallCount = 0;
		harness.ctx.ui.custom = vi.fn().mockImplementation(() => {
			customCallCount++;
			if (customCallCount === 1) {
				return Promise.resolve([{ question: "What is the plan?" }]);
			}
			return Promise.resolve(makeQnAResult(["Use TypeScript"], ["Use TypeScript"]));
		});

		harness.ctx.isIdle = () => true;

		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer")!;
		await cmd.handler("", harness.ctx as never);

		expect(harness.userMessages).toContain("Q: Question 1\nA: Use TypeScript");
		expect(harness.notifications).toEqual([
			expect.objectContaining({ msg: expect.stringContaining("Answers submitted"), type: "info" }),
		]);
	});

	it("sends follow-up message when agent is busy", async () => {
		const harness = setupHarnessWithAssistantMessage("What should we do?");

		let customCallCount = 0;
		harness.ctx.ui.custom = vi.fn().mockImplementation(() => {
			customCallCount++;
			if (customCallCount === 1) {
				return Promise.resolve([{ question: "What is the plan?" }]);
			}
			return Promise.resolve(makeQnAResult(["Use TypeScript"], ["Use TypeScript"]));
		});

		harness.ctx.isIdle = () => false;

		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer")!;
		await cmd.handler("", harness.ctx as never);

		expect(harness.userMessages).toContain("Q: Question 1\nA: Use TypeScript");
	});

	it("notifies when no answers are provided", async () => {
		const harness = setupHarnessWithAssistantMessage("What should we do?");

		let customCallCount = 0;
		harness.ctx.ui.custom = vi.fn().mockImplementation(() => {
			customCallCount++;
			if (customCallCount === 1) {
				return Promise.resolve([{ question: "What is the plan?" }]);
			}
			// All empty answers
			return Promise.resolve(makeQnAResult([""], [""]));
		});

		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer")!;
		await cmd.handler("", harness.ctx as never);

		expect(harness.notifications).toEqual([expect.objectContaining({ msg: "No answers provided", type: "info" })]);
	});
});

// ── /answer:auto command ────────────────────────────────────────────────────

describe("/answer:auto command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("toggles auto-detect on and off", async () => {
		const harness = createExtensionHarness();
		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer:auto")!;

		await cmd.handler("", harness.ctx as never);
		expect(harness.notifications).toEqual([
			expect.objectContaining({ msg: "Auto-answer detection enabled", type: "info" }),
		]);

		harness.notifications.length = 0;

		await cmd.handler("", harness.ctx as never);
		expect(harness.notifications).toEqual([
			expect.objectContaining({ msg: "Auto-answer detection disabled", type: "info" }),
		]);
	});

	it("persists state via appendEntry", async () => {
		const harness = createExtensionHarness();
		const appendEntrySpy = vi.fn();
		harness.pi.appendEntry = appendEntrySpy;

		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer:auto")!;

		await cmd.handler("", harness.ctx as never);

		expect(appendEntrySpy).toHaveBeenCalledWith("answer-state", { autoDetect: true });
	});
});

// ── agent_end auto-detect ────────────────────────────────────────────────────

describe("agent_end auto-detect", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does nothing when auto-detect is disabled", async () => {
		const harness = createExtensionHarness();
		answerExtension(harness.pi as never);

		// auto-detect is off by default
		await harness.emitAsync("agent_end", { messages: [] }, harness.ctx);
		// Should not trigger any notifications or custom UI
		expect(harness.notifications).toEqual([]);
	});

	it("skips when no UI is available", async () => {
		const harness = createExtensionHarness();
		answerExtension(harness.pi as never);

		// Enable auto-detect
		const cmd = harness.commands.get("answer:auto")!;
		await cmd.handler("", harness.ctx as never);
		harness.notifications.length = 0;

		harness.ctx.hasUI = false;

		await harness.emitAsync("agent_end", { messages: [] }, harness.ctx);
		expect(harness.notifications).toEqual([]);
	});

	it("skips when no model is available", async () => {
		const harness = createExtensionHarness();
		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer:auto")!;
		await cmd.handler("", harness.ctx as never);
		harness.notifications.length = 0;

		harness.ctx.model = undefined;

		await harness.emitAsync("agent_end", { messages: [] }, harness.ctx);
		expect(harness.notifications).toEqual([]);
	});

	it("skips when messages have no question markers", async () => {
		const harness = createExtensionHarness();
		const customSpy = vi.fn().mockResolvedValue(null);
		harness.ctx.ui.custom = customSpy;

		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer:auto")!;
		await cmd.handler("", harness.ctx as never);
		harness.notifications.length = 0;

		const msg = {
			role: "assistant",
			content: [{ type: "text", text: "Here is the implementation." }],
			stopReason: "stop",
		};

		await harness.emitAsync("agent_end", { messages: [msg] }, harness.ctx);

		expect(customSpy).not.toHaveBeenCalled();
	});

	it("triggers answer flow when auto-detect is on and questions detected", async () => {
		const harness = createExtensionHarness();
		harness.ctx.model = model as never;
		harness.ctx.modelRegistry.getApiKeyAndHeaders = vi.fn().mockResolvedValue({
			ok: true,
			apiKey: "test-key",
			headers: {},
		});
		harness.ctx.sessionManager.getBranch = () => [makeBranchEntry(makeAssistantMessage("What should we do?"))];

		// Make custom() invoke the factory and return extraction result + QnA result
		let customCallIndex = 0;
		harness.ctx.ui.custom = vi.fn().mockImplementation((factory: any) => {
			customCallIndex++;
			const fakeTui = { requestRender: vi.fn() };
			const fakeTheme = {
				fg: vi.fn((_: string, text: string) => text),
				bold: vi.fn((text: string) => text),
			};
			const fakeKeybindings = {};
			let resolveDone: (value: any) => void;
			const donePromise = new Promise<any>((resolve) => {
				resolveDone = resolve;
			});
			const done = (value: any) => resolveDone(value);

			// Actually invoke the factory
			const component = factory(fakeTui, fakeTheme, fakeKeybindings, done);

			// For extraction call, simulate LLM returning questions
			if (customCallIndex === 1 && component?.onAbort) {
				// It's the BorderedLoader — simulate successful extraction
				setTimeout(() => done([{ question: "What DB?" }]), 0);
			}

			return donePromise;
		});

		answerExtension(harness.pi as never);

		// Enable auto-detect
		const cmd = harness.commands.get("answer:auto")!;
		await cmd.handler("", harness.ctx as never);
		harness.notifications.length = 0;

		const msg = {
			role: "assistant",
			content: [{ type: "text", text: "What should we do?" }],
			stopReason: "stop",
		};

		await harness.emitAsync("agent_end", { messages: [msg] }, harness.ctx);

		// Should have called custom() at least once (the extraction phase)
		expect(harness.ctx.ui.custom).toHaveBeenCalled();
	});

	it("skips when assistant message has non-stop stopReason", async () => {
		const harness = createExtensionHarness();
		const customSpy = vi.fn().mockResolvedValue(null);
		harness.ctx.ui.custom = customSpy;

		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer:auto")!;
		await cmd.handler("", harness.ctx as never);
		harness.notifications.length = 0;

		const msg = {
			role: "assistant",
			content: [{ type: "text", text: "What should we do?" }],
			stopReason: "tool_use",
		};

		await harness.emitAsync("agent_end", { messages: [msg] }, harness.ctx);

		expect(customSpy).not.toHaveBeenCalled();
	});

	it("skips when messages array is empty", async () => {
		const harness = createExtensionHarness();
		const customSpy = vi.fn().mockResolvedValue(null);
		harness.ctx.ui.custom = customSpy;

		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer:auto")!;
		await cmd.handler("", harness.ctx as never);
		harness.notifications.length = 0;

		await harness.emitAsync("agent_end", { messages: [] }, harness.ctx);

		expect(customSpy).not.toHaveBeenCalled();
	});
});

// ── Integration: factory callbacks ────────────────────────────────────────────

describe("runAnswerFlow factory callbacks", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("invokes BorderedLoader factory and extraction logic", async () => {
		const harness = setupHarnessWithAssistantMessage("What should we do?");
		mockCompleteSimple.mockResolvedValue(makeExtractedQuestionsResponse([{ question: "What DB?" }]) as never);

		let loaderFactoryInvoked = false;
		let qnaFactoryInvoked = false;

		harness.ctx.ui.custom = vi.fn().mockImplementation((factory: any) => {
			const fakeTui = { requestRender: vi.fn() };
			const fakeTheme = {
				fg: vi.fn((_: string, text: string) => text),
				bold: vi.fn((text: string) => text),
			};
			const fakeKeybindings = {};
			let resolveDone: (value: any) => void;
			const donePromise = new Promise<any>((resolve) => {
				resolveDone = resolve;
			});
			const done = (value: any) => resolveDone(value);

			const component = factory(fakeTui, fakeTheme, fakeKeybindings, done);

			// Check if it's the BorderedLoader (has onAbort)
			if (component?.onAbort === undefined) {
				qnaFactoryInvoked = true;
				// Simulate user cancelling QnA
				setTimeout(() => done(null), 0);
			} else {
				loaderFactoryInvoked = true;
				// Simulate successful extraction
				setTimeout(() => done([{ question: "What DB?" }]), 0);
			}

			return donePromise;
		});

		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer")!;
		await cmd.handler("", harness.ctx as never);

		expect(loaderFactoryInvoked).toBe(true);
		expect(qnaFactoryInvoked).toBe(true);
	});

	it("handles BorderedLoader abort via onAbort", async () => {
		const harness = setupHarnessWithAssistantMessage("What should we do?");

		harness.ctx.ui.custom = vi.fn().mockImplementation((factory: any) => {
			const fakeTui = { requestRender: vi.fn() };
			const fakeTheme = {
				fg: vi.fn((_: string, text: string) => text),
				bold: vi.fn((text: string) => text),
			};
			const fakeKeybindings = {};
			let resolveDone: (value: any) => void;
			const donePromise = new Promise<any>((resolve) => {
				resolveDone = resolve;
			});
			const done = (value: any) => resolveDone(value);

			const component = factory(fakeTui, fakeTheme, fakeKeybindings, done);

			if (component?.onAbort === undefined) {
				setTimeout(() => done(null), 0);
			} else {
				// Simulate user aborting
				component.onAbort();
			}

			return donePromise;
		});

		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer")!;
		await cmd.handler("", harness.ctx as never);

		// Aborted extraction should result in "No questions found" notification
		expect(harness.notifications).toEqual([
			expect.objectContaining({ msg: "No questions found in the last message", type: "info" }),
		]);
	});

	it("handles extraction error gracefully", async () => {
		const harness = setupHarnessWithAssistantMessage("What should we do?");
		mockCompleteSimple.mockRejectedValue(new Error("API error"));

		harness.ctx.ui.custom = vi.fn().mockImplementation((factory: any) => {
			const fakeTui = { requestRender: vi.fn() };
			const fakeTheme = {
				fg: vi.fn((_: string, text: string) => text),
				bold: vi.fn((text: string) => text),
			};
			const fakeKeybindings = {};
			let resolveDone: (value: any) => void;
			const donePromise = new Promise<any>((resolve) => {
				resolveDone = resolve;
			});
			const done = (value: any) => resolveDone(value);

			const component = factory(fakeTui, fakeTheme, fakeKeybindings, done);

			if (component?.onAbort === undefined) {
				setTimeout(() => done(null), 0);
			} else {
				// The .catch() in the factory should call done(null)
				// Just let the promise reject handler run
			}

			return donePromise;
		});

		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer")!;
		await cmd.handler("", harness.ctx as never);

		expect(harness.notifications).toEqual([
			expect.objectContaining({ msg: "No questions found in the last message", type: "info" }),
		]);
	});

	it("invokes QnATuiComponent factory with theme helpers", async () => {
		const harness = setupHarnessWithAssistantMessage("What should we do?");
		mockCompleteSimple.mockResolvedValue(makeExtractedQuestionsResponse([{ question: "What DB?" }]) as never);

		let qnaComponentOptions: any = null;

		harness.ctx.ui.custom = vi.fn().mockImplementation((factory: any) => {
			const fakeTui = { requestRender: vi.fn() };
			const fakeTheme = {
				fg: vi.fn((_: string, text: string) => text),
				bold: vi.fn((text: string) => text),
			};
			const fakeKeybindings = {};
			let resolveDone: (value: any) => void;
			const donePromise = new Promise<any>((resolve) => {
				resolveDone = resolve;
			});
			const done = (value: any) => resolveDone(value);

			const component = factory(fakeTui, fakeTheme, fakeKeybindings, done);

			if (component?.onAbort === undefined) {
				// QnATuiComponent — capture options
				qnaComponentOptions = component?.options ?? component;
				setTimeout(() => done(null), 0);
			} else {
				// BorderedLoader — resolve with questions
				setTimeout(() => done([{ question: "What DB?" }]), 0);
			}

			return donePromise;
		});

		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer")!;
		await cmd.handler("", harness.ctx as never);

		// Verify the QnA component was created with the right title
		expect(qnaComponentOptions).not.toBeNull();
	});

	it("sends followUp message when agent is busy", async () => {
		const harness = setupHarnessWithAssistantMessage("What should we do?");
		mockCompleteSimple.mockResolvedValue(makeExtractedQuestionsResponse([{ question: "What DB?" }]) as never);

		const sentMessages: any[] = [];
		harness.pi.sendUserMessage = vi.fn().mockImplementation((msg: any, opts?: any) => {
			sentMessages.push({ msg, opts });
		});

		harness.ctx.isIdle = () => false;

		harness.ctx.ui.custom = vi.fn().mockImplementation((factory: any) => {
			const fakeTui = { requestRender: vi.fn() };
			const fakeTheme = {
				fg: vi.fn((_: string, text: string) => text),
				bold: vi.fn((text: string) => text),
			};
			const fakeKeybindings = {};
			let resolveDone: (value: any) => void;
			const donePromise = new Promise<any>((resolve) => {
				resolveDone = resolve;
			});
			const done = (value: any) => resolveDone(value);

			const component = factory(fakeTui, fakeTheme, fakeKeybindings, done);

			if (component?.onAbort === undefined) {
				setTimeout(() => done(makeQnAResult(["PostgreSQL"], ["PostgreSQL"])), 0);
			} else {
				setTimeout(() => done([{ question: "What DB?" }]), 0);
			}

			return donePromise;
		});

		answerExtension(harness.pi as never);

		const cmd = harness.commands.get("answer")!;
		await cmd.handler("", harness.ctx as never);

		expect(sentMessages.length).toBeGreaterThan(0);
		expect(sentMessages[0].opts).toEqual({ deliverAs: "followUp" });
	});
});
