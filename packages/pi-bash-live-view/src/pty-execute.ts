import type { AgentToolResult, AgentToolUpdateCallback } from "@mariozechner/pi-coding-agent";
import { appendExitSummary, highlightErrorOutput, tailText, truncateOutput } from './truncate.js';
import type { OutputTruncation } from './truncate.js';
import { PtySessionManager } from './pty-session.js';
import type { ManagedPtySession } from './pty-session.js';
import { createTerminalEmulator } from './terminal-emulator.js';
import type { TerminalEmulator } from './terminal-emulator.js';
import { PtyLiveWidgetController } from './widget.js';
import type { WidgetContextLike, WidgetStatus } from './widget.js';

const STREAM_UPDATE_DEBOUNCE_MS = 120;
const DEFAULT_PREVIEW_LINES = 40;
const DEFAULT_TERMINAL_COLUMNS = 120;
const DEFAULT_TERMINAL_ROWS = 32;

export interface PtyExecutionResult {
	command: string;
	cwd: string;
	sessionId: string;
	status: WidgetStatus;
	exitCode: number | null;
	cancelled: boolean;
	timedOut: boolean;
	output: string;
	text: string;
	truncated: boolean;
	truncation: OutputTruncation;
	durationMs: number;
}

export interface ExecutePtyCommandOptions {
	command: string;
	cwd: string;
	timeout?: number;
	signal?: AbortSignal;
	onUpdate?: AgentToolUpdateCallback;
	ctx?: WidgetContextLike;
	sessionManager?: PtySessionManager;
	createEmulator?: () => Promise<TerminalEmulator>;
	createWidget?: (ctx: WidgetContextLike, sessionId: string) => PtyLiveWidgetController;
	now?: () => number;
}

function toExecutionStatus(exitCode: number | null, cancelled: boolean, timedOut: boolean): WidgetStatus {
	if (timedOut) {
		return "timed_out";
	}

	if (cancelled) {
		return "cancelled";
	}

	return exitCode === 0 ? "completed" : "failed";
}

function buildPreviewText(output: string): string {
	return tailText(output, DEFAULT_PREVIEW_LINES) || "(waiting for output)";
}

function flushQueuedChunks(queue: string[]): string {
	if (queue.length === 0) {
		return "";
	}

	const chunk = queue.join("");
	queue.length = 0;
	return chunk;
}

export function toAgentToolResult(result: PtyExecutionResult): AgentToolResult<Record<string, unknown>> {
	return {
		content: [{ text: result.text, type: "text" }],
		details: {
			cancelled: result.cancelled,
			durationMs: result.durationMs,
			exitCode: result.exitCode,
			pty: true,
			sessionId: result.sessionId,
			status: result.status,
			timedOut: result.timedOut,
			truncation: result.truncation,
		},
	};
}

export function toUserBashResult(result: PtyExecutionResult): {
	output: string;
	exitCode: number;
	cancelled: boolean;
	truncated: boolean;
} {
	return {
		cancelled: result.cancelled,
		exitCode: result.exitCode ?? (result.status === "completed" ? 0 : 1),
		output: result.text,
		truncated: result.truncated,
	};
}

