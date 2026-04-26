const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 50 * 1024;
const DEFAULT_TAIL_LINES = 40;

const LIKELY_ERROR_LINE_REGEX = /\b(?:error|failed?|exception|fatal|traceback)\b/i;
const ANSI_RED = "\u001B[31m";
const ANSI_GREEN = "\u001B[32m";
const ANSI_YELLOW = "\u001B[33m";
const ANSI_RESET = "\u001B[0m";

export interface OutputTruncation {
	truncated: boolean;
	totalLines: number;
	totalBytes: number;
	keptLines: number;
	keptBytes: number;
	maxLines: number;
	maxBytes: number;
}

export interface TruncateOutputOptions {
	maxLines?: number;
	maxBytes?: number;
}

export interface TruncateOutputResult {
	text: string;
	truncation: OutputTruncation;
}

function normalizeNewlines(text: string): string {
	return text.replaceAll(/\r\n?/g, "\n");
}

function buildTruncationNotice(truncation: OutputTruncation): string {
	return `[output truncated: kept ${truncation.keptLines}/${truncation.totalLines} lines, ${truncation.keptBytes}/${truncation.totalBytes} bytes]`;
}

function toExitColor(exitCode: number | null, cancelled: boolean, timedOut: boolean): string {
	if (cancelled || timedOut) {
		return ANSI_YELLOW;
	}

	return exitCode === 0 ? ANSI_GREEN : ANSI_RED;
}

export function truncateOutput(text: string, options: TruncateOutputOptions = {}): TruncateOutputResult {
	const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
	const normalizedText = normalizeNewlines(text);

	if (!normalizedText) {
		return {
			text: "",
			truncation: {
				keptBytes: 0,
				keptLines: 0,
				maxBytes,
				maxLines,
				totalBytes: 0,
				totalLines: 0,
				truncated: false,
			},
		};
	}

	const rawLines = normalizedText.split("\n");
	const totalLines = rawLines.length;
	const totalBytes = Buffer.byteLength(normalizedText, "utf8");
	let keptBytes = 0;
	let write = 0;
	let truncated = false;

	for (let read = 0; read < rawLines.length; read++) {
		const prefix = write === 0 ? "" : "\n";
		const nextLine = rawLines[read];
		const nextBytes = Buffer.byteLength(`${prefix}${nextLine}`, "utf8");

		if (write < maxLines && keptBytes + nextBytes <= maxBytes) {
			rawLines[write++] = nextLine;
			keptBytes += nextBytes;
			continue;
		}

		truncated = true;
		break;
	}

	const truncation: OutputTruncation = {
		keptBytes,
		keptLines: write,
		maxBytes,
		maxLines,
		totalBytes,
		totalLines,
		truncated,
	};

	if (!truncated) {
		return {
			text: normalizedText,
			truncation,
		};
	}

	rawLines.length = write;
	const notice = buildTruncationNotice(truncation);
	const keptText = rawLines.join("\n");

	return {
		text: keptText ? `${keptText}\n\n${notice}` : notice,
		truncation,
	};
}

export function tailText(text: string, maxLines = DEFAULT_TAIL_LINES): string {
	const normalizedText = normalizeNewlines(text);
	if (!normalizedText) {
		return "";
	}

	const lines = normalizedText.split("\n");
	if (lines.length <= maxLines) {
		return normalizedText;
	}

	return lines.slice(-maxLines).join("\n");
}

export function highlightErrorOutput(text: string): string {
	if (!text) {
		return text;
	}

	const lines = normalizeNewlines(text).split("\n");
	for (let index = 0; index < lines.length; index++) {
		if (!LIKELY_ERROR_LINE_REGEX.test(lines[index])) {
			continue;
		}

		lines[index] = `${ANSI_RED}${lines[index]}${ANSI_RESET}`;
	}
	return lines.join("\n");
}

export function formatExitSummaryLine(
	exitCode: number | null,
	options: {
		cancelled?: boolean;
		timedOut?: boolean;
		timeoutSeconds?: number;
	} = {},
): string {
	const { cancelled = false, timedOut = false, timeoutSeconds } = options;
	const color = toExitColor(exitCode, cancelled, timedOut);

	if (cancelled) {
		return `${color}[Command cancelled]${ANSI_RESET}`;
	}

	if (timedOut) {
		const timeoutLabel = timeoutSeconds == null ? "command timed out" : `Timed out after ${timeoutSeconds}s`;
		return `${color}[${timeoutLabel}]${ANSI_RESET}`;
	}

	if (exitCode == null) {
		return `${color}[Exit code: unknown]${ANSI_RESET}`;
	}

	return `${color}[Exit code: ${exitCode}]${ANSI_RESET}`;
}

export function appendExitSummary(
	text: string,
	exitCode: number | null,
	options: {
		cancelled?: boolean;
		timedOut?: boolean;
		timeoutSeconds?: number;
	} = {},
): string {
	const summary = formatExitSummaryLine(exitCode, options);
	if (!text) {
		return summary;
	}

	return `${text}\n\n${summary}`;
}

export const truncateInternals = {
	buildTruncationNotice,
	normalizeNewlines,
	toExitColor,
};
