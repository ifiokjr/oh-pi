import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../pi-tui-loader.js", () => {
	class FakeEditor {
		disableSubmit?: boolean;
		onChange?: () => void;
		private text = "";

		setText(text: string) {
			this.text = text;
		}

		getText() {
			return this.text;
		}

		render(_width: number) {
			return ["┌", this.text || " ", "└"];
		}

		handleInput(data: string) {
			if (data === "<shift-enter>") {
				this.text += "\n";
			} else if (data === "<backspace>") {
				this.text = this.text.slice(0, -1);
			} else if (data.length === 1) {
				this.text += data;
			}
			this.onChange?.();
		}
	}

	return {
		requirePiTuiModule: () => ({
			Editor: FakeEditor,
			Key: {
				enter: "<enter>",
				tab: "<tab>",
				escape: "<escape>",
				up: "<up>",
				down: "<down>",
				ctrl: (key: string) => `<ctrl-${key}>`,
				shift: (key: string) => `<shift-${key}>`,
			},
			matchesKey: (input: string, key: string) => input === key,
			truncateToWidth: (text: string, width: number) => (text.length <= width ? text : text.slice(0, width)),
			visibleWidth: (text: string) => text.length,
			wrapTextWithAnsi: (text: string, width: number) => {
				if (width <= 0 || text.length <= width) {
					return [text];
				}
				const lines: string[] = [];
				for (let index = 0; index < text.length; index += width) {
					lines.push(text.slice(index, index + width));
				}
				return lines;
			},
		}),
	};
});

import {
	cloneResponses,
	deriveAnswersFromResponses,
	formatResponseAnswer,
	getQuestionOptions,
	hasResponseContent,
	normalizeResponseForQuestion,
	normalizeResponses,
	QnATuiComponent,
} from "../index.js";

afterEach(() => {
	vi.restoreAllMocks();
});

function createTui() {
	return {
		requestRender: vi.fn(),
	};
}

describe("qna helpers", () => {
	it("normalizes responses, clones state, and derives answers", () => {
		const questions = [
			{
				question: "Choose a runtime",
				options: [
					{ label: "Node", description: "Default" },
					{ label: "Bun", description: "Fast" },
				],
			},
			{ question: "Any rollout notes?" },
		] as const;

		const normalized = normalizeResponses(
			questions,
			[
				{ selectedOptionIndex: 99, selectionTouched: true, committed: true },
				{ customText: "Ship behind a flag", committed: true },
			],
			undefined,
			true,
		);

		expect(normalized[0]).toEqual({
			selectedOptionIndex: 2,
			customText: "",
			selectionTouched: true,
			committed: true,
		});
		expect(cloneResponses(normalized)).toEqual(normalized);
		expect(deriveAnswersFromResponses(questions, normalized)).toEqual(["", "Ship behind a flag"]);
		expect(getQuestionOptions({ question: "Freeform only" })).toEqual([]);
		expect(hasResponseContent(questions[1], normalized[1])).toBe(true);
	});

	it("formats option answers, custom answers, and inferred fallback selections", () => {
		const question = {
			question: "Choose a runtime",
			options: [
				{ label: "Node", description: "Default" },
				{ label: "Bun", description: "Fast" },
			],
		};
		expect(
			formatResponseAnswer(question, {
				selectedOptionIndex: 1,
				customText: "",
				selectionTouched: true,
				committed: true,
			}),
		).toBe("Bun");
		expect(normalizeResponseForQuestion(question, undefined, "Deno", true)).toMatchObject({
			selectedOptionIndex: 2,
			customText: "Deno",
			committed: true,
		});
		expect(normalizeResponseForQuestion({ question: "Notes" }, undefined, "Roll out slowly", true)).toMatchObject({
			selectedOptionIndex: 0,
			customText: "Roll out slowly",
			committed: true,
		});
	});
});

