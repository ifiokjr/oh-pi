const DEFAULT_PREVIEW_LENGTH = 120;

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

export function extractTextContent(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}

	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.filter((item) => item && typeof item === "object" && (item as { type?: unknown }).type === "text")
		.map((item) => {
			const {text} = (item as { text?: unknown });
			return typeof text === "string" ? text : "";
		})
		.join(" ")
		.trim();
}

export function summarizeText(text: string, maxLength = DEFAULT_PREVIEW_LENGTH): string {
	const singleLine = text.replaceAll(/\s+/g, " ").trim();
	if (!singleLine) {
		return "";
	}

	if (singleLine.length <= maxLength) {
		return singleLine;
	}

	return `${singleLine.slice(0, maxLength - 1).trimEnd()}…`;
}

export function summarizeContent(content: unknown, maxLength = DEFAULT_PREVIEW_LENGTH): string {
	return summarizeText(extractTextContent(content), maxLength);
}
