import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth } from "@mariozechner/pi-tui";
import { formatDuration, formatTimestamp, summarizeContent, summarizeText } from "./diagnostics-shared.js";

interface PromptTurnDiagnostics {
	turnIndex: number;
	completedAt: number;
	completedAtLabel: string;
	elapsedMs: number;
	elapsedLabel: string;
	toolCount: number;
	stopReason: string | null;
	responsePreview: string;
}

export interface PromptCompletionDiagnostics {
	promptPreview: string;
	startedAt: number;
	startedAtLabel: string;
	completedAt: number;
	completedAtLabel: string;
	durationMs: number;
	durationLabel: string;
	turnCount: number;
	toolCount: number;
	status: "completed" | "aborted" | "error" | "unknown";
	statusLabel: string;
	stopReason: string | null;
	turns: PromptTurnDiagnostics[];
}

interface DiagnosticsStateEntry {
	enabled?: boolean;
	updatedAt?: number;
}

interface ActivePromptRun {
	promptPreview: string;
	startedAt: number;
	startedAtLabel: string;
	turns: PromptTurnDiagnostics[];
}

interface ActiveToolRun {
	promptPreview: string;
	startedAt: number;
	toolName: string;
}

interface ToolExecutionEventLike {
	toolCallId?: unknown;
	toolName?: unknown;
}

interface SessionEntryLike {
	type?: string;
	customType?: string;
	data?: unknown;
	details?: unknown;
	message?: {
		role?: string;
		customType?: string;
		details?: unknown;
	};
}

interface AgentMessageLike {
	role?: string;
	content?: unknown;
	stopReason?: string;
}

type ThemeLike = Theme;

const COMMAND = "diagnostics";
const SHORTCUT = "ctrl+shift+d";
const DIAGNOSTICS_MESSAGE_TYPE = "pi-diagnostics:prompt";
const DIAGNOSTICS_STATE_TYPE = "pi-diagnostics:state";
const WIDGET_KEY = "diagnostics";
const WIDGET_REFRESH_MS = 5000;
const PROMPT_PREVIEW_MAX_LENGTH = 96;
const RESPONSE_PREVIEW_MAX_LENGTH = 88;

function pluralize(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function classifyStopReason(stopReason: string | null | undefined): {
	status: PromptCompletionDiagnostics["status"];
	statusLabel: string;
	color: "success" | "warning" | "error" | "muted";
} {
	if (stopReason === "aborted") {
		return { color: "warning", status: "aborted", statusLabel: "aborted" };
	}

	if (stopReason === "error") {
		return { color: "error", status: "error", statusLabel: "errored" };
	}

	if (stopReason === "stop" || stopReason === "length") {
		return { color: "success", status: "completed", statusLabel: "completed" };
	}

	return { color: "muted", status: "unknown", statusLabel: "finished" };
}

function isPromptCompletionDiagnostics(value: unknown): value is PromptCompletionDiagnostics {
	return (
		Boolean(value) && typeof value === "object" && typeof (value as { completedAt?: unknown }).completedAt === "number"
	);
}

function isDiagnosticsStateEntry(value: unknown): value is DiagnosticsStateEntry {
	return Boolean(value) && typeof value === "object" && typeof (value as { enabled?: unknown }).enabled === "boolean";
}

function getMessageDetails(entry: SessionEntryLike): unknown {
	if (entry.type === "custom_message") {
		return entry.details;
	}

	if (entry.type === "message" && entry.message?.role === "custom") {
		return entry.message.details;
	}

	return undefined;
}

function getMessageCustomType(entry: SessionEntryLike): string | undefined {
	if (entry.type === "custom_message") {
		return entry.customType;
	}

	if (entry.type === "message" && entry.message?.role === "custom") {
		return entry.message.customType;
	}

	return undefined;
}

function summarizePrompt(prompt: string | undefined, images: unknown): string {
	const promptPreview = summarizeText(prompt ?? "", PROMPT_PREVIEW_MAX_LENGTH);
	if (promptPreview) {
		return promptPreview;
	}

	const imageCount = Array.isArray(images) ? images.length : 0;
	if (imageCount > 0) {
		return imageCount === 1 ? "1 image prompt" : `${imageCount} image prompt`;
	}

	return "(empty prompt)";
}

function countToolResults(toolResults: unknown): number {
	return Array.isArray(toolResults) ? toolResults.length : 0;
}

function summarizeResponsePreview(content: unknown, toolCount: number, stopReason: string | null): string {
	const preview = summarizeContent(content, RESPONSE_PREVIEW_MAX_LENGTH);
	if (preview) {
		return preview;
	}

	if (toolCount > 0) {
		return `Used ${pluralize(toolCount, "tool")}`;
	}

	if (stopReason) {
		return `stop reason: ${stopReason}`;
	}

	return "(no visible response text)";
}

function getToolCallId(event: ToolExecutionEventLike): string | null {
	return typeof event.toolCallId === "string" && event.toolCallId.length > 0 ? event.toolCallId : null;
}

function getToolName(event: ToolExecutionEventLike): string {
	if (typeof event.toolName === "string" && event.toolName.length > 0) {
		return event.toolName;
	}

	return "tool";
}

function getActiveToolSummary(activeToolRuns: Map<string, ActiveToolRun>): {
	earliestStartedAt: number;
	promptPreview: string;
	toolNames: string;
} | null {
	let earliestStartedAt = Number.POSITIVE_INFINITY;
	let promptPreview = "";
	let toolCount = 0;
	let toolNames = "";

	for (const tool of activeToolRuns.values()) {
		if (tool.startedAt < earliestStartedAt) {
			earliestStartedAt = tool.startedAt;
			promptPreview = tool.promptPreview;
		}
		if (toolCount < 3) {
			toolNames = toolNames ? `${toolNames}, ${tool.toolName}` : tool.toolName;
		}
		toolCount += 1;
	}

	if (toolCount === 0) {
		return null;
	}

	return {
		earliestStartedAt,
		promptPreview: promptPreview || "(unknown prompt)",
		toolNames,
	};
}

function findLastAssistantMessage(messages: unknown): AgentMessageLike | null {
	if (!Array.isArray(messages)) {
		return null;
	}

	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index] as AgentMessageLike | undefined;
		if (message?.role === "assistant") {
			return message;
		}
	}

	return null;
}

