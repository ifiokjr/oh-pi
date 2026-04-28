/**
 * Oh-pi BTW / QQ Extension — parallel side conversations
 *
 * Adds /btw and /qq commands that open a side conversation without interrupting
 * the main agent run. Answers stream into a widget above the editor.
 *
 * Features:
 * - Runs immediately, even while the main agent is busy
 * - Maintains a continuous BTW thread across exchanges
 * - Keeps BTW entries out of the main agent's LLM context
 * - Can inject the full thread or a summary back into the main agent
 * - Optionally saves individual exchanges as visible session notes with --save
 *
 * Based on https://github.com/dbachelder/pi-btw by Dan Bachelder (MIT).
 */

import { completeSimple, streamSimple } from "@mariozechner/pi-ai";
import type { AssistantMessage, Message, ThinkingLevel as AiThinkingLevel } from "@mariozechner/pi-ai";
import { buildSessionContext } from "@mariozechner/pi-coding-agent";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

const BTW_MESSAGE_TYPE = "btw-note";
const BTW_ENTRY_TYPE = "btw-thread-entry";
const BTW_RESET_TYPE = "btw-thread-reset";

const BTW_SYSTEM_PROMPT = [
	"You are having an aside conversation with the user, separate from their main working session.",
	"The main session messages are provided for context only — that work is being handled by another agent.",
	"Focus on answering the user's side questions, helping them think through ideas, or planning next steps.",
	"Do not act as if you need to continue unfinished work from the main session unless the user explicitly asks you to prepare something for injection back to it.",
].join(" ");
const STARTUP_THREAD_RESTORE_DELAY_MS = 250;

type SessionThinkingLevel = "off" | AiThinkingLevel;

interface BtwDetails {
	question: string;
	thinking: string;
	answer: string;
	provider: string;
	model: string;
	thinkingLevel: SessionThinkingLevel;
	timestamp: number;
	usage?: AssistantMessage["usage"];
}

interface ParsedBtwArgs {
	question: string;
	save: boolean;
}

type SaveState = "not-saved" | "saved" | "queued";

interface BtwSlot {
	question: string;
	modelLabel: string;
	thinking: string;
	answer: string;
	done: boolean;
	controller: AbortController;
}

interface WidgetThemeHelpers {
	dim: (text: string) => string;
	success: (text: string) => string;
	italic: (text: string) => string;
	warning: (text: string) => string;
}

function isVisibleBtwMessage(message: { role: string; customType?: string }): boolean {
	return message.role === "custom" && message.customType === BTW_MESSAGE_TYPE;
}

function isCustomEntry(
	entry: unknown,
	customType: string,
): entry is { type: "custom"; customType: string; data?: unknown } {
	return (
		Boolean(entry) &&
		typeof entry === "object" &&
		(entry as { type?: string }).type === "custom" &&
		(entry as { customType?: string }).customType === customType
	);
}

function toReasoning(level: SessionThinkingLevel): AiThinkingLevel | undefined {
	return level === "off" ? undefined : level;
}

interface CompatibleModelRegistry {
	getApiKey?: (model: NonNullable<ExtensionContext["model"]>) => Promise<string | undefined> | string | undefined;
	getApiKeyForProvider?: (provider: string) => Promise<string | undefined> | string | undefined;
	authStorage?: {
		getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	};
}

export async function resolveBtwApiKey(
	model: NonNullable<ExtensionContext["model"]>,
	modelRegistry: ExtensionContext["modelRegistry"] | CompatibleModelRegistry | undefined,
): Promise<string | undefined> {
	const registry = modelRegistry as CompatibleModelRegistry | undefined;

	if (typeof registry?.getApiKey === "function") {
		return await registry.getApiKey(model);
	}

	if (typeof registry?.getApiKeyForProvider === "function") {
		return await registry.getApiKeyForProvider(model.provider);
	}

	if (typeof registry?.authStorage?.getApiKey === "function") {
		return await registry.authStorage.getApiKey(model.provider);
	}

	try {
		const piModule = (await import("@mariozechner/pi-coding-agent")) as Record<string, unknown>;
		const authStorageModule = Reflect.get(piModule, "AuthStorage") as
			| {
					create?: () => unknown;
			  }
			| undefined;
		const modelRegistryModule = Reflect.get(piModule, "ModelRegistry") as
			| (new (authStorage: unknown) => CompatibleModelRegistry)
			| undefined;

		if (typeof authStorageModule?.create === "function" && modelRegistryModule) {
			const fallbackRegistry = new modelRegistryModule(authStorageModule.create());
			if (typeof fallbackRegistry.getApiKey === "function") {
				return await fallbackRegistry.getApiKey(model);
			}
		}
	} catch {
		// Ignore and fall back to environment-based resolution below.
	}

	try {
		const aiModule = (await import("@mariozechner/pi-ai")) as {
			getEnvApiKey?: (provider: string) => string | undefined;
		};
		return aiModule.getEnvApiKey?.(model.provider);
	} catch {
		return undefined;
	}
}

