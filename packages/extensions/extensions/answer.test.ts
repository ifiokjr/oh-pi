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
import answerExtension, { buildAnswerMessage, hasQuestionMarkers, normalizeExtractedQuestions } from "./answer.js";

const mockCompleteSimple = vi.mocked(completeSimple);

const model = {
	provider: "anthropic",
	id: "claude-sonnet-4",
	api: "anthropic-messages",
};

function makeAssistantMessage(text: string, stopReason = "stop") {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
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
		expect(result).toEqual([
			{
				question: "Pick one?",
				options: [{ label: "A", description: "First" }],
			},
		]);
	});

	it("strips options entirely when none remain after filtering", () => {
		const result = normalizeExtractedQuestions([{ question: "Any thoughts?", options: [{ description: "No label" }] }]);
		expect(result).toEqual([{ question: "Any thoughts?" }]);
	});
});

describe("hasQuestionMarkers", () => {
	it("detects lines ending with question mark", () => {
		expect(hasQuestionMarkers("What should we do?")).toBe(true);
	});

	it("detects question words", () => {
		expect(hasQuestionMarkers("I suggest we use TypeScript")).toBe(true);
		expect(hasQuestionMarkers("Which approach do you prefer?")).toBe(true);
		expect(hasQuestionMarkers("Should we continue?")).toBe(true);
	});

	it("returns false for statements without questions", () => {
		expect(hasQuestionMarkers("Here is the implementation.")).toBe(false);
		expect(hasQuestionMarkers("The file has been updated.")).toBe(false);
	});

	it("detects 'would you' pattern", () => {
		expect(hasQuestionMarkers("Would you like me to proceed?")).toBe(true);
	});
});

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

	it("restores auto-detect state from session", async () => {
		const harness = createExtensionHarness();
		answerExtension(harness.pi as never);

		// Simulate session_start restoring state
		await harness.emitAsync("session_start", { reason: "startup" }, harness.ctx);

		// Default state: auto-detect is off
		const cmd = harness.commands.get("answer:auto")!;
		await cmd.handler("", harness.ctx as never);
		expect(harness.notifications).toEqual([
			expect.objectContaining({ msg: "Auto-answer detection enabled", type: "info" }),
		]);
	});
});

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

		mockCompleteSimple.mockResolvedValue({
			stopReason: "stop",
			content: [{ type: "text", text: "[]" }],
		} as never);

		// Provide a custom() that simulates the extraction flow returning nothing
		harness.ctx.ui.custom = vi.fn().mockResolvedValue([]);

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
});

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
});
