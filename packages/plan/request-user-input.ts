import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { QnATuiComponent, type QnAResponse, type QnAResult } from "@ifi/pi-shared-qna";
import type {
	NormalizedRequestUserInputQuestion,
	PlanModeState,
	RequestUserInputAnswer,
	RequestUserInputDetails,
	RequestUserInputQuestion,
	RequestUserInputResponse,
} from "./types";
import { findDuplicateId } from "./utils";

const require = createRequire(import.meta.url);

function requirePiTui() {
	try {
		return require("@mariozechner/pi-tui");
	} catch (error) {
		const code = (error as { code?: string }).code;
		if (code !== "MODULE_NOT_FOUND") {
			throw error;
		}
		return require(path.join(os.homedir(), ".bun", "install", "global", "node_modules", "@mariozechner", "pi-tui"));
	}
}

function createText(text: string) {
	const { Text } = requirePiTui() as {
		Text: new (text: string, x: number, y: number) => unknown;
	};
	return new Text(text, 0, 0);
}

export function normalizeRequestUserInputQuestions(
	rawQuestions: RequestUserInputQuestion[],
): { questions: NormalizedRequestUserInputQuestion[] } | { error: string } {
	const questions: NormalizedRequestUserInputQuestion[] = rawQuestions.map((question) => ({
		...question,
		id: question.id.trim(),
		options: question.options ?? [],
	}));

	for (const question of questions) {
		if (!question.id) {
			return { error: "request_user_input question ids must be non-empty." };
		}
	}

	const duplicateQuestionId = findDuplicateId(questions.map((question) => question.id));
	if (duplicateQuestionId) {
		return {
			error: `request_user_input question ids must be unique. Duplicate id: ${duplicateQuestionId}`,
		};
	}

	return { questions };
}

export function buildRequestUserInputAnswer(
	question: NormalizedRequestUserInputQuestion,
	response: QnAResponse,
): RequestUserInputAnswer {
	const hasOptions = question.options.length > 0;
	const otherIndex = question.options.length;
	const trimmed = response.customText.trim();

	if (!hasOptions) {
		if (trimmed.length === 0) {
			return { answers: [] };
		}
		return { answers: [`user_note: ${trimmed}`] };
	}

	if (response.selectedOptionIndex === otherIndex) {
		if (trimmed.length === 0) {
			return { answers: [] };
		}
		return { answers: ["Other", `user_note: ${trimmed}`] };
	}

	const label = question.options[response.selectedOptionIndex]?.label;
	if (!label) {
		return { answers: [] };
	}
	return { answers: [label] };
}

export function buildRequestUserInputResponse(
	questions: NormalizedRequestUserInputQuestion[],
	responses: QnAResponse[],
): RequestUserInputResponse {
	const answers: Record<string, RequestUserInputAnswer> = {};
	for (let i = 0; i < questions.length; i++) {
		answers[questions[i].id] = buildRequestUserInputAnswer(questions[i], responses[i]);
	}
	return { answers };
}

export function summarizeRequestUserInputAnswer(answer: RequestUserInputAnswer | undefined): string {
	const entries = answer?.answers ?? [];
	if (entries.length === 0) {
		return "(no answer)";
	}

	const notes = entries
		.filter((entry) => entry.startsWith("user_note: "))
		.map((entry) => entry.slice("user_note: ".length).trim())
		.filter((entry) => entry.length > 0);
	const selected = entries
		.filter((entry) => !entry.startsWith("user_note: "))
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);

	if (selected.length === 0 && notes.length > 0) {
		return notes.join(" · ");
	}

	if (selected.length > 0 && notes.length > 0) {
		return `${selected.join(", ")} (${notes.join(" · ")})`;
	}

	return selected.join(", ") || "(no answer)";
}