function findPromptPreviewFromMessages(messages: unknown): string {
	if (!Array.isArray(messages)) {
		return "(empty prompt)";
	}

	for (const message of messages) {
		const candidate = message as AgentMessageLike | undefined;
		if (candidate?.role !== "user") {
			continue;
		}

		const preview = summarizeContent(candidate.content, PROMPT_PREVIEW_MAX_LENGTH);
		if (preview) {
			return preview;
		}
	}

	return "(empty prompt)";
}

function buildPromptSummaryText(details: PromptCompletionDiagnostics): string {
	const timing = [
		`${details.statusLabel} ${details.completedAtLabel}`,
		`started ${details.startedAtLabel}`,
		`duration ${details.durationLabel}`,
		pluralize(details.turnCount, "turn"),
		pluralize(details.toolCount, "tool"),
	].join(" · ");

	return `Prompt ${timing}\n${details.promptPreview}`;
}

function buildPromptCompletion(
	run: ActivePromptRun,
	messages: unknown,
	completedAt: number,
): PromptCompletionDiagnostics {
	const lastAssistant = findLastAssistantMessage(messages);
	const classification = classifyStopReason(lastAssistant?.stopReason ?? null);
	const toolCount = run.turns.reduce((sum, turn) => sum + turn.toolCount, 0);
	const durationMs = Math.max(0, completedAt - run.startedAt);

	return {
		completedAt,
		completedAtLabel: formatTimestamp(completedAt),
		durationLabel: formatDuration(durationMs),
		durationMs,
		promptPreview: run.promptPreview,
		startedAt: run.startedAt,
		startedAtLabel: run.startedAtLabel,
		status: classification.status,
		statusLabel: classification.statusLabel,
		stopReason: lastAssistant?.stopReason ?? null,
		toolCount,
		turnCount: run.turns.length,
		turns: [...run.turns],
	};
}

