/**
 * oh-pi BTW / QQ Extension — parallel side conversations
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

import { requirePiTuiModule } from "@ifi/pi-shared-qna";
import {
	type ThinkingLevel as AiThinkingLevel,
	type AssistantMessage,
	completeSimple,
	type Message,
	streamSimple,
} from "@mariozechner/pi-ai";
import {
	buildSessionContext,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
} from "@mariozechner/pi-coding-agent";
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
const BTW_WIDGET_MAX_VISIBLE_SLOTS = 2;
const BTW_WIDGET_MAX_PREVIEW_LINES = 8;
const BTW_OVERLAY_WIDTH = "80%";
const BTW_OVERLAY_MAX_HEIGHT = "80%";
const BTW_OVERLAY_VIEWPORT_HEIGHT = 18;

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

interface BtwTheme {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
	italic: (text: string) => string;
}

interface ActiveBtwOverlay {
	scrollOffset: number;
	requestRender: () => void;
}

interface PiTuiHelpers {
	key: {
		enter: string;
		escape: string;
		up: string;
		down: string;
		ctrl: (key: string) => string;
	};
	matchesKey: (input: string, key: string) => boolean;
	truncateToWidth: (text: string, width: number) => string;
	wrapTextWithAnsi: (text: string, width: number) => string[];
}

let cachedPiTui: PiTuiHelpers | undefined;

function getPiTui() {
	if (cachedPiTui) {
		return cachedPiTui;
	}

	const piTuiModule = requirePiTuiModule() as Record<string, unknown>;
	cachedPiTui = {
		key: piTuiModule.Key as PiTuiHelpers["key"],
		matchesKey: piTuiModule.matchesKey as PiTuiHelpers["matchesKey"],
		truncateToWidth: piTuiModule.truncateToWidth as PiTuiHelpers["truncateToWidth"],
		wrapTextWithAnsi: piTuiModule.wrapTextWithAnsi as PiTuiHelpers["wrapTextWithAnsi"],
	};
	return cachedPiTui;
}

function isVisibleBtwMessage(message: { role: string; customType?: string }): boolean {
	return message.role === "custom" && message.customType === BTW_MESSAGE_TYPE;
}

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

function toReasoning(level: SessionThinkingLevel): AiThinkingLevel | undefined {
	return level === "off" ? undefined : level;
}

type CompatibleModelRegistry = {
	getApiKey?: (model: NonNullable<ExtensionContext["model"]>) => Promise<string | undefined> | string | undefined;
	getApiKeyForProvider?: (provider: string) => Promise<string | undefined> | string | undefined;
	authStorage?: {
		getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	};
};

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
		const authStorageModule = Reflect.get(piModule, "AuthStorage") as { create?: () => unknown } | undefined;
		const modelRegistryModule = Reflect.get(piModule, "ModelRegistry") as
			| (new (
					authStorage: unknown,
			  ) => CompatibleModelRegistry)
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
	const question = args.replace(/(?:^|\s)(?:--save|-s)(?=\s|$)/g, " ").trim();
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
			role: "user",
			content: [{ type: "text", text: "[The following is a separate side conversation. Continue this thread.]" }],
			timestamp: Date.now(),
		},
		{
			role: "assistant",
			content: [{ type: "text", text: "Understood, continuing our side conversation." }],
			provider: ctx.model?.provider ?? "unknown",
			model: ctx.model?.id ?? "unknown",
			api: ctx.model?.api ?? "openai-responses",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		},
	];

	for (const entry of thread) {
		messages.push(
			{
				role: "user",
				content: [{ type: "text", text: entry.question }],
				timestamp: entry.timestamp,
			},
			{
				role: "assistant",
				content: [{ type: "text", text: entry.answer }],
				provider: entry.provider,
				model: entry.model,
				api: ctx.model?.api ?? "openai-responses",
				usage: entry.usage ?? {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: entry.timestamp,
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
		role: "user",
		content: [{ type: "text", text: question }],
		timestamp: Date.now(),
	});

	return {
		systemPrompt: [ctx.getSystemPrompt(), BTW_SYSTEM_PROMPT].filter(Boolean).join("\n\n"),
		messages,
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
		customType: BTW_MESSAGE_TYPE,
		content: buildBtwMessageContent(details.question, details.answer),
		display: true,
		details,
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

function buildWidgetThemeHelpers(theme: BtwTheme): WidgetThemeHelpers {
	return {
		dim: (text: string) => theme.fg("dim", text),
		success: (text: string) => theme.fg("success", text),
		italic: (text: string) => theme.fg("dim", theme.italic(text)),
		warning: (text: string) => theme.fg("warning", text),
	};
}

function buildSlotLines(slot: BtwSlot, helpers: WidgetThemeHelpers): string[] {
	const { dim, success, italic, warning } = helpers;
	const lines = [`${dim("│ ")}${success("› ")}${slot.question}`];

	if (slot.thinking) {
		const thinkingLines = slot.thinking.split("\n");
		for (let i = 0; i < thinkingLines.length; i++) {
			const cursor = i === thinkingLines.length - 1 && !slot.answer && !slot.done ? warning(" ▍") : "";
			lines.push(`${dim("│ ")}${italic(thinkingLines[i] || " ")}${cursor}`);
		}
	}

	if (slot.answer) {
		const answerLines = slot.answer.split("\n");
		for (let i = 0; i < answerLines.length; i++) {
			const cursor = i === answerLines.length - 1 && !slot.done ? warning(" ▍") : "";
			lines.push(`${dim("│ ")}${answerLines[i] || " "}${cursor}`);
		}
	} else if (!slot.done) {
		lines.push(`${dim("│ ")}${warning("thinking...")}`);
	}

	lines.push(`${dim("│ ")}${dim(`model: ${slot.modelLabel}`)}`);
	return lines;
}

function appendCompactSlotPreview(slot: BtwSlot, parts: string[], helpers: WidgetThemeHelpers) {
	const slotLines = buildSlotLines(slot, helpers);
	const visible = slotLines.slice(0, BTW_WIDGET_MAX_PREVIEW_LINES);
	parts.push(...visible);

	const hiddenLineCount = slotLines.length - visible.length;
	if (hiddenLineCount > 0) {
		parts.push(
			`${helpers.dim("│ ")}${helpers.dim(`… ${hiddenLineCount} more line${hiddenLineCount === 1 ? "" : "s"} — /btw:open`)}`,
		);
	}
}

function wrapBtwLines(lines: string[], width: number): string[] {
	const { truncateToWidth, wrapTextWithAnsi } = getPiTui();
	const safeWidth = Math.max(20, width);
	const wrapped: string[] = [];

	for (const line of lines) {
		const next = line.length === 0 ? [""] : wrapTextWithAnsi(line, safeWidth);
		for (const segment of next) {
			wrapped.push(truncateToWidth(segment, safeWidth));
		}
	}

	return wrapped;
}

function formatScrollInfo(above: number, below: number): string {
	const parts: string[] = [];
	if (above > 0) {
		parts.push(`↑ ${above} more`);
	}
	if (below > 0) {
		parts.push(`↓ ${below} more`);
	}
	return parts.join(" • ");
}

function buildBtwOverlayLines(
	theme: BtwTheme,
	width: number,
	scrollOffset: number,
	state: { slots: BtwSlot[]; exchangeCount: number; widgetStatus: string | null },
): { lines: string[]; maxOffset: number } {
	const helpers = buildWidgetThemeHelpers(theme);
	const header = [
		theme.bold("💭 BTW thread"),
		theme.fg("dim", "Scrollable full side conversation. The widget above the editor stays compact."),
		"",
	];
	const body: string[] = [];

	if (state.slots.length === 0) {
		body.push(theme.fg("dim", "No BTW thread to show."));
	} else {
		const hiddenCompleted = Math.max(0, state.exchangeCount - state.slots.length);
		body.push(
			theme.fg(
				"dim",
				`${state.exchangeCount} saved exchange${state.exchangeCount === 1 ? "" : "s"} · ${state.slots.length} visible slot${state.slots.length === 1 ? "" : "s"}${hiddenCompleted > 0 ? ` · ${hiddenCompleted} restored` : ""}`,
			),
		);
		body.push("");

		for (let i = 0; i < state.slots.length; i++) {
			if (i > 0) {
				body.push(helpers.dim("│ ───"));
			}
			body.push(...buildSlotLines(state.slots[i], helpers));
		}
	}

	if (state.widgetStatus) {
		body.push("");
		body.push(`${helpers.dim("│ ")}${helpers.warning(state.widgetStatus)}`);
	}

	const wrappedBody = wrapBtwLines(body, Math.max(20, width - 2));
	const maxOffset = Math.max(0, wrappedBody.length - BTW_OVERLAY_VIEWPORT_HEIGHT);
	const start = Math.max(0, Math.min(scrollOffset, maxOffset));
	const visible = wrappedBody.slice(start, start + BTW_OVERLAY_VIEWPORT_HEIGHT);
	const below = Math.max(0, wrappedBody.length - (start + BTW_OVERLAY_VIEWPORT_HEIGHT));
	const footerInfo = formatScrollInfo(start, below);
	const footer = theme.fg(
		"dim",
		`[↑↓/j/k] scroll • [pgup/pgdn] jump • [home/end] ends • [esc/q] close${footerInfo ? ` • ${footerInfo}` : ""}`,
	);

	return {
		lines: wrapBtwLines([...header, ...visible, "", footer], Math.max(20, width - 2)),
		maxOffset,
	};
}

function getBtwOverlayAction(data: string, scrollOffset: number, maxOffset: number): number | "close" | null {
	const { key, matchesKey } = getPiTui();

	if (matchesKey(data, key.escape) || data === "q" || data === " " || matchesKey(data, key.enter)) {
		return "close";
	}

	if (matchesKey(data, key.up) || data === "k" || matchesKey(data, key.ctrl("p"))) {
		return Math.max(0, scrollOffset - 1);
	}

	if (matchesKey(data, key.down) || data === "j" || matchesKey(data, key.ctrl("n"))) {
		return Math.min(maxOffset, scrollOffset + 1);
	}

	if (data === "\u001b[5~") {
		return Math.max(0, scrollOffset - BTW_OVERLAY_VIEWPORT_HEIGHT);
	}

	if (data === "\u001b[6~") {
		return Math.min(maxOffset, scrollOffset + BTW_OVERLAY_VIEWPORT_HEIGHT);
	}

	if (data === "g" || data === "\u001b[H") {
		return 0;
	}

	if (data === "G" || data === "\u001b[F") {
		return maxOffset;
	}

	return null;
}

/** Remove a slot and re-render after abort. */
function removeSlotAndRender(
	slot: BtwSlot,
	allSlots: BtwSlot[],
	ctx: ExtensionContext | ExtensionCommandContext,
	render: (ctx: ExtensionContext | ExtensionCommandContext) => void,
) {
	const idx = allSlots.indexOf(slot);
	if (idx >= 0) {
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
	let activeOverlay: ActiveBtwOverlay | null = null;

	function abortActiveSlots() {
		for (const slot of slots) {
			if (!slot.done) {
				slot.controller.abort();
			}
		}
	}

	function renderWidget(ctx: ExtensionContext | ExtensionCommandContext) {
		activeOverlay?.requestRender();

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
				const helpers = buildWidgetThemeHelpers(theme);
				const parts: string[] = [];
				const title = " 💭 btw ";
				const hint = " /btw:open view · /btw:inject send · /btw:clear dismiss ";
				const frameWidth = 88;
				const lineWidth = Math.max(12, frameWidth - title.length - hint.length);
				const visibleSlots = slots.slice(-BTW_WIDGET_MAX_VISIBLE_SLOTS);
				const hiddenSlotCount = Math.max(0, slots.length - visibleSlots.length);

				parts.push(helpers.dim(`╭${title}${"─".repeat(lineWidth)}${hint}╮`));
				parts.push(
					`${helpers.dim("│ ")}${helpers.dim(`${pendingThread.length} exchange${pendingThread.length === 1 ? "" : "s"} in thread · showing latest ${visibleSlots.length}`)}`,
				);

				if (hiddenSlotCount > 0) {
					parts.push(
						`${helpers.dim("│ ")}${helpers.dim(`… ${hiddenSlotCount} earlier slot${hiddenSlotCount === 1 ? "" : "s"} hidden — /btw:open`)}`,
					);
				}

				for (let i = 0; i < visibleSlots.length; i++) {
					if (i > 0) {
						parts.push(helpers.dim("│ ───"));
					}
					appendCompactSlotPreview(visibleSlots[i], parts, helpers);
				}

				if (widgetStatus) {
					parts.push(`${helpers.dim("│ ")}${helpers.warning(widgetStatus)}`);
				}

				parts.push(helpers.dim(`╰${"─".repeat(frameWidth)}╯`));
				return new Text(parts.join("\n"), 0, 0);
			},
			{ placement: "aboveEditor" },
		);
	}

	async function openBtwOverlay(ctx: ExtensionContext | ExtensionCommandContext) {
		if (!ctx.hasUI || typeof ctx.ui.custom !== "function") {
			notify(ctx, "BTW overlay is unavailable in this pi runtime.", "warning");
			return;
		}

		if (slots.length === 0) {
			notify(ctx, "No BTW thread to show.", "warning");
			return;
		}

		await ctx.ui.custom(
			(tui, theme, _keybindings, done) => {
				const overlay: ActiveBtwOverlay = {
					scrollOffset: 0,
					requestRender: tui.requestRender,
				};
				activeOverlay = overlay;

				return {
					render(width: number) {
						const { lines, maxOffset } = buildBtwOverlayLines(theme, width, overlay.scrollOffset, {
							slots,
							exchangeCount: pendingThread.length,
							widgetStatus,
						});
						overlay.scrollOffset = Math.max(0, Math.min(overlay.scrollOffset, maxOffset));
						return lines;
					},
					handleInput(data: string) {
						const { maxOffset } = buildBtwOverlayLines(theme, 80, overlay.scrollOffset, {
							slots,
							exchangeCount: pendingThread.length,
							widgetStatus,
						});
						const action = getBtwOverlayAction(data, overlay.scrollOffset, maxOffset);

						if (action === null) {
							return;
						}

						if (action === "close") {
							done(undefined);
							return;
						}

						overlay.scrollOffset = action;
						tui.requestRender();
					},
					dispose() {
						if (activeOverlay === overlay) {
							activeOverlay = null;
						}
					},
				};
			},
			{
				overlay: true,
				overlayOptions: { anchor: "center", width: BTW_OVERLAY_WIDTH, maxHeight: BTW_OVERLAY_MAX_HEIGHT },
			},
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
					question: details.question,
					modelLabel: `${details.provider}/${details.model}`,
					thinking: details.thinking,
					answer: details.answer,
					done: true,
					controller: new AbortController(),
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
		const model = ctx.model;
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
			question,
			modelLabel: `${model.provider}/${model.id}`,
			thinking: "",
			answer: "",
			done: false,
			controller: new AbortController(),
		};

		const threadSnapshot = pendingThread.slice();
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
				question,
				thinking,
				answer,
				provider: model.provider,
				model: model.id,
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
		const model = ctx.model;
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
				systemPrompt:
					"Summarize the side conversation concisely. Preserve key decisions, plans, insights, risks, and action items. Output only the summary.",
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: formatThread(thread) }],
						timestamp: Date.now(),
					},
				],
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

	pi.on("context", async (event) => {
		return {
			messages: event.messages.filter((message) => !isVisibleBtwMessage(message)),
		};
	});

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

	const btwOpenHandler = async (_args: string, ctx: ExtensionCommandContext) => {
		await openBtwOverlay(ctx);
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
		description: "Side conversation in a compact widget above the editor. Add --save to persist a visible note.",
		handler: btwHandler,
	});

	pi.registerCommand("btw:new", {
		description: "Start a fresh BTW thread. Optionally ask the first question immediately.",
		handler: btwNewHandler,
	});

	pi.registerCommand("btw:open", {
		description: "Open the full BTW thread in a scrollable overlay.",
		handler: btwOpenHandler,
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

	pi.registerCommand("qq:open", {
		description: "Open the full QQ thread in a scrollable overlay. Alias for /btw:open.",
		handler: btwOpenHandler,
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
