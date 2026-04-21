/**
 * Answer Extension — interactive Q&A from LLM responses
 *
 * Adds `/answer` and `/answer:auto` commands that extract questions from the
 * last assistant message and present them in the shared QnA TUI component.
 *
 * Features:
 * - `/answer` extracts questions, then shows a QnA overlay for interactive answers
 * - `/answer:auto` toggles auto-detection: when enabled, questions in the final
 *   LLM response automatically trigger the QnA overlay
 * - Answers are injected back into the session as a follow-up user message
 * - Uses `@ifi/pi-shared-qna` for the QnA TUI component
 * - Uses `completeSimple` for LLM-powered question extraction
 */

import { type QnAQuestion, type QnAResult, type QnATemplate, QnATuiComponent } from "@ifi/pi-shared-qna";
import { completeSimple, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { BorderedLoader } from "@mariozechner/pi-coding-agent";

// ── Constants ──────────────────────────────────────────────────────────────

const ANSWER_ENTRY_TYPE = "answer-state";

const EXTRACTION_SYSTEM_PROMPT = [
	"You are a question extractor. Given text from a conversation, extract any questions that need answering.",
	"",
	"Output a JSON array of objects, each with a `question` field (required) and optional `context`, `options`, and `recommendation` fields.",
	"If a question has known options (e.g. yes/no, A/B/C, a numbered list of choices), include them as an `options` array where each option has `label`, `description`, and optional `recommended` fields.",
	'If an option is clearly recommended (e.g. "I recommend X", "I\'d suggest Y"), mark it with `recommended: true`.',
	'If there is a recommendation but no multiple options, create a single option array with the recommendation marked `recommended: true`. The user will see the one recommended option and an "Other" choice to describe what they actually want.',
	"If no questions are found, output an empty array: []",
	"",
	"Example output — simple options:",
	"```json",
	'[{"question": "What is your preferred database?", "options": [{"label": "PostgreSQL", "description": "Relational, mature"}, {"label": "MongoDB", "description": "Document store, flexible schema"}, {"label": "SQLite", "description": "Lightweight, embedded"}]},',
	' {"question": "Should we use TypeScript or JavaScript?", "options": [{"label": "TypeScript", "description": "Static typing, better DX", "recommended": true}, {"label": "JavaScript", "description": "Simpler, no build step"}]},',
	' {"question": "Any additional context or preferences?"}]',
	"```",
	"",
	"Example output — question with choices found in a detailed section:",
	"```json",
	'[{"question": "What is the most expensive bug this system could ship?", "context": "Rank the options below by impact.", "options": [{"label": "a. Wrong version bump", "description": "e.g. patch instead of major"}, {"label": "b. Missing package in release", "description": "e.g. dependency not propagated"}, {"label": "c. Breaking dependency graph", "description": "e.g. circular propagation"}, {"label": "d. Config parsing silently ignores invalid input"}, {"label": "e. Adapter produces wrong manifest edits", "description": "e.g. corrupts Cargo.toml"}]}]',
	"```",
	"",
	"Example output — single recommendation without explicit choices:",
	"```json",
	'[{"question": "Which testing strategy should we use first?", "context": "Based on the current codebase state.", "options": [{"label": "Proptest", "description": "Property-based testing finds more bugs per hour and integrates easily.", "recommended": true}]}]',
	"```",
	"",
	"Guidelines:",
	"- Find the MOST COMPLETE formulation of each question. If a question appears both as a detailed section (with choices, rankings, or examples) and as a short summary later (e.g. 'please answer the six questions above'), extract from the detailed section.",
	"- Keep `question` concise — one sentence with the core question. Put background context in the `context` field.",
	"- Always extract all explicit choices as `options`. For example, if a question lists options a-e, include every option in the `options` array.",
	"- Mark any clearly recommended option with `recommended: true`. Do not add a `recommended` field to non-recommended options.",
	"- When there is a recommendation without multiple options, create a single option array with the recommendation marked `recommended: true`. The user will see the one recommended option and an 'Other' choice to describe what they actually want.",
	"- Only extract genuine questions that need a response, not rhetorical questions",
	"- Include free-text questions without options when the answer is open-ended",
	"- Output only the JSON array, nothing else",
].join("\n");

const DEFAULT_TEMPLATES: QnATemplate[] = [
	{
		label: "Q&A pair",
		template: "Q: {{question}}\nA: {{answer}}",
	},
	{
		label: "Inline",
		template: "{{question}} → {{answer}}",
	},
];

// ── Types ──────────────────────────────────────────────────────────────────

interface ExtractedQuestion {
	question: string;
	context?: string;
	options?: Array<{ label: string; description: string; recommended?: boolean }>;
}

interface AnswerState {
	autoDetect: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isCustomEntry(
	entry: unknown,
	customType: string,
): entry is { type: "custom"; customType: string; data?: unknown } {
	return (
		!!entry &&
		typeof entry === "object" &&
		(entry as { type?: string }).type === "custom" &&
		(entry as { customType?: string }).customType === customType
	);
}

function loadState(ctx: ExtensionContext | ExtensionCommandContext): AnswerState {
	const branch = ctx.sessionManager.getBranch();
	for (let i = branch.length - 1; i >= 0; i--) {
		if (isCustomEntry(branch[i], ANSWER_ENTRY_TYPE) && branch[i].data) {
			return (branch[i].data as AnswerState) ?? { autoDetect: false };
		}
	}
	return { autoDetect: false };
}

function extractLastAssistantText(ctx: ExtensionCommandContext | ExtensionContext): string | null {
	const branch = ctx.sessionManager.getBranch();

	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (entry.type === "message") {
			const msg = entry.message;
			if ("role" in msg && msg.role === "assistant") {
				if (msg.stopReason !== "stop") {
					continue;
				}
				const textParts = msg.content
					.filter((c): c is { type: "text"; text: string } => c.type === "text")
					.map((c) => c.text);
				if (textParts.length > 0) {
					return textParts.join("\n");
				}
			}
		}
	}

	return null;
}

function normalizeExtractedQuestions(raw: unknown): ExtractedQuestion[] {
	if (!Array.isArray(raw)) {
		return [];
	}

	return raw
		.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
		.filter((item) => typeof item.question === "string" && item.question.trim().length > 0)
		.map((item) => {
			const question: ExtractedQuestion = {
				question: (item.question as string).trim(),
			};

			if (typeof item.context === "string" && item.context.trim().length > 0) {
				question.context = (item.context as string).trim();
			}

			if (Array.isArray(item.options) && item.options.length > 0) {
				const options = item.options
					.filter(
						(opt): opt is Record<string, unknown> =>
							typeof opt === "object" && opt !== null && typeof opt.label === "string",
					)
					.map((opt) => ({
						label: (opt.label as string).trim(),
						description: typeof opt.description === "string" ? opt.description.trim() : "",
						recommended: opt.recommended === true,
					}))
					.filter((opt) => opt.label.length > 0);

				if (options.length > 0) {
					question.options = options;
				}
			}

			// Synthesize a recommended option if the LLM provided a recommendation text without options
			if (!question.options && typeof item.recommendation === "string" && item.recommendation.trim().length > 0) {
				question.options = [
					{
						label: (item.recommendation as string).trim(),
						description: "",
						recommended: true,
					},
				];
			}

			return question;
		});
}

function toQnAQuestions(extracted: ExtractedQuestion[]): QnAQuestion[] {
	return extracted.map((q) => ({
		question: q.question,
		context: q.context,
		options: q.options,
	}));
}

/** Build a user message from the QnA result for injection into the session. */
function buildAnswerMessage(result: QnAResult): string {
	if (!result.answers.some((a) => a.trim().length > 0)) {
		return "";
	}

	return result.text;
}

// ── Question extraction ────────────────────────────────────────────────────

async function extractQuestions(
	text: string,
	ctx: ExtensionContext | ExtensionCommandContext,
): Promise<ExtractedQuestion[] | null> {
	if (!ctx.model) {
		return null;
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!(auth.ok && auth.apiKey)) {
		return null;
	}

	const userMessage: UserMessage = {
		role: "user",
		content: [{ type: "text", text }],
		timestamp: Date.now(),
	};

	const response = await completeSimple(
		ctx.model,
		{ systemPrompt: EXTRACTION_SYSTEM_PROMPT, messages: [userMessage] },
		{ apiKey: auth.apiKey, headers: auth.headers, reasoning: "low" },
	);

	if (response.stopReason !== "stop") {
		return null;
	}

	const responseText = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n")
		.trim();

	if (!responseText) {
		return null;
	}

	const JSON_FENCE_START_RE = /^```(?:json)?\s*\n?/i;
	const JSON_FENCE_END_RE = /\n?```\s*$/i;

	// Strip markdown code fences if present
	const jsonText = responseText.replace(JSON_FENCE_START_RE, "").replace(JSON_FENCE_END_RE, "").trim();

	try {
		const parsed = JSON.parse(jsonText);
		return normalizeExtractedQuestions(parsed);
	} catch {
		return null;
	}
}

// ── Auto-detect question presence ───────────────────────────────────────────

const QUESTION_PATTERNS = [
	/\?\s*$/m, // line ending with ?
	/\b(suggest|recommend|prefer|choose|pick|decide|should we|would you|do you want|which)\b/i,
];

function hasQuestionMarkers(text: string): boolean {
	return QUESTION_PATTERNS.some((pattern) => pattern.test(text));
}

// ── Core answer flow ───────────────────────────────────────────────────────

async function runAnswerFlow(
	ctx: ExtensionContext | ExtensionCommandContext,
	pi: ExtensionAPI,
	preextractedText?: string,
): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify("/answer requires interactive mode", "error");
		return;
	}

	if (!ctx.model) {
		ctx.ui.notify("No model selected", "error");
		return;
	}

	const lastText = preextractedText ?? extractLastAssistantText(ctx);
	if (!lastText) {
		ctx.ui.notify("No assistant messages found to extract questions from", "warning");
		return;
	}

	// Extract questions with a loader
	const questions = await ctx.ui.custom<ExtractedQuestion[] | null>((tui, theme, _kb, done) => {
		const loader = new BorderedLoader(tui, theme, `Extracting questions using ${ctx.model!.id}...`);
		loader.onAbort = () => done(null);

		extractQuestions(lastText, ctx)
			.then((result) => done(result))
			.catch(() => done(null));

		return loader;
	});

	if (!questions || questions.length === 0) {
		ctx.ui.notify("No questions found in the last message", "info");
		return;
	}

	// Show the QnA component
	const result = await ctx.ui.custom<QnAResult | null>((tui, theme, _kb, done) => {
		return new QnATuiComponent(toQnAQuestions(questions), tui, done, {
			title: "Answer",
			templates: DEFAULT_TEMPLATES,
			accentColor: (text) => theme.fg("accent", text),
			successColor: (text) => theme.fg("success", text),
			warningColor: (text) => theme.fg("warning", text),
			mutedColor: (text) => theme.fg("muted", text),
			dimColor: (text) => theme.fg("dim", text),
			boldText: (text) => theme.bold(text),
		});
	});

	if (!result) {
		ctx.ui.notify("Answer cancelled", "info");
		return;
	}

	const message = buildAnswerMessage(result);
	if (!message) {
		ctx.ui.notify("No answers provided", "info");
		return;
	}

	// Inject answers back into the session
	if (ctx.isIdle()) {
		pi.sendUserMessage(message);
	} else {
		pi.sendUserMessage(message, { deliverAs: "followUp" });
	}

	const answered = result.answers.filter((a) => a.trim().length > 0).length;
	ctx.ui.notify(`Answers submitted (${answered}/${questions.length})`, "info");
}