export function buildRequestUserInputSummary(details: RequestUserInputDetails): string {
	const lines: string[] = [];
	for (let i = 0; i < details.questions.length; i++) {
		const question = details.questions[i];
		const answer = details.response.answers[question.id];
		lines.push(`${i + 1}. ${question.question}`);
		lines.push(`   Answer: ${summarizeRequestUserInputAnswer(answer)}`);
	}
	return lines.join("\n");
}

async function collectRequestUserInputAnswers(
	ctx: ExtensionContext,
	questions: NormalizedRequestUserInputQuestion[],
): Promise<RequestUserInputResponse | null> {
	const result = await ctx.ui.custom<QnAResult | null>((tui, theme, _kb, done) => {
		return new QnATuiComponent(questions, tui, done, {
			title: "Questions",
			questionSummaryLabel: (question) => question.header?.trim() || question.question,
			accentColor: (text) => theme.fg("accent", text),
			successColor: (text) => theme.fg("success", text),
			warningColor: (text) => theme.fg("warning", text),
			mutedColor: (text) => theme.fg("muted", text),
			dimColor: (text) => theme.fg("dim", text),
			boldText: (text) => theme.bold(text),
		});
	});

	if (!result) {
		return null;
	}

	return buildRequestUserInputResponse(questions, result.responses);
}

export function registerRequestUserInputTool(
	pi: ExtensionAPI,
	dependencies: {
		getState: () => PlanModeState;
		requestUserInputSchema: unknown;
	},
) {
	pi.registerTool({
		name: "request_user_input",
		label: "request_user_input",
		description:
			"Request user input for one to three short questions and wait for the response. This tool is only available in Plan mode.",
		parameters: dependencies.requestUserInputSchema,
		renderCall(args, theme) {
			const questions = ((args.questions as RequestUserInputQuestion[] | undefined) ?? []).length;
			const label = `${questions} question${questions === 1 ? "" : "s"}`;
			return createText(
				`${theme.fg("toolTitle", theme.bold("request_user_input "))}${theme.fg("muted", label)}`,
			);
		},
		renderResult(result, { isPartial }, theme) {
			if (isPartial) {
				return createText(theme.fg("muted", "Waiting for user input..."));
			}

			const details = result.details as RequestUserInputDetails | undefined;
			if (!details) {
				const text = result.content.find((item) => item.type === "text");
				return createText(text?.type === "text" ? text.text : "(no output)");
			}

			const lines: string[] = [];
			for (let i = 0; i < details.questions.length; i++) {
				const question = details.questions[i];
				const answer = summarizeRequestUserInputAnswer(details.response.answers[question.id]);
				lines.push(`${theme.fg("accent", `${i + 1}.`)} ${question.question}`);
				if (answer === "(no answer)") {
					lines.push(`   ${theme.fg("muted", "Answer:")} ${theme.fg("warning", answer)}`);
				} else {
					lines.push(`   ${theme.fg("muted", "Answer:")} ${answer}`);
				}
			}

			return createText(lines.join("\n"));
		},
		async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<AgentToolResult<RequestUserInputDetails>> {
			if (!dependencies.getState().active) {
				return {
					isError: true,
					content: [{ type: "text", text: "request_user_input is unavailable when plan mode is inactive" }],
				};
			}

			if (!ctx.hasUI) {
				return {
					isError: true,
					content: [{ type: "text", text: "request_user_input requires interactive mode" }],
				};
			}

			const normalized = normalizeRequestUserInputQuestions(params.questions as RequestUserInputQuestion[]);
			if ("error" in normalized) {
				return {
					isError: true,
					content: [{ type: "text", text: normalized.error }],
				};
			}

			const response = await collectRequestUserInputAnswers(ctx, normalized.questions);
			if (!response) {
				return {
					isError: true,
					content: [{ type: "text", text: "request_user_input was cancelled before receiving a response" }],
				};
			}

			const details: RequestUserInputDetails = { questions: normalized.questions, response };
			return {
				content: [{ type: "text", text: buildRequestUserInputSummary(details) }],
				details,
			};
		},
	});
}
