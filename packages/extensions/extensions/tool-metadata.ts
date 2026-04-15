import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type ContextUsageSnapshot = {
	tokens: number | null;
	percent: number | null;
	contextWindow: number | null;
};

export type ToolExecutionMetadata = {
	toolName: string;
	startedAt: number;
	startedAtLabel: string;
	completedAt: number;
	completedAtLabel: string;
	durationMs: number;
	durationLabel: string;
	approxContextTokens: number;
	inputChars: number;
	outputChars: number;
	contextAtCompletion: ContextUsageSnapshot | null;
};

type PendingToolCall = {
	startedAt: number;
};

const APPROX_TOKEN_CHARS = 4;
const TOOL_METADATA_KEY = "toolMetadata";
const MAX_TEXT_BLOCK_CHARS = 120_000;
const MAX_TEXT_LINE_CHARS = 2_000;
const MAX_TEXT_LINES = 2_000;
const OUTPUT_GUARD_NOTE = "\n[tool output truncated for UI safety]";

function pad(value: number): string {
	return `${value}`.padStart(2, "0");
}

export function formatTimestamp(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatDuration(durationMs: number): string {
	if (durationMs < 1000) {
		return `${durationMs}ms`;
	}

	const seconds = durationMs / 1000;
	if (seconds < 60) {
		return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
	}

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	if (minutes < 60) {
		return `${minutes}m${remainingSeconds > 0 ? `${Math.round(remainingSeconds)}s` : ""}`;
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return `${hours}h${remainingMinutes > 0 ? `${remainingMinutes}m` : ""}`;
}

function snapshotContextUsage(ctx: Pick<ExtensionContext, "getContextUsage">): ContextUsageSnapshot | null {
	const usage = ctx.getContextUsage?.();
	if (!usage) {
		return null;
	}

	return {
		tokens: typeof usage.tokens === "number" ? usage.tokens : null,
		percent: typeof usage.percent === "number" ? usage.percent : null,
		contextWindow: typeof usage.contextWindow === "number" ? usage.contextWindow : null,
	};
}

function chunkLine(line: string, maxChars: number): string[] {
	if (line.length <= maxChars) {
		return [line];
	}

	const chunks: string[] = [];
	for (let i = 0; i < line.length; i += maxChars) {
		chunks.push(line.slice(i, i + maxChars));
	}
	return chunks;
}

function sanitizeTextBlock(text: string): { text: string; changed: boolean } {
	if (!text) {
		return { text, changed: false };
	}

	const cleaned = text.replaceAll("\u0000", "");
	let changed = cleaned !== text;

	const lines = cleaned.split("\n");
	const boundedLines = lines.slice(0, MAX_TEXT_LINES);
	if (boundedLines.length !== lines.length) {
		changed = true;
	}

	const wrapped: string[] = [];
	for (const line of boundedLines) {
		const parts = chunkLine(line, MAX_TEXT_LINE_CHARS);
		if (parts.length > 1) {
			changed = true;
		}
		wrapped.push(...parts);
		if (wrapped.length >= MAX_TEXT_LINES) {
			changed = true;
			break;
		}
	}

	let normalized = wrapped.slice(0, MAX_TEXT_LINES).join("\n");
	if (normalized.length > MAX_TEXT_BLOCK_CHARS) {
		normalized = normalized.slice(0, MAX_TEXT_BLOCK_CHARS);
		changed = true;
	}
	if (changed) {
		normalized += OUTPUT_GUARD_NOTE;
	}
	return { text: normalized, changed };
}

function sanitizeContent(content: unknown): { content: unknown[]; changed: boolean } {
	if (!Array.isArray(content)) {
		return { content: [], changed: false };
	}

	let changed = false;
	const normalized = content.map((item) => {
		if (!(item && typeof item === "object" && (item as { type?: unknown }).type === "text")) {
			return item;
		}
		const originalText = (item as { text?: unknown }).text;
		if (typeof originalText !== "string") {
			return item;
		}
		const safeText = sanitizeTextBlock(originalText);
		if (!safeText.changed) {
			return item;
		}
		changed = true;
		return { ...(item as Record<string, unknown>), text: safeText.text };
	});
	return { content: normalized, changed };
}

function collectTextContentChars(content: unknown): number {
	if (!Array.isArray(content)) {
		return 0;
	}

	let total = 0;
	for (const item of content) {
		if (!item || typeof item !== "object") {
			continue;
		}
		const text =
			(item as { type?: unknown; text?: unknown }).type === "text" ? (item as { text?: unknown }).text : undefined;
		if (typeof text === "string") {
			total += text.length;
		}
	}
	return total;
}

function estimateTokens(chars: number): number {
	if (chars <= 0) {
		return 0;
	}
	return Math.ceil(chars / APPROX_TOKEN_CHARS);
}

function formatCount(value: number): string {
	if (value >= 1000) {
		return `${(value / 1000).toFixed(1)}k`;
	}
	return `${value}`;
}

export function buildToolMetadata(
	toolName: string,
	startedAt: number,
	completedAt: number,
	input: unknown,
	content: unknown,
	ctx: Pick<ExtensionContext, "getContextUsage">,
): ToolExecutionMetadata {
	const inputChars = JSON.stringify(input ?? {}).length;
	const outputChars = collectTextContentChars(content);
	const approxContextTokens = estimateTokens(inputChars + outputChars);
	const durationMs = Math.max(0, completedAt - startedAt);

	return {
		toolName,
		startedAt,
		startedAtLabel: formatTimestamp(startedAt),
		completedAt,
		completedAtLabel: formatTimestamp(completedAt),
		durationMs,
		durationLabel: formatDuration(durationMs),
		approxContextTokens,
		inputChars,
		outputChars,
		contextAtCompletion: snapshotContextUsage(ctx),
	};
}

export function formatToolMetadataText(metadata: ToolExecutionMetadata): string {
	const parts = [
		`[tool metadata] completed ${metadata.completedAtLabel}`,
		`duration ${metadata.durationLabel}`,
		`tool context ~${formatCount(metadata.approxContextTokens)} tok`,
	];

	const context = metadata.contextAtCompletion;
	if (context?.percent != null) {
		const tokens = context.tokens == null ? "?" : formatCount(context.tokens);
		const window = context.contextWindow == null ? "?" : formatCount(context.contextWindow);
		parts.push(`session context ${context.percent.toFixed(0)}% (${tokens}/${window})`);
	}

	return parts.join(" · ");
}

export default function toolMetadataExtension(pi: ExtensionAPI): void {
	const pending = new Map<string, PendingToolCall>();

	pi.on("tool_call", (event) => {
		pending.set(event.toolCallId, {
			startedAt: Date.now(),
		});
	});

	pi.on("tool_result", (event, ctx) => {
		const started = pending.get(event.toolCallId);
		pending.delete(event.toolCallId);

		const { content: safeContent, changed } = sanitizeContent(event.content);
		const completedAt = Date.now();
		const metadata = buildToolMetadata(
			event.toolName,
			started?.startedAt ?? completedAt,
			completedAt,
			event.input,
			safeContent,
			ctx,
		);
		if (!started) {
			metadata.startedAtLabel = metadata.completedAtLabel;
		}

		const details =
			event.details && typeof event.details === "object"
				? ({ ...(event.details as Record<string, unknown>) } satisfies Record<string, unknown>)
				: {};
		details[TOOL_METADATA_KEY] = metadata;
		if (changed) {
			details.outputGuard = {
				truncated: true,
				maxChars: MAX_TEXT_BLOCK_CHARS,
				maxLineChars: MAX_TEXT_LINE_CHARS,
				maxLines: MAX_TEXT_LINES,
			};
		}

		return {
			content: [...safeContent, { type: "text" as const, text: formatToolMetadataText(metadata) }],
			details,
		};
	});

	const clearPending = () => {
		pending.clear();
	};

	pi.on("session_switch", clearPending);
	pi.on("session_shutdown", clearPending);
}