describe("QnATuiComponent", () => {
	it("renders the current question and reuses cached output for the same width", () => {
		const done = vi.fn();
		const component = new QnATuiComponent(
			[
				{
					header: "Deployment",
					question: "Choose a runtime",
					context: "Pick the default environment for production.",
					options: [
						{ label: "Node", description: "Use Node.js" },
						{ label: "Bun", description: "Use Bun" },
					],
				},
			],
			createTui(),
			done,
			{ title: "Setup" },
		);

		const firstRender = component.render(80);
		const secondRender = component.render(80);
		expect(secondRender).toBe(firstRender);
		const rendered = firstRender.join("\n");
		expect(rendered).toContain("Setup (1/1)");
		expect(rendered).toContain("Deployment");
		expect(rendered).toContain("Choose a runtime");
		expect(rendered).toContain("Pick the default environment");
		expect(rendered).toContain("Ctrl+C");
		expect(done).not.toHaveBeenCalled();
	});

	it("selects options, applies templates, reviews answers, and submits", () => {
		const tui = createTui();
		const done = vi.fn();
		const onResponsesChange = vi.fn();
		const component = new QnATuiComponent(
			[
				{
					question: "Choose a runtime",
					options: [
						{ label: "Node", description: "Use Node.js" },
						{ label: "Bun", description: "Use Bun" },
					],
				},
				{ question: "Any rollout notes?" },
			],
			tui,
			done,
			{
				templates: [
					{
						label: "Brief",
						template: "{{index}}/{{total}} {{question}} => {{answer}}",
					},
				],
				onResponsesChange,
				questionSummaryLabel: (_question, index) => `Prompt ${index + 1}`,
			},
		);

		component.handleInput("2");
		expect(onResponsesChange.mock.calls.at(-1)?.[0][0]).toMatchObject({
			selectedOptionIndex: 1,
			selectionTouched: true,
		});

		component.handleInput("<enter>");
		expect(onResponsesChange.mock.calls.at(-1)?.[0][0]).toMatchObject({
			committed: true,
		});

		component.handleInput("<ctrl-t>");
		component.handleInput("!");
		component.handleInput("<shift-enter>");
		component.handleInput("R");
		component.handleInput("<enter>");

		const confirmation = component.render(90).join("\n");
		expect(confirmation).toContain("Review before submit:");
		expect(confirmation).toContain("Prompt 1");
		expect(confirmation).toContain("Prompt 2");
		expect(confirmation).toContain("Submit all answers?");

		component.handleInput("<enter>");
		const result = done.mock.calls[0]?.[0];
		expect(result.answers).toEqual(["Bun", "2/2 Any rollout notes? => !\nR"]);
		expect(result.text).toContain("Q: Choose a runtime");
		expect(result.text).toContain("A: Bun");
		expect(result.text).toContain("Q: Any rollout notes?");
		expect(result.responses[1]).toMatchObject({
			committed: true,
			selectionTouched: true,
		});
		expect(tui.requestRender).toHaveBeenCalled();
	});

	it("switches to custom input for printable text and can navigate back from an empty other answer", () => {
		const onResponsesChange = vi.fn();
		const component = new QnATuiComponent(
			[
				{
					question: "Choose a runtime",
					options: [
						{ label: "Node", description: "Use Node.js" },
						{ label: "Bun", description: "Use Bun" },
					],
				},
			],
			createTui(),
			vi.fn(),
			{ onResponsesChange },
		);

		component.handleInput("x");
		expect(onResponsesChange.mock.calls.at(-1)?.[0][0]).toMatchObject({
			selectedOptionIndex: 2,
			customText: "x",
			selectionTouched: true,
		});

		component.handleInput("<backspace>");
		component.handleInput("<up>");
		expect(onResponsesChange.mock.calls.at(-1)?.[0][0]).toMatchObject({
			selectedOptionIndex: 1,
			customText: "",
			selectionTouched: true,
		});

		const rendered = component.render(80).join("\n");
		expect(rendered).toContain("A: Bun");
	});

	it("keeps long selected answers within narrow terminal width", () => {
		const component = new QnATuiComponent(
			[
				{
					question: "Choose release behavior",
					options: [
						{
							label: "Fail on any weird partial state",
							description: "Stop immediately.",
						},
						{
							label: "Allow already-published packages and continue",
							description: "Proceed if already-published packages are consistent.",
						},
					],
				},
			],
			createTui(),
			vi.fn(),
			{
				initialResponses: [
					{
						selectedOptionIndex: 1,
						selectionTouched: true,
						committed: true,
					},
				],
			},
		);

		const width = 51;
		for (const line of component.render(width)) {
			expect(line.length).toBeLessThanOrEqual(width);
		}
	});

	it("renders recommended options with bold '(recommended)' postfix", () => {
		const done = vi.fn();
		const component = new QnATuiComponent(
			[
				{
					question: "Which strategy?",
					options: [
						{ label: "Kani", description: "Formal verification" },
						{
							label: "Proptest",
							description: "Finds more bugs per hour",
							recommended: true,
						},
					],
				},
			],
			createTui(),
			done,
			{
				initialResponses: [
					{
						selectedOptionIndex: 0,
						selectionTouched: true,
						committed: false,
					},
				],
			},
		);

		const rendered = component.render(80).join("\n");
		expect(rendered).toContain("Proptest (recommended)");
		// The selected option (Kani) should be green/blue, not bold
		expect(rendered).toContain("Kani");
		expect(rendered).not.toContain("Kani (recommended)");
	});

	it("synthesizes single recommended option with implicit Other from UI", () => {
		const done = vi.fn();
		const component = new QnATuiComponent(
			[
				{
					question: "Which tool?",
					options: [
						{
							label: "Start with Kani",
							description: "Recommended approach",
							recommended: true,
						},
					],
				},
			],
			createTui(),
			done,
		);

		const rendered = component.render(80).join("\n");
		expect(rendered).toContain("Start with Kani (recommended)");
		expect(rendered).toContain("Other");
	});

	it("opens context popup with Ctrl+O and closes with Escape", () => {
		const done = vi.fn();
		const component = new QnATuiComponent(
			[
				{
					question: "Most expensive bug?",
					fullContext: "What is the most expensive bug?\n\na. Wrong version bump\nb. Missing package in release",
				},
			],
			createTui(),
			done,
		);

		// Normal render does not show full context
		const normalRender = component.render(80).join("\n");
		expect(normalRender).toContain("Most expensive bug?");
		expect(normalRender).not.toContain("Wrong version bump");

		// Ctrl+O opens popup
		component.handleInput("<ctrl-o>");
		const popupRender = component.render(80).join("\n");
		expect(popupRender).toContain("Question Details");
		expect(popupRender).toContain("Wrong version bump");

		// Escape closes popup
		component.handleInput("<escape>");
		const afterClose = component.render(80).join("\n");
		expect(afterClose).not.toContain("Question Details");
	});

	it("toggles context popup closed with Ctrl+O", () => {
		const done = vi.fn();
		const component = new QnATuiComponent(
			[
				{
					question: "Most expensive bug?",
					fullContext: "What is the most expensive bug?\\n\\na. Wrong version bump\\nb. Missing package",
				},
			],
			createTui(),
			done,
		);

		// Open with Ctrl+O
		component.handleInput("<ctrl-o>");
		expect(component.render(80).join("\n")).toContain("Question Details");

		// Close with Ctrl+O again
		component.handleInput("<ctrl-o>");
		expect(component.render(80).join("\n")).not.toContain("Question Details");
	});

	it("does nothing on Ctrl+O when fullContext is absent", () => {
		const done = vi.fn();
		const component = new QnATuiComponent([{ question: "Any notes?" }], createTui(), done);

		component.handleInput("<ctrl-o>");
		// Should not crash, just no-op
		const rendered = component.render(80).join("\n");
		expect(rendered).toContain("Any notes?");
	});

	it("supports escape from confirmation and ctrl+c cancellation", () => {
		const done = vi.fn();
		const component = new QnATuiComponent([{ question: "Any notes?" }], createTui(), done, {
			fallbackAnswers: ["Keep rollback ready"],
			inferCommittedFromContent: true,
		});

		component.handleInput("<enter>");
		expect(component.render(80).join("\n")).toContain("Review before submit:");

		component.handleInput("<escape>");
		expect(component.render(80).join("\n")).not.toContain("Review before submit:");

		component.handleInput("<ctrl-c>");
		expect(done).toHaveBeenCalledWith(null);
	});
});
