import type { QnAResponse } from "@ifi/pi-shared-qna";

import {
	buildRequestUserInputResponse,
	buildRequestUserInputSummary,
	normalizeRequestUserInputQuestions,
	summarizeRequestUserInputAnswer,
} from "../request-user-input";

describe(normalizeRequestUserInputQuestions, () => {
	it("trims ids and defaults options", () => {
		const result = normalizeRequestUserInputQuestions([
			{ header: "Runtime", id: " runtime ", question: "Which runtime?" },
		]);

		if ("error" in result) {
			throw new Error(result.error);
		}

		expect(result.questions[0]).toStrictEqual({
			header: "Runtime",
			id: "runtime",
			options: [],
			question: "Which runtime?",
		});
	});

	it("rejects duplicate ids", () => {
		const result = normalizeRequestUserInputQuestions([
			{ header: "One", id: "runtime", question: "Q1" },
			{ header: "Two", id: "runtime", question: "Q2" },
		]);

		expect("error" in result).toBeTruthy();
		if ("error" in result) {
			expect(result.error).toContain("Duplicate id: runtime");
		}
	});
});

describe(buildRequestUserInputResponse, () => {
	it("preserves option, other, and note semantics", () => {
		const normalized = normalizeRequestUserInputQuestions([
			{
				header: "Runtime",
				id: "runtime",
				options: [
					{ label: "Node", description: "Use Node.js" },
					{ label: "Bun", description: "Use Bun" },
				],
				question: "Which runtime?",
			},
			{
				header: "Notes",
				id: "notes",
				question: "Any constraints?",
			},
		]);
		if ("error" in normalized) {
			throw new Error(normalized.error);
		}

		const responses: QnAResponse[] = [
			{
				committed: true,
				customText: "Need Bun APIs",
				selectedOptionIndex: 2,
				selectionTouched: true,
			},
			{
				committed: true,
				customText: "Ship in two phases",
				selectedOptionIndex: 0,
				selectionTouched: true,
			},
		];

		const response = buildRequestUserInputResponse(normalized.questions, responses);
		expect(response.answers.runtime.answers).toStrictEqual(["Other", "user_note: Need Bun APIs"]);
		expect(response.answers.notes.answers).toStrictEqual(["user_note: Ship in two phases"]);
	});
});

describe("summary helpers", () => {
	it("formats missing answer marker", () => {
		expect(summarizeRequestUserInputAnswer({ answers: [] })).toBe("(no answer)");
	});

	it("builds readable summary lines", () => {
		const details = {
			questions: [{ header: "Runtime", id: "runtime", options: [], question: "Which runtime?" }],
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
