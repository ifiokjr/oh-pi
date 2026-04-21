import { PACE_MIN_EXPECTED_USED_PCT, type RateWindow, type WindowPace } from "./usage-tracker-shared.js";

export function fmtTokens(n: number): string {
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(1)}M`;
	}

	if (n >= 1_000) {
		return `${(n / 1_000).toFixed(1)}k`;
	}

	return `${n}`;
}

export function fmtCost(n: number): string {
	if (n >= 1) {
		return `$${n.toFixed(2)}`;
	}

	if (n >= 0.01) {
		return `$${n.toFixed(3)}`;
	}

	return `$${n.toFixed(4)}`;
}

export function fmtDuration(ms: number): string {
	const s = Math.floor(ms / 1000);
	if (s < 60) {
		return `${s}s`;
	}
	const m = Math.floor(s / 60);
	const rs = s % 60;
	if (m < 60) {
		return `${m}m${rs > 0 ? `${rs}s` : ""}`;
	}
	const h = Math.floor(m / 60);
	const rm = m % 60;
	return `${h}h${rm > 0 ? `${rm}m` : ""}`;
}

export function progressBar(percent: number, width = 16): string {
	const clamped = Math.max(0, Math.min(100, percent));
	const filled = Math.round((clamped / 100) * width);
	const empty = width - filled;
	return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

export function pctColor(pct: number): string {
	if (pct < 10) {
		return "error";
	}

	if (pct < 25) {
		return "warning";
	}

	return "success";
}

export function clampPercent(value: number): number {
	return Math.max(0, Math.min(100, value));
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes use control chars by definition
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b\(B/g;
const RESET_COUNTDOWN_RE = /(\d+(?:\.\d+)?)\s*(weeks?|w|days?|d|hours?|hrs?|hr|h|minutes?|mins?|min|m)\b/g;
const NORMALIZE_WHITESPACE_RE = /\s+/g;
const RESET_PREFIX_RE = /^resets?\s*/i;
const IN_PREFIX_RE = /^in\s*/i;

export function parseResetCountdownMs(resetDescription: string | null): number | null {
	if (!resetDescription) {
		return null;
	}

	let normalized = resetDescription
		.toLowerCase()
		.replaceAll(",", " ")
		.replaceAll("·", " ")
		.replaceAll("|", " ")
		.replaceAll(NORMALIZE_WHITESPACE_RE, " ")
		.trim();

	normalized = normalized.replace(RESET_PREFIX_RE, "").replace(IN_PREFIX_RE, "").trim();

	if (!normalized || normalized === "now") {
		return 0;
	}

	const units: Record<string, number> = {
		w: 7 * 24 * 60 * 60 * 1000,
		week: 7 * 24 * 60 * 60 * 1000,
		weeks: 7 * 24 * 60 * 60 * 1000,
		d: 24 * 60 * 60 * 1000,
		day: 24 * 60 * 60 * 1000,
		days: 24 * 60 * 60 * 1000,
		h: 60 * 60 * 1000,
		hr: 60 * 60 * 1000,
		hrs: 60 * 60 * 1000,
		hour: 60 * 60 * 1000,
		hours: 60 * 60 * 1000,
		m: 60 * 1000,
		min: 60 * 1000,
		mins: 60 * 1000,
		minute: 60 * 1000,
		minutes: 60 * 1000,
	};

	const matches = [...normalized.matchAll(RESET_COUNTDOWN_RE)];
	if (matches.length === 0) {
		return null;
	}

	let total = 0;
	for (const match of matches) {
		const value = Number.parseFloat(match[1]);
		const unit = match[2].toLowerCase();
		const multiplier = units[unit];
		if (Number.isFinite(value) && multiplier) {
			total += value * multiplier;
		}
	}

	if (!Number.isFinite(total) || total <= 0) {
		return null;
	}
	return Math.round(total);
}

export function computeWindowPace(window: RateWindow): WindowPace | null {
	if (!window.windowMinutes) {
		return null;
	}

	const resetCountdownMs = parseResetCountdownMs(window.resetDescription);
	if (resetCountdownMs === null) {
		return null;
	}

	const totalWindowMs = window.windowMinutes * 60_000;
	if (totalWindowMs <= 0 || resetCountdownMs <= 0 || resetCountdownMs > totalWindowMs) {
		return null;
	}

	const elapsedMs = totalWindowMs - resetCountdownMs;
	if (elapsedMs <= 0) {
		return null;
	}

	const actualUsedPercent = clampPercent(100 - window.percentLeft);
	const expectedUsedPercent = clampPercent((elapsedMs / totalWindowMs) * 100);
	if (expectedUsedPercent < PACE_MIN_EXPECTED_USED_PCT) {
		return null;
	}

	const deltaPercent = actualUsedPercent - expectedUsedPercent;
	let etaToExhaustionMs: number | null = null;
	let willLastToReset = false;

	if (actualUsedPercent <= 0) {
		willLastToReset = true;
	} else {
		const usagePerMs = actualUsedPercent / elapsedMs;
		if (usagePerMs > 0) {
			const remainingPercent = Math.max(0, 100 - actualUsedPercent);
			const etaCandidate = remainingPercent / usagePerMs;
			if (etaCandidate >= resetCountdownMs) {
				willLastToReset = true;
			} else {
				etaToExhaustionMs = etaCandidate;
			}
		}
	}

	return {
		label: window.label,
		deltaPercent,
		expectedUsedPercent,
		actualUsedPercent,
		etaToExhaustionMs,
		willLastToReset,
	};
}

export function formatPaceLeft(pace: WindowPace): string {
	const delta = Math.round(Math.abs(pace.deltaPercent));
	if (delta <= 2) {
		return "On pace";
	}

	if (pace.deltaPercent > 0) {
		return `${delta}% in deficit`;
	}

	return `${delta}% in reserve`;
}

export function formatPaceRight(pace: WindowPace): string {
	if (pace.willLastToReset) {
		return "Lasts until reset";
	}

	if (pace.etaToExhaustionMs === null) {
		return "";
	}

	if (pace.etaToExhaustionMs <= 0) {
		return "Runs out now";
	}

	return `Runs out in ${fmtDuration(pace.etaToExhaustionMs)}`;
}

export function upsertWindow(windows: RateWindow[], nextWindow: RateWindow): RateWindow {
	const existing = windows.find((window) => window.label === nextWindow.label);
	if (existing) {
		existing.percentLeft = nextWindow.percentLeft;
		existing.resetDescription = nextWindow.resetDescription ?? existing.resetDescription;
		existing.windowMinutes = nextWindow.windowMinutes ?? existing.windowMinutes;
		return existing;
	}
	windows.push(nextWindow);
	return nextWindow;
}

export function stripAnsi(text: string): string {
	return text.replace(ANSI_RE, "");
}

export function truncateAnsi(line: string, width: number): string {
	const visibleLength = stripAnsi(line).length;
	if (visibleLength <= width) {
		return line;
	}

	let visible = 0;
	let i = 0;
	while (i < line.length && visible < width) {
		ANSI_RE.lastIndex = i;
		const match = ANSI_RE.exec(line);
		if (match && match.index === i) {
			i += match[0].length;
		} else {
			visible++;
			i++;
		}
	}

	return `${line.slice(0, i)}\x1b[0m`;
}