// ── Extension entry point ──────────────────────────────────────────────────

/** Run auto-detect answer flow with in-progress guard. Standalone for V8 coverage tracking. */
export async function runAutoDetectFlow(
	ctx: ExtensionContext | ExtensionCommandContext,
	pi: ExtensionAPI,
	preextractedText: string,
	inProgressRef: { value: boolean },
) {
	inProgressRef.value = true;
	try {
		await runAnswerFlow(ctx, pi, preextractedText);
	} finally {
		inProgressRef.value = false;
	}
}

export default function answerExtension(pi: ExtensionAPI) {
	let autoDetectEnabled = false;

	// Restore state from session
	pi.on("session_start", async (_event, ctx) => {
		const state = loadState(ctx);
		autoDetectEnabled = state.autoDetect;
	});

	// Auto-detect: after each agent turn, check if questions exist
	// We track whether the overlay is already showing to avoid stacking
	const inProgressRef = { value: false };

	/** Handle auto-detect after agent turn. Exported for direct test coverage. */
	function handleAutoDetect(
		event: { messages: Array<{ role: string; stopReason?: string; content: Array<{ type: string; text?: string }> }> },
		ctx: ExtensionContext | ExtensionCommandContext,
	) {
		if (!autoDetectEnabled || inProgressRef.value) {
			return;
		}

		if (!(ctx.hasUI && ctx.model)) {
			return;
		}

		// Find the last assistant text from this turn
		let lastAssistantText: string | undefined;
		for (let i = event.messages.length - 1; i >= 0; i--) {
			const msg = event.messages[i];
			if (msg.role === "assistant" && msg.stopReason === "stop") {
				const textParts = msg.content
					.filter((c): c is { type: "text"; text: string } => c.type === "text")
					.map((c) => c.text);
				if (textParts.length > 0) {
					lastAssistantText = textParts.join("\n");
					break;
				}
			}
		}

		if (!(lastAssistantText && hasQuestionMarkers(lastAssistantText))) {
			return;
		}

		runAutoDetectFlow(ctx, pi, lastAssistantText, inProgressRef).catch(() => {
			// patch-coverage-ignore
			// Error already handled inside runAnswerFlow
		});
	}

	pi.on("agent_end", handleAutoDetect);

	// ── /answer command ───────────────────────────────────────────────────

	pi.registerCommand("answer", {
		description: "Extract questions from the last response and answer them in a Q&A overlay",
		handler: async (_args, ctx) => {
			await runAnswerFlow(ctx, pi);
		},
	});

	// ── /answer:auto command ──────────────────────────────────────────────

	pi.registerCommand("answer:auto", {
		description: "Toggle auto-detection of questions in LLM responses",
		handler: async (_args, ctx) => {
			autoDetectEnabled = !autoDetectEnabled;

			pi.appendEntry(ANSWER_ENTRY_TYPE, { autoDetect: autoDetectEnabled });

			const status = autoDetectEnabled ? "enabled" : "disabled";
			ctx.ui.notify(`Auto-answer detection ${status}`, "info");
		},
	});
}

export {
	buildAnswerMessage,
	EXTRACTION_SYSTEM_PROMPT,
	extractQuestions,
	hasQuestionMarkers,
	normalizeExtractedQuestions,
	runAnswerFlow,
};