function extractText(parts: AssistantMessage["content"], type: "text" | "thinking"): string {
	const chunks: string[] = [];
	for (const part of parts) {
		if (type === "text" && part.type === "text") {
			chunks.push(part.text);
		} else if (type === "thinking" && part.type === "thinking") {
			chunks.push(part.thinking);
		}
	}
	return chunks.join("\n").trim();
}

function extractAnswer(message: AssistantMessage): string {
	return extractText(message.content, "text") || "(No text response)";
}

function extractThinking(message: AssistantMessage): string {
	return extractText(message.content, "thinking");
}

function parseBtwArgs(args: string): ParsedBtwArgs {
	const save = /(?:^|\s)(?:--save|-s)(?=\s|$)/.test(args);
	const question = args.replaceAll(/(?:^|\s)(?:--save|-s)(?=\s|$)/g, " ").trim();
	return { question, save };
}

function buildMainMessages(ctx: ExtensionCommandContext): Message[] {
	const sessionContext = buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId());
	return sessionContext.messages.filter((message) => !isVisibleBtwMessage(message));
}

/** Build the thread history portion of the BTW context messages. */
function buildThreadMessages(ctx: ExtensionCommandContext, thread: BtwDetails[]): Message[] {
	const messages: Message[] = [
		{
			content: [
				{
					type: "text",
					text: "[The following is a separate side conversation. Continue this thread.]",
				},
			],
			role: "user",
			timestamp: Date.now(),
		},
		{
			api: ctx.model?.api ?? "openai-responses",
			content: [
				{
					type: "text",
					text: "Understood, continuing our side conversation.",
				},
			],
			model: ctx.model?.id ?? "unknown",
			provider: ctx.model?.provider ?? "unknown",
			role: "assistant",
			stopReason: "stop",
			timestamp: Date.now(),
			usage: {
				cacheRead: 0,
				cacheWrite: 0,
				cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
				input: 0,
				output: 0,
				totalTokens: 0,
			},
		},
	];

	for (const entry of thread) {
		messages.push(
			{
				content: [{ type: "text", text: entry.question }],
				role: "user",
				timestamp: entry.timestamp,
			},
			{
				api: ctx.model?.api ?? "openai-responses",
				content: [{ type: "text", text: entry.answer }],
				model: entry.model,
				provider: entry.provider,
				role: "assistant",
				stopReason: "stop",
				timestamp: entry.timestamp,
				usage: entry.usage ?? {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
			},
		);
	}

	return messages;
}

function buildBtwContext(ctx: ExtensionCommandContext, question: string, thread: BtwDetails[]) {
	const messages: Message[] = [...buildMainMessages(ctx)];

	if (thread.length > 0) {
		messages.push(...buildThreadMessages(ctx, thread));
	}

	messages.push({
		content: [{ type: "text", text: question }],
		role: "user",
		timestamp: Date.now(),
	});

	return {
		messages,
		systemPrompt: [ctx.getSystemPrompt(), BTW_SYSTEM_PROMPT].filter(Boolean).join("\n\n"),
	};
}

function buildBtwMessageContent(question: string, answer: string): string {
	return `Q: ${question}\n\nA: ${answer}`;
}

function formatThread(thread: BtwDetails[]): string {
	return thread.map((entry) => `User: ${entry.question.trim()}\nAssistant: ${entry.answer.trim()}`).join("\n\n---\n\n");
}

function saveVisibleBtwNote(
	pi: ExtensionAPI,
	details: BtwDetails,
	saveRequested: boolean,
	wasBusy: boolean,
): SaveState {
	if (!saveRequested) {
		return "not-saved";
	}

	const message = {
		content: buildBtwMessageContent(details.question, details.answer),
		customType: BTW_MESSAGE_TYPE,
		details,
		display: true,
	};

	if (wasBusy) {
		pi.sendMessage(message, { deliverAs: "followUp" });
		return "queued";
	}

	pi.sendMessage(message);
	return "saved";
}

function notify(ctx: ExtensionContext | ExtensionCommandContext, message: string, level: "info" | "warning" | "error") {
	if (ctx.hasUI) {
		ctx.ui.notify(message, level);
	}
}

/** Render a single slot's lines into the widget parts array. */
function renderSlotLines(slot: BtwSlot, parts: string[], helpers: WidgetThemeHelpers) {
	const { dim, success, italic, warning } = helpers;

	parts.push(`${dim("│ ")}${success("› ")}${slot.question}`);

	if (slot.thinking) {
		const cursor = slot.answer || slot.done ? "" : warning(" ▍");
		parts.push(`${dim("│ ")}${italic(slot.thinking)}${cursor}`);
	}

	if (slot.answer) {
		const answerLines = slot.answer.split("\n");
		parts.push(`${dim("│ ")}${answerLines[0]}`);
		if (answerLines.length > 1) {
			parts.push(answerLines.slice(1).join("\n"));
		}
		if (!slot.done) {
			parts[parts.length - 1] += warning(" ▍");
		}
	} else if (!slot.done) {
		parts.push(`${dim("│ ")}${warning("thinking...")}`);
	}

	parts.push(`${dim("│ ")}${dim(`model: ${slot.modelLabel}`)}`);
}

/** Remove a slot and re-render after abort. */
function removeSlotAndRender(
	slot: BtwSlot,
	allSlots: BtwSlot[],
	ctx: ExtensionContext | ExtensionCommandContext,
	render: (ctx: ExtensionContext | ExtensionCommandContext) => void,
) {
	const idx = allSlots.indexOf(slot);
	if (idx !== -1) {
		allSlots.splice(idx, 1);
		render(ctx);
	}
}

/** Process the stream response after streaming completes. */
function processStreamResponse(response: AssistantMessage, slot: BtwSlot): { answer: string; thinking: string } {
	if (!response) {
		throw new Error("BTW request finished without a response.");
	}
	if (response.stopReason === "error") {
		throw new Error(response.errorMessage || "BTW request failed.");
	}

	return {
		answer: extractAnswer(response),
		thinking: extractThinking(response) || slot.thinking,
	};
}

export default function (pi: ExtensionAPI) {
	let pendingThread: BtwDetails[] = [];
	let slots: BtwSlot[] = [];
	let widgetStatus: string | null = null;

	function abortActiveSlots() {
		for (const slot of slots) {
			if (!slot.done) {
				slot.controller.abort();
			}
		}
	}

	function renderWidget(ctx: ExtensionContext | ExtensionCommandContext) {
		if (!ctx.hasUI) {
			return;
		}

		if (slots.length === 0) {
			ctx.ui.setWidget("btw", undefined);
			return;
		}

		ctx.ui.setWidget(
			"btw",
			(_tui, theme) => {
				const helpers: WidgetThemeHelpers = {
					dim: (text: string) => theme.fg("dim", text),
					italic: (text: string) => theme.fg("dim", theme.italic(text)),
					success: (text: string) => theme.fg("success", text),
					warning: (text: string) => theme.fg("warning", text),
				};

				const parts: string[] = [];
				const title = " 💭 btw ";
				const hint = " /btw:clear dismiss · /btw:inject send ";
				const lineWidth = Math.max(22, 68 - title.length - hint.length);

				parts.push(helpers.dim(`╭${title}${"─".repeat(lineWidth)}${hint}╮`));

				for (let i = 0; i < slots.length; i++) {
					if (i > 0) {
						parts.push(helpers.dim("│ ───"));
					}
					renderSlotLines(slots[i], parts, helpers);
				}

				if (widgetStatus) {
					parts.push(`${helpers.dim("│ ")}${helpers.warning(widgetStatus)}`);
				}

				parts.push(helpers.dim(`╰${"─".repeat(68)}╯`));

				return new Text(parts.join("\n"), 0, 0);
			},
			{ placement: "aboveEditor" },
		);
	}

	function resetThread(ctx: ExtensionContext | ExtensionCommandContext, persist = true) {
		abortActiveSlots();
		pendingThread = [];
		slots = [];
		widgetStatus = null;

		if (persist) {
			pi.appendEntry(BTW_RESET_TYPE, { timestamp: Date.now() });
		}

		renderWidget(ctx);
	}

	function restoreThread(ctx: ExtensionContext) {
		abortActiveSlots();
		pendingThread = [];
		slots = [];
		widgetStatus = null;

		const branch = ctx.sessionManager.getBranch();
		let lastResetIndex = -1;

		for (let i = 0; i < branch.length; i++) {
			if (isCustomEntry(branch[i], BTW_RESET_TYPE)) {
				lastResetIndex = i;
			}
		}

		for (let i = lastResetIndex + 1; i < branch.length; i++) {
			const entry = branch[i];
			if (isCustomEntry(entry, BTW_ENTRY_TYPE) && entry.data) {
				const details = entry.data as BtwDetails;
				pendingThread.push(details);
				slots.push({
					answer: details.answer,
					controller: new AbortController(),
					done: true,
					modelLabel: `${details.provider}/${details.model}`,
					question: details.question,
					thinking: details.thinking,
				});
			}
		}

		renderWidget(ctx);
	}

	/** Stream the BTW request and update the slot with incoming tokens. */
	async function streamBtwRequest(
		ctx: ExtensionCommandContext,
		slot: BtwSlot,
		threadSnapshot: BtwDetails[],
		question: string,
	): Promise<AssistantMessage | "aborted"> {
		const model = ctx.model!;
		const apiKey = await resolveBtwApiKey(model, ctx.modelRegistry);
		if (!apiKey) {
			throw new Error(`No credentials available for ${model.provider}/${model.id}.`);
		}
		const thinkingLevel = pi.getThinkingLevel() as SessionThinkingLevel;

		const stream = streamSimple(model, buildBtwContext(ctx, question, threadSnapshot), {
			apiKey,
			reasoning: toReasoning(thinkingLevel),
			signal: slot.controller.signal,
		});

		let response: AssistantMessage | null = null;

		for await (const event of stream) {
			if (event.type === "thinking_delta") {
				slot.thinking += event.delta;
				renderWidget(ctx);
			} else if (event.type === "text_delta") {
				slot.answer += event.delta;
				renderWidget(ctx);
			} else if (event.type === "done") {
				response = event.message;
			} else if (event.type === "error") {
				response = event.error;
			}
		}

		if (!response) {
			throw new Error("BTW request finished without a response.");
		}

		if (response.stopReason === "aborted") {
			return "aborted";
		}

		return response;
	}

	async function runBtw(ctx: ExtensionCommandContext, question: string, saveRequested: boolean) {
		const { model } = ctx;
		if (!model) {
			notify(ctx, "No active model selected.", "error");
			return;
		}

		const apiKey = await resolveBtwApiKey(model, ctx.modelRegistry);
		if (!apiKey) {
			notify(ctx, `No credentials available for ${model.provider}/${model.id}.`, "error");
			return;
		}

		const wasBusy = !ctx.isIdle();

		const slot: BtwSlot = {
			answer: "",
			controller: new AbortController(),
			done: false,
			modelLabel: `${model.provider}/${model.id}`,
			question,
			thinking: "",
		};

		const threadSnapshot = [...pendingThread];
		slots.push(slot);
		renderWidget(ctx);

		try {
			const response = await streamBtwRequest(ctx, slot, threadSnapshot, question);

			if (response === "aborted") {
				removeSlotAndRender(slot, slots, ctx, renderWidget);
				return;
			}

			const { answer, thinking } = processStreamResponse(response, slot);

			slot.thinking = thinking;
			slot.answer = answer;
			slot.done = true;
			renderWidget(ctx);

			const details: BtwDetails = {
				answer,
				model: model.id,
				provider: model.provider,
				question,
				thinking,
				thinkingLevel: pi.getThinkingLevel() as SessionThinkingLevel,
				timestamp: Date.now(),
				usage: response.usage,
			};

			pendingThread.push(details);
			pi.appendEntry(BTW_ENTRY_TYPE, details);

			const saveState = saveVisibleBtwNote(pi, details, saveRequested, wasBusy);
			if (saveState === "saved") {
				notify(ctx, "Saved BTW note to the session.", "info");
			} else if (saveState === "queued") {
				notify(ctx, "BTW note queued to save after the current turn finishes.", "info");
			}
		} catch (error) {
			if (slot.controller.signal.aborted) {
				removeSlotAndRender(slot, slots, ctx, renderWidget);
				return;
			}

			slot.answer = `[ERR] ${error instanceof Error ? error.message : String(error)}`;
			slot.done = true;
			renderWidget(ctx);
			notify(ctx, error instanceof Error ? error.message : String(error), "error");
		}
	}

	async function summarizeThread(ctx: ExtensionCommandContext, thread: BtwDetails[]): Promise<string> {
		const { model } = ctx;
		if (!model) {
			throw new Error("No active model selected.");
		}

		const apiKey = await resolveBtwApiKey(model, ctx.modelRegistry);
		if (!apiKey) {
			throw new Error(`No credentials available for ${model.provider}/${model.id}.`);
		}

		const response = await completeSimple(
			model,
			{
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: formatThread(thread) }],
						timestamp: Date.now(),
					},
				],
				systemPrompt:
					"Summarize the side conversation concisely. Preserve key decisions, plans, insights, risks, and action items. Output only the summary.",
			},
			{ apiKey, reasoning: "low" },
		);

		if (response.stopReason === "error") {
			throw new Error(response.errorMessage || "Failed to summarize BTW thread.");
		}
		if (response.stopReason === "aborted") {
			throw new Error("BTW summarize aborted.");
		}

		return extractAnswer(response);
	}

	function sendThreadToMain(ctx: ExtensionCommandContext, content: string) {
		if (ctx.isIdle()) {
			pi.sendUserMessage(content);
		} else {
			pi.sendUserMessage(content, { deliverAs: "followUp" });
		}
	}

	// ── Message renderer ──────────────────────────────────────────────────────

	pi.registerMessageRenderer(BTW_MESSAGE_TYPE, (message, { expanded }, theme) => {
		const details = message.details as BtwDetails | undefined;
		const content = typeof message.content === "string" ? message.content : "[non-text btw message]";
		const lines = [theme.fg("accent", theme.bold("[BTW]")), content];

		if (expanded && details) {
			lines.push(theme.fg("dim", `model: ${details.provider}/${details.model} · thinking: ${details.thinkingLevel}`));
			if (details.usage) {
				lines.push(
					theme.fg(
						"dim",
						`tokens: in ${details.usage.input} · out ${details.usage.output} · total ${details.usage.totalTokens}`,
					),
				);
			}
		}

		return new Text(lines.join("\n"), 1, 1);
	});

	// ── Context filter — keep BTW notes out of the main agent ─────────────────

	pi.on("context", async (event) => ({
		messages: event.messages.filter((message) => !isVisibleBtwMessage(message)),
	}));

	// ── Session lifecycle — restore / cleanup ─────────────────────────────────

	let startupRestoreTimer: ReturnType<typeof setTimeout> | undefined;
	const cancelStartupRestore = () => {
		if (!startupRestoreTimer) {
			return;
		}
		clearTimeout(startupRestoreTimer);
		startupRestoreTimer = undefined;
	};
	const restoreCurrentThread = (ctx: ExtensionContext) => {
		cancelStartupRestore();
		restoreThread(ctx);
	};

	pi.on("session_start", async (_event, ctx) => {
		cancelStartupRestore();
		startupRestoreTimer = setTimeout(() => {
			startupRestoreTimer = undefined;
			restoreThread(ctx);
		}, STARTUP_THREAD_RESTORE_DELAY_MS);
		startupRestoreTimer.unref?.();
	});

	pi.on("session_switch", async (_event, ctx) => {
		restoreCurrentThread(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		restoreCurrentThread(ctx);
	});

	pi.on("session_shutdown", async () => {
		cancelStartupRestore();
		abortActiveSlots();
	});

	// ── Command handlers ──────────────────────────────────────────────────────

	const btwHandler = async (args: string, ctx: ExtensionCommandContext) => {
		const { question, save } = parseBtwArgs(args);
		if (!question) {
			notify(ctx, "Usage: /btw [--save] <question>", "warning");
			return;
		}
		await runBtw(ctx, question, save);
	};

	const btwNewHandler = async (args: string, ctx: ExtensionCommandContext) => {
		resetThread(ctx);
		const { question, save } = parseBtwArgs(args);
		if (question) {
			await runBtw(ctx, question, save);
		} else {
			notify(ctx, "Started a fresh BTW thread.", "info");
		}
	};

	const btwClearHandler = async (_args: string, ctx: ExtensionCommandContext) => {
		resetThread(ctx);
		notify(ctx, "Cleared BTW thread.", "info");
	};

	const btwInjectHandler = async (args: string, ctx: ExtensionCommandContext) => {
		if (pendingThread.length === 0) {
			notify(ctx, "No BTW thread to inject.", "warning");
			return;
		}

		const instructions = args.trim();
		const content = instructions
			? `Here is a side conversation I had. ${instructions}\n\n${formatThread(pendingThread)}`
			: `Here is a side conversation I had for additional context:\n\n${formatThread(pendingThread)}`;

		sendThreadToMain(ctx, content);
		const count = pendingThread.length;
		resetThread(ctx);
		notify(ctx, `Injected BTW thread (${count} exchange${count === 1 ? "" : "s"}).`, "info");
	};

	const btwSummarizeHandler = async (args: string, ctx: ExtensionCommandContext) => {
		if (pendingThread.length === 0) {
			notify(ctx, "No BTW thread to summarize.", "warning");
			return;
		}

		widgetStatus = "summarizing...";
		renderWidget(ctx);

		try {
			const summary = await summarizeThread(ctx, pendingThread);
			const instructions = args.trim();
			const content = instructions
				? `Here is a summary of a side conversation I had. ${instructions}\n\n${summary}`
				: `Here is a summary of a side conversation I had:\n\n${summary}`;

			sendThreadToMain(ctx, content);
			const count = pendingThread.length;
			resetThread(ctx);
			notify(ctx, `Injected BTW summary (${count} exchange${count === 1 ? "" : "s"}).`, "info");
		} catch (error) {
			widgetStatus = null;
			renderWidget(ctx);
			notify(ctx, error instanceof Error ? error.message : String(error), "error");
		}
	};

	// ── Register /btw commands ────────────────────────────────────────────────

	pi.registerCommand("btw", {
		description: "Side conversation in a widget above the editor. Add --save to persist a visible note.",
		handler: btwHandler,
	});

	pi.registerCommand("btw:new", {
		description: "Start a fresh BTW thread. Optionally ask the first question immediately.",
		handler: btwNewHandler,
	});

	pi.registerCommand("btw:clear", {
		description: "Dismiss the BTW widget and clear the current thread.",
		handler: btwClearHandler,
	});

	pi.registerCommand("btw:inject", {
		description: "Inject the full BTW thread into the main agent as a user message.",
		handler: btwInjectHandler,
	});

	pi.registerCommand("btw:summarize", {
		description: "Summarize the BTW thread, then inject the summary into the main agent.",
		handler: btwSummarizeHandler,
	});

	// ── Register /qq aliases ──────────────────────────────────────────────────

	pi.registerCommand("qq", {
		description: "Quick question — alias for /btw. Side conversation without interrupting the main agent.",
		handler: btwHandler,
	});

	pi.registerCommand("qq:new", {
		description: "Start a fresh QQ thread. Alias for /btw:new.",
		handler: btwNewHandler,
	});

	pi.registerCommand("qq:clear", {
		description: "Dismiss the QQ widget and clear the thread. Alias for /btw:clear.",
		handler: btwClearHandler,
	});

	pi.registerCommand("qq:inject", {
		description: "Inject the full QQ thread into the main agent. Alias for /btw:inject.",
		handler: btwInjectHandler,
	});

	pi.registerCommand("qq:summarize", {
		description: "Summarize the QQ thread and inject into the main agent. Alias for /btw:summarize.",
		handler: btwSummarizeHandler,
	});
}