function renderPromptCompletionMessage(
	message: { content?: unknown; details?: unknown },
	expanded: boolean,
	theme: ThemeLike,
) {
	const details = isPromptCompletionDiagnostics(message.details) ? message.details : undefined;
	const classification = classifyStopReason(details?.stopReason);
	const render = (text: string) => new Text(text, 1, 0, (segment: string) => theme.bg("customMessageBg", segment));

	if (!details) {
		return render(String(message.content ?? "Prompt diagnostics"));
	}

	const lines = [
		`${theme.fg(classification.color, theme.bold(`⏱ Prompt ${details.statusLabel}`))}`,
		`${theme.fg("muted", "Prompt")}: ${details.promptPreview}`,
		`${theme.fg("muted", "Started")}: ${details.startedAtLabel}`,
		`${theme.fg("muted", "Completed")}: ${details.completedAtLabel}`,
		`${theme.fg("muted", "Duration")}: ${details.durationLabel} · ${pluralize(details.turnCount, "turn")} · ${pluralize(details.toolCount, "tool")}`,
	];

	if (!expanded) {
		if (details.turns.length > 0) {
			lines.push(theme.fg("dim", "Expand to inspect per-turn completion timestamps."));
		}
		return render(lines.join("\n"));
	}

	if (details.turns.length === 0) {
		lines.push("");
		lines.push(theme.fg("dim", "No assistant turns were recorded for this prompt."));
		return render(lines.join("\n"));
	}

	lines.push("");
	lines.push(theme.fg("accent", theme.bold("Turn completions")));
	for (const turn of details.turns) {
		const stopReasonSuffix = turn.stopReason ? ` · ${turn.stopReason}` : "";
		lines.push(
			`${theme.fg("dim", `#${turn.turnIndex + 1}`)} ${turn.completedAtLabel} · ${turn.elapsedLabel} · ${pluralize(turn.toolCount, "tool")}${stopReasonSuffix}`,
		);
		lines.push(`  ${theme.fg("muted", turn.responsePreview)}`);
	}

	return render(lines.join("\n"));
}

function getBranchEntries(ctx: ExtensionContext): SessionEntryLike[] {
	const entries = ctx.sessionManager?.getBranch?.();
	return Array.isArray(entries) ? (entries as SessionEntryLike[]) : [];
}

function restoreEnabledState(entries: SessionEntryLike[]): boolean | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry?.type !== "custom" || entry.customType !== DIAGNOSTICS_STATE_TYPE) {
			continue;
		}
		if (isDiagnosticsStateEntry(entry.data)) {
			return entry.data.enabled;
		}
	}
	return undefined;
}

function restoreLastCompletion(entries: SessionEntryLike[]): PromptCompletionDiagnostics | null {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (!entry || getMessageCustomType(entry) !== DIAGNOSTICS_MESSAGE_TYPE) {
			continue;
		}
		const details = getMessageDetails(entry);
		if (isPromptCompletionDiagnostics(details)) {
			return details;
		}
	}
	return null;
}

