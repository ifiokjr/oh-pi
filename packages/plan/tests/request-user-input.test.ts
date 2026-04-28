import type { QnAResponse } from "@ifi/pi-shared-qna";
import { describe, expect, test } from "vitest";
import {
	buildRequestUserInputResponse,
	buildRequestUserInputSummary,
	normalizeRequestUserInputQuestions,
	summarizeRequestUserInputAnswer,
} from "../request-user-input";

describe("normalizeRequestUserInputQuestions", () => {
	test("trims ids and defaults options", () => {
		const result = normalizeRequestUserInputQuestions([
			{ id: " runtime ", header: "Runtime", question: "Which runtime?" },
		]);

		if ("error" in result) {
			throw new Error(result.error);
		}

		expect(result.questions[0]).toEqual({
			id: "runtime",
			header: "Runtime",
			question: "Which runtime?",
			options: [],
		});
	});

	test("rejects duplicate ids", () => {
		const result = normalizeRequestUserInputQuestions([
			{ id: "runtime", header: "One", question: "Q1" },
			{ id: "runtime", header: "Two", question: "Q2" },
		]);

		expect("error" in result).toBe(true);
		if ("error" in result) {
			expect(result.error).toContain("Duplicate id: runtime");
		}
	});
});

describe("buildRequestUserInputResponse", () => {
	test("preserves option, other, and note semantics", () => {
		const normalized = normalizeRequestUserInputQuestions([
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [
					{ label: "Node", description: "Use Node.js" },
					{ label: "Bun", description: "Use Bun" },
				],
			},
			{
				id: "notes",
				header: "Notes",
				question: "Any constraints?",
			},
		]);
		if ("error" in normalized) {
			throw new Error(normalized.error);
		}

		const responses: QnAResponse[] = [
			{
				selectedOptionIndex: 2,
				customText: "Need Bun APIs",
				selectionTouched: true,
				committed: true,
			},
			{
				selectedOptionIndex: 0,
				customText: "Ship in two phases",
				selectionTouched: true,
				committed: true,
			},
		];

		const response = buildRequestUserInputResponse(normalized.questions, responses);
		expect(response.answers.runtime.answers).toEqual(["Other", "user_note: Need Bun APIs"]);
		expect(response.answers.notes.answers).toEqual(["user_note: Ship in two phases"]);
	});
});

describe("summary helpers", () => {
	test("formats missing answer marker", () => {
		expect(summarizeRequestUserInputAnswer({ answers: [] })).toBe("(no answer)");
	});

	test("builds readable summary lines", () => {
		const details = {
			questions: [
				{
					id: "runtime",
					header: "Runtime",
					question: "Which runtime?",
					options: [],
				},
			],
			response: {
				answers: {
					runtime: { answers: ["user_note: Bun for startup"] },
				},
			},
		};

		const summary = buildRequestUserInputSummary(details);
		expect(summary).toContain("1. Which runtime?");
		expect(summary).toContain("Bun for startup");
	});
});
