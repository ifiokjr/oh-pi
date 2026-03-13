import { describe, expect, it } from "vitest";
import {
	deriveAnswersFromResponses,
	formatResponseAnswer,
	getQuestionOptions,
	hasResponseContent,
	normalizeResponseForQuestion,
	normalizeResponses,
} from "../index.js";

describe("getQuestionOptions", () => {
	it("defaults missing options to an empty array", () => {
		expect(getQuestionOptions({ question: "Which runtime?" })).toEqual([]);
	});
});

describe("formatResponseAnswer", () => {
	it("returns the selected option label", () => {
		const answer = formatResponseAnswer(
			{
				question: "Which runtime?",
				options: [
					{ label: "Node", description: "Use Node.js" },
					{ label: "Bun", description: "Use Bun" },
				],
			},
			{ selectedOptionIndex: 1, customText: "", selectionTouched: true, committed: true },
		);
		expect(answer).toBe("Bun");
	});

	it("returns custom text for freeform questions", () => {
		const answer = formatResponseAnswer(
			{ question: "Any constraints?" },
			{ selectedOptionIndex: 0, customText: "Two-phase rollout", selectionTouched: true, committed: true },
		);
		expect(answer).toBe("Two-phase rollout");
	});
});

describe("normalizeResponseForQuestion", () => {
	it("infers the other option when fallback text does not match a listed option", () => {
		const normalized = normalizeResponseForQuestion(
			{
				question: "Which runtime?",
				options: [
					{ label: "Node", description: "Use Node.js" },
					{ label: "Bun", description: "Use Bun" },
				],
			},
			undefined,
			"Use Deno",
			true,
		);
		expect(normalized.selectedOptionIndex).toBe(2);
		expect(normalized.customText).toBe("Use Deno");
		expect(normalized.selectionTouched).toBe(true);
		expect(normalized.committed).toBe(true);
	});
	it("treats freeform fallback text as committed content", () => {
		const normalized = normalizeResponseForQuestion({ question: "Any constraints?" }, undefined, "Need Bun APIs", true);
		expect(normalized.selectedOptionIndex).toBe(0);
		expect(normalized.customText).toBe("Need Bun APIs");
		expect(normalized.selectionTouched).toBe(true);
		expect(normalized.committed).toBe(true);
	});
});

describe("normalizeResponses", () => {
	it("normalizes every question/response pair", () => {
		const responses = normalizeResponses(
			[
				{ question: "Which runtime?", options: [{ label: "Node", description: "Use Node.js" }] },
				{ question: "Any constraints?" },
			],
			[
				{ selectedOptionIndex: 0, committed: true },
				{ customText: "Keep SSR", committed: true },
			],
			undefined,
			true,
		);
		expect(responses).toHaveLength(2);
		expect(responses[0]?.selectedOptionIndex).toBe(0);
		expect(responses[1]?.customText).toBe("Keep SSR");
	});
});

describe("deriveAnswersFromResponses and hasResponseContent", () => {
	it("derives answers and detects whether content exists", () => {
		const questions = [
			{ question: "Which runtime?", options: [{ label: "Node", description: "Use Node.js" }] },
			{ question: "Any constraints?" },
		] as const;
		const responses = [
			{ selectedOptionIndex: 0, customText: "", selectionTouched: true, committed: true },
			{ selectedOptionIndex: 0, customText: "Keep SSR", selectionTouched: true, committed: true },
		];
		const answers = deriveAnswersFromResponses(questions, responses);
		expect(answers).toEqual(["Node", "Keep SSR"]);
		expect(hasResponseContent(questions[0], responses[0])).toBe(true);
		expect(hasResponseContent(questions[1], responses[1])).toBe(true);
	});
});