export default function diagnosticsExtension(pi: ExtensionAPI): void {
	let enabled = true;
	let activeCtx: ExtensionContext | null = null;
	let currentPrompt: ActivePromptRun | null = null;
	let lastCompletion: PromptCompletionDiagnostics | null = null;
	let requestWidgetRender: (() => void) | null = null;
	const activeToolRuns = new Map<string, ActiveToolRun>();

	const persistEnabledState = () => {
		pi.appendEntry(DIAGNOSTICS_STATE_TYPE, {
			enabled,
			updatedAt: Date.now(),
		});
	};

	const renderWidgetLines = (theme: ThemeLike): string[] => {
		const activeToolSummary = getActiveToolSummary(activeToolRuns);
		if (currentPrompt || activeToolSummary) {
			const startedAt = currentPrompt?.startedAt ?? activeToolSummary?.earliestStartedAt ?? Date.now();
			const startedAtLabel = currentPrompt?.startedAtLabel ?? formatTimestamp(startedAt);
			const promptPreview = currentPrompt?.promptPreview ?? activeToolSummary?.promptPreview ?? "(unknown prompt)";
			const recordedTurns = currentPrompt ? ` · ${pluralize(currentPrompt.turns.length, "turn")} recorded` : "";
			const runningTools = activeToolSummary
				? ` · ${pluralize(activeToolRuns.size, "tool")} running (${activeToolSummary.toolNames})`
				: "";
			return [
				`${theme.fg("accent", theme.bold("⏱ Diagnostics"))} ${theme.fg("success", "running")} · ${startedAtLabel} · ${formatDuration(Date.now() - startedAt)} elapsed`,
				`${theme.fg("muted", promptPreview)}${recordedTurns}${runningTools}`,
			];
		}

		if (lastCompletion) {
			const classification = classifyStopReason(lastCompletion.stopReason);
			return [
				`${theme.fg("accent", theme.bold("⏱ Diagnostics"))} ${theme.fg(classification.color, lastCompletion.statusLabel)} · ${lastCompletion.completedAtLabel} · ${lastCompletion.durationLabel}`,
				`${theme.fg("muted", lastCompletion.promptPreview)} · ${pluralize(lastCompletion.turnCount, "turn")} · ${pluralize(lastCompletion.toolCount, "tool")}`,
			];
		}

		return [
			`${theme.fg("accent", theme.bold("⏱ Diagnostics"))} ${theme.fg("muted", "on")} · waiting for next prompt`,
			`${theme.fg("dim", `Use /${COMMAND} or ${SHORTCUT} to toggle logging.`)}`,
		];
	};

	const clearWidget = () => {
		activeCtx?.ui.setWidget(WIDGET_KEY, undefined);
		requestWidgetRender = null;
	};

	const syncWidget = (ctx: ExtensionContext) => {
		activeCtx = ctx;
		if (!enabled) {
			clearWidget();
			return;
		}

		ctx.ui.setWidget(
			WIDGET_KEY,
			(tui, theme) => {
				requestWidgetRender = () => tui.requestRender();
				let timer: ReturnType<typeof setInterval> | null = null;

				const stopTimer = () => {
					if (!timer) {
						return;
					}
					clearInterval(timer);
					timer = null;
				};

				const syncTimer = () => {
					if (!currentPrompt && activeToolRuns.size === 0) {
						stopTimer();
						return;
					}

					if (timer) {
						return;
					}

					timer = setInterval(() => tui.requestRender(), WIDGET_REFRESH_MS);
					timer.unref?.();
				};

				return {
					dispose() {
						if (requestWidgetRender) {
							requestWidgetRender = null;
						}
						stopTimer();
					},
					// Biome-ignore lint/suspicious/noEmptyBlockStatements: Required by the widget component interface.
					invalidate() {},
					render(width: number) {
						syncTimer();
						return renderWidgetLines(theme).map((line) => truncateToWidth(line, width));
					},
				};
			},
			{ placement: "belowEditor" },
		);
	};

	const restoreSessionState = (ctx: ExtensionContext) => {
		const entries = getBranchEntries(ctx);
		const restoredEnabled = restoreEnabledState(entries);
		if (typeof restoredEnabled === "boolean") {
			enabled = restoredEnabled;
		}
		lastCompletion = restoreLastCompletion(entries);
		currentPrompt = null;
		activeToolRuns.clear();
		syncWidget(ctx);
		requestWidgetRender?.();
	};

	const applyToggle = (ctx: ExtensionContext, nextEnabled: boolean, source: "command" | "shortcut") => {
		enabled = nextEnabled;
		persistEnabledState();
		syncWidget(ctx);
		requestWidgetRender?.();
		const origin = source === "shortcut" ? ` via ${SHORTCUT}` : "";
		ctx.ui.notify(`Diagnostics ${enabled ? "enabled" : "disabled"}${origin}.`, "info");
	};

	const showStatus = (ctx: ExtensionCommandContext) => {
		const currentStatus = enabled ? "on" : "off";
		const currentPromptLine = currentPrompt
			? `Running: ${currentPrompt.promptPreview} · ${formatDuration(Date.now() - currentPrompt.startedAt)} elapsed`
			: "Running: none";
		const lastLine = lastCompletion
			? `Last ${lastCompletion.statusLabel}: ${lastCompletion.completedAtLabel} · ${lastCompletion.durationLabel} · ${lastCompletion.promptPreview}`
			: "Last completion: none";
		ctx.ui.notify(`Diagnostics ${currentStatus}. ${currentPromptLine}. ${lastLine}.`, "info");
	};

	pi.registerMessageRenderer(DIAGNOSTICS_MESSAGE_TYPE, (message, { expanded }, theme) =>
		renderPromptCompletionMessage(message, expanded, theme),
	);

	pi.on("session_start", (_event, ctx) => {
		restoreSessionState(ctx);
	});

	pi.on("session_switch", (_event, ctx) => {
		restoreSessionState(ctx);
	});

	pi.on("session_tree", (_event, ctx) => {
		restoreSessionState(ctx);
	});

	pi.on("session_fork", (_event, ctx) => {
		restoreSessionState(ctx);
	});

	pi.on("before_agent_start", (event, ctx) => {
		activeCtx = ctx;
		if (!enabled) {
			return;
		}

		currentPrompt = {
			promptPreview: summarizePrompt(event.prompt, event.images),
			startedAt: Date.now(),
			startedAtLabel: formatTimestamp(Date.now()),
			turns: [],
		};
		requestWidgetRender?.();
	});

	pi.on("tool_execution_start", (event, ctx) => {
		activeCtx = ctx;
		if (!enabled) {
			return;
		}

		const toolCallId = getToolCallId(event);
		if (!toolCallId) {
			return;
		}

		activeToolRuns.set(toolCallId, {
			promptPreview: currentPrompt?.promptPreview ?? "(unknown prompt)",
			startedAt: Date.now(),
			toolName: getToolName(event),
		});
		requestWidgetRender?.();
	});

	pi.on("tool_execution_end", (event, ctx) => {
		activeCtx = ctx;
		const toolCallId = getToolCallId(event);
		if (toolCallId) {
			activeToolRuns.delete(toolCallId);
			requestWidgetRender?.();
		}
	});

	pi.on("turn_end", (event, ctx) => {
		activeCtx = ctx;
		if (!(enabled && currentPrompt && event.message?.role === "assistant")) {
			return;
		}

		const completedAt = Date.now();
		const stopReason = typeof event.message.stopReason === "string" ? event.message.stopReason : null;
		const toolCount = countToolResults(event.toolResults);
		const elapsedMs = Math.max(0, completedAt - currentPrompt.startedAt);
		currentPrompt.turns.push({
			completedAt,
			completedAtLabel: formatTimestamp(completedAt),
			elapsedLabel: formatDuration(elapsedMs),
			elapsedMs,
			responsePreview: summarizeResponsePreview(event.message.content, toolCount, stopReason),
			stopReason,
			toolCount,
			turnIndex: typeof event.turnIndex === "number" ? event.turnIndex : currentPrompt.turns.length,
		});
		requestWidgetRender?.();
	});

	pi.on("agent_end", (event, ctx) => {
		activeCtx = ctx;
		if (!enabled) {
			currentPrompt = null;
			requestWidgetRender?.();
			return;
		}

		const completedAt = Date.now();
		const run = currentPrompt ?? {
			promptPreview: findPromptPreviewFromMessages(event.messages),
			startedAt: completedAt,
			startedAtLabel: formatTimestamp(completedAt),
			turns: [],
		};
		const completion = buildPromptCompletion(run, event.messages, completedAt);
		lastCompletion = completion;
		currentPrompt = null;
		requestWidgetRender?.();
		pi.sendMessage({
			content: buildPromptSummaryText(completion),
			customType: DIAGNOSTICS_MESSAGE_TYPE,
			details: completion,
			display: true,
		});
	});

	pi.on("session_shutdown", () => {
		currentPrompt = null;
		activeToolRuns.clear();
		requestWidgetRender = null;
	});

	pi.registerCommand(COMMAND, {
		description: "Toggle prompt-completion diagnostics logging and widget output.",
		getArgumentCompletions(prefix) {
			const options = [
				{ description: "Show the current diagnostics state", label: "status", value: "status" },
				{ description: "Toggle diagnostics logging on or off", label: "toggle", value: "toggle" },
				{ description: "Enable diagnostics logging and widget output", label: "on", value: "on" },
				{ description: "Disable diagnostics logging and widget output", label: "off", value: "off" },
			];
			const filtered = options.filter((option) => option.value.startsWith(prefix.trim()));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			const action = (args.trim().toLowerCase() || "status") as "status" | "toggle" | "on" | "off";
			if (action === "status") {
				showStatus(ctx);
				return;
			}

			if (action === "on") {
				if (enabled) {
					ctx.ui.notify("Diagnostics are already enabled.", "info");
				} else {
					applyToggle(ctx, true, "command");
				}
				return;
			}

			if (action === "off") {
				if (enabled) {
					applyToggle(ctx, false, "command");
				} else {
					ctx.ui.notify("Diagnostics are already disabled.", "info");
				}
				return;
			}

			applyToggle(ctx, !enabled, "command");
		},
	});

	pi.registerShortcut(SHORTCUT, {
		description: "Toggle prompt diagnostics logging and widget output",
		handler: async (ctx) => {
			applyToggle(ctx as ExtensionContext, !enabled, "shortcut");
		},
	});
}

export const diagnosticsInternals = {
	buildPromptCompletion,
	buildPromptSummaryText,
	classifyStopReason,
	countToolResults,
	findLastAssistantMessage,
	findPromptPreviewFromMessages,
	getActiveToolSummary,
	getBranchEntries,
	getToolCallId,
	getToolName,
	getMessageCustomType,
	getMessageDetails,
	isDiagnosticsStateEntry,
	isPromptCompletionDiagnostics,
	renderPromptCompletionMessage,
	restoreEnabledState,
	restoreLastCompletion,
	summarizePrompt,
	summarizeResponsePreview,
};