export async function executePtyCommand(options: ExecutePtyCommandOptions): Promise<PtyExecutionResult> {
	const now = options.now ?? Date.now;
	const startedAt = now();
	const ownsSessionManager = !options.sessionManager;
	const sessionManager = options.sessionManager ?? new PtySessionManager({ now });
	const createEmulator =
		options.createEmulator ??
		(() => createTerminalEmulator({ columns: DEFAULT_TERMINAL_COLUMNS, rows: DEFAULT_TERMINAL_ROWS }));
	const createWidget =
		options.createWidget ??
		((ctx: WidgetContextLike, sessionId: string) =>
			new PtyLiveWidgetController(ctx, {
				key: `pi-bash-live-view:${sessionId}`,
				maxLines: 12,
				placement: "belowEditor",
			}));

	let session: ManagedPtySession | null = null;
	let emulator: TerminalEmulator | null = null;
	let widget: PtyLiveWidgetController | null = null;
	let cancelled = false;
	let timedOut = false;
	let flushTimer: ReturnType<typeof setTimeout> | null = null;
	const queuedChunks: string[] = [];

	const cleanup = () => {
		if (flushTimer) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
		widget?.dispose();
		emulator?.dispose();
		if (session) {
			sessionManager.closeSession(session.id);
		}
		if (ownsSessionManager) {
			sessionManager.dispose();
		}
	};

	try {
		emulator = await createEmulator();
		session = await sessionManager.createSession({
			cols: DEFAULT_TERMINAL_COLUMNS,
			command: options.command,
			cwd: options.cwd,
			rows: DEFAULT_TERMINAL_ROWS,
		});

		if (options.ctx?.hasUI) {
			widget = createWidget(options.ctx, session.id);
			widget.update({
				ansiLines: [],
				command: options.command,
				exitCode: null,
				startedAt,
				status: "running",
			});
		}

		const flush = async (status: WidgetStatus, exitCode: number | null) => {
			const nextChunk = flushQueuedChunks(queuedChunks);
			if (nextChunk) {
				await emulator?.write(nextChunk);
			}

			const plainOutput = session?.getOutput() ?? "";
			widget?.update({
				ansiLines: emulator?.toAnsiLines(12) ?? [],
				command: options.command,
				exitCode,
				startedAt,
				status,
			});

			options.onUpdate?.({
				content: [{ text: buildPreviewText(plainOutput), type: "text" }],
				details: {
					exitCode,
					partial: status === "running",
					pty: true,
					sessionId: session?.id,
					status,
				},
			});
		};

		const scheduleFlush = () => {
			if (flushTimer) {
				return;
			}

			flushTimer = setTimeout(() => {
				flushTimer = null;
				void flush("running", null);
			}, STREAM_UPDATE_DEBOUNCE_MS);
			flushTimer.unref?.();
		};

		session.onData((data) => {
			queuedChunks.push(data);
			scheduleFlush();
		});

		const timeoutSeconds = options.timeout;
		const timeoutMs = timeoutSeconds != null ? Math.max(1, timeoutSeconds * 1000) : null;
		const timeoutTimer =
			timeoutMs == null
				? null
				: setTimeout(() => {
						timedOut = true;
						session?.kill("timed_out");
					}, timeoutMs);
		timeoutTimer?.unref?.();

		const abortListener = () => {
			cancelled = true;
			session?.kill("cancelled");
		};
		options.signal?.addEventListener("abort", abortListener, { once: true });

		const exitEvent = await session.whenExited;
		if (flushTimer) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
		timeoutTimer && clearTimeout(timeoutTimer);
		options.signal?.removeEventListener("abort", abortListener);

		const status = toExecutionStatus(exitEvent.exitCode, cancelled, timedOut);
		await flush(status, exitEvent.exitCode);

		const output = session.getOutput();
		const truncatedOutput = truncateOutput(output);
		const highlightedOutput = highlightErrorOutput(truncatedOutput.text);
		const text = appendExitSummary(highlightedOutput, exitEvent.exitCode, {
			cancelled,
			timedOut,
			timeoutSeconds,
		});

		return {
			cancelled,
			command: options.command,
			cwd: options.cwd,
			durationMs: now() - startedAt,
			exitCode: exitEvent.exitCode,
			output,
			sessionId: session.id,
			status,
			text,
			timedOut,
			truncated: truncatedOutput.truncation.truncated,
			truncation: truncatedOutput.truncation,
		};
	} finally {
		cleanup();
	}
}

export const ptyExecuteInternals = {
	buildPreviewText,
	flushQueuedChunks,
	toExecutionStatus,
};
