import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

interface ContextUsageSnapshot {
	tokens: number | null;
	percent: number | null;
	contextWindow: number | null;
}

export interface ToolExecutionMetadata {
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
}

interface PendingToolCall {
	startedAt: number;
}

const APPROX_TOKEN_CHARS = 4;
const TOOL_METADATA_KEY = "toolMetadata";
const MAX_TEXT_BLOCK_CHARS = 120_000;
const MAX_TEXT_LINE_CHARS = 2000;
const MAX_TEXT_LINES = 2000;
const OUTPUT_GUARD_NOTE = "\n[tool output truncated for UI safety]";
const MAX_DETAIL_FIELDS = 256;
const MAX_DETAIL_DEPTH = 4;

function pad(value: number): string {
	return `${value}`.padStart(2, "0");
}

export function formatTimestamp(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
		date.getDate(),
	)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
		contextWindow: typeof usage.contextWindow === "number" ? usage.contextWindow : null,
		percent: typeof usage.percent === "number" ? usage.percent : null,
		tokens: typeof usage.tokens === "number" ? usage.tokens : null,
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
		return { changed: false, text };
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
	return { changed, text: normalized };
}

function sanitizeContent(content: unknown): { content: unknown[]; changed: boolean } {
	if (!Array.isArray(content)) {
		return { changed: false, content: [] };
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
	return { changed, content: normalized };
}

function sanitizeDetailsValue(
	value: unknown,
	depth = 0,
	seen = new WeakSet<object>(),
): { value: unknown; changed: boolean } {
	if (typeof value === "string") {
		const safe = sanitizeTextBlock(value);
		return { changed: safe.changed, value: safe.text };
	}
	if (!(value && typeof value === "object")) {
		return { changed: false, value };
	}
	if (seen.has(value)) {
		return { changed: true, value: "[circular]" };
	}
	if (depth >= MAX_DETAIL_DEPTH) {
		return { changed: true, value: "[depth-truncated]" };
	}
	seen.add(value);

	if (Array.isArray(value)) {
		let changed = false;
		const limited = value.slice(0, MAX_DETAIL_FIELDS);
		if (limited.length !== value.length) {
			changed = true;
		}
		const next = limited.map((item) => {
			const normalized = sanitizeDetailsValue(item, depth + 1, seen);
			if (normalized.changed) {
				changed = true;
			}
			return normalized.value;
		});
		return { changed, value: next };
	}

	let changed = false;
	const nextEntries: [string, unknown][] = [];
	const allEntries = Object.entries(value as Record<string, unknown>);
	const entries = allEntries.slice(0, MAX_DETAIL_FIELDS);
	if (entries.length !== allEntries.length) {
		changed = true;
	}
	for (const [key, entryValue] of entries) {
		const normalized = sanitizeDetailsValue(entryValue, depth + 1, seen);
		if (normalized.changed) {
			changed = true;
		}
		nextEntries.push([key, normalized.value]);
	}

	return { changed, value: Object.fromEntries(nextEntries) };
}

function sanitizeDetails(details: unknown): { details: Record<string, unknown>; changed: boolean } {
	if (!(details && typeof details === "object")) {
		return { changed: false, details: {} };
	}
	const normalized = sanitizeDetailsValue(details);
	if (normalized.value && typeof normalized.value === "object" && !Array.isArray(normalized.value)) {
		return {
			changed: normalized.changed,
			details: normalized.value as Record<string, unknown>,
		};
	}
	return { changed: true, details: {} };
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
		approxContextTokens,
		completedAt,
		completedAtLabel: formatTimestamp(completedAt),
		contextAtCompletion: snapshotContextUsage(ctx),
		durationLabel: formatDuration(durationMs),
		durationMs,
		inputChars,
		outputChars,
		startedAt,
		startedAtLabel: formatTimestamp(startedAt),
		toolName,
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

		const { content: safeContent, changed: contentChanged } = sanitizeContent(event.content);
		const { details: safeDetails, changed: detailsChanged } = sanitizeDetails(event.details);
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

		const details = safeDetails;
		details[TOOL_METADATA_KEY] = metadata;
		if (contentChanged || detailsChanged) {
			details.outputGuard = {
				detailsSanitized: detailsChanged,
				maxChars: MAX_TEXT_BLOCK_CHARS,
				maxLineChars: MAX_TEXT_LINE_CHARS,
				maxLines: MAX_TEXT_LINES,
				truncated: true,
			};
		}

		return {
			content: [
				...safeContent,
				{
					text: formatToolMetadataText(metadata),
					type: "text" as const,
				},
			],
			details,
		};
	});

	const clearPending = () => {
		pending.clear();
	};

	pi.on("session_switch", clearPending);
	pi.on("session_shutdown", clearPending);
}
