/**
 * Usage Tracker Extension — CodexBar-inspired Rate Limit & Cost Monitor for pi
 *
 * The **main feature** is showing **provider-level rate limits**: how much of
 * your weekly/session quota remains for Claude and Codex, with reset countdowns.
 * This is achieved by probing the `claude` and `codex` CLIs (the same approach
 * used by https://github.com/steipete/CodexBar).
 *
 * Also tracks per-model token usage and session costs locally.
 *
 * **Widget** (always visible above editor):
 *   Rate limit bars + session cost at a glance.
 *
 * **`/usage` command** (rich overlay):
 *   Full rate limit status, per-model token breakdown, cache stats, pace.
 *
 * **`usage_report` tool** (LLM-callable):
 *   Agent can generate a cost/usage report for the user on demand.
 *
 * **`Ctrl+U`** shortcut to open the overlay.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Accumulated usage data for a single model. */
interface ModelUsage {
	model: string;
	provider: string;
	turns: number;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	costTotal: number;
	firstSeen: number;
	lastSeen: number;
}

/** Snapshot of a single turn's usage, used for pace calculation. */
interface TurnSnapshot {
	timestamp: number;
	tokens: number;
	cost: number;
}

/** A single rate limit window from a provider. */
interface RateWindow {
	label: string;
	percentLeft: number;
	resetDescription: string | null;
	windowMinutes: number | null;
}

/** Derived pace information for a rate-limit window. */
interface WindowPace {
	label: string;
	deltaPercent: number;
	expectedUsedPercent: number;
	actualUsedPercent: number;
	etaToExhaustionMs: number | null;
	willLastToReset: boolean;
}

/** Rate limit snapshot from a provider CLI probe. */
interface ProviderRateLimits {
	provider: "claude" | "codex";
	windows: RateWindow[];
	credits: number | null;
	account: string | null;
	plan: string | null;
	note: string | null;
	probedAt: number;
	error: string | null;
}

/** Cost thresholds that trigger user notifications. */
const COST_THRESHOLDS = [0.5, 1, 2, 5, 10, 25, 50];

/** Minimum interval between rate limit probes (30 seconds). */
const PROBE_COOLDOWN_MS = 30_000;

/** Probe timeout (15 seconds). */
const PROBE_TIMEOUT_MS = 15_000;

/** Ignore pace calculations until at least ~3% of a window should be consumed. */
const PACE_MIN_EXPECTED_USED_PCT = 3;

// ─── Formatting helpers ─────────────────────────────────────────────────────

/** Format a token count with k/M suffix. */
function fmtTokens(n: number): string {
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(1)}M`;
	}
	if (n >= 1_000) {
		return `${(n / 1_000).toFixed(1)}k`;
	}
	return `${n}`;
}

/** Format a USD cost value. */
function fmtCost(n: number): string {
	if (n >= 1) {
		return `$${n.toFixed(2)}`;
	}
	if (n >= 0.01) {
		return `$${n.toFixed(3)}`;
	}
	return `$${n.toFixed(4)}`;
}

/** Format milliseconds as a compact duration string. */
function fmtDuration(ms: number): string {
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

/** Build an ASCII progress bar. */
function progressBar(percent: number, width = 16): string {
	const clamped = Math.max(0, Math.min(100, percent));
	const filled = Math.round((clamped / 100) * width);
	const empty = width - filled;
	return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

/** Pick a severity color from a remaining percentage. */
function pctColor(pct: number): string {
	if (pct < 10) {
		return "error";
	}
	if (pct < 25) {
		return "warning";
	}
	return "success";
}

function clampPercent(value: number): number {
	return Math.max(0, Math.min(100, value));
}

function inferWindowMinutes(provider: "claude" | "codex", label: string): number | null {
	const lower = label.toLowerCase();
	if (lower.includes("5-hour") || lower.includes("5h")) {
		return 300;
	}
	if (lower.includes("weekly") || lower.includes("week")) {
		return 10_080;
	}
	if (provider === "claude" && lower.includes("session")) {
		// Claude session window is typically 5 hours.
		return 300;
	}
	return null;
}

/** Parse countdown-like reset text such as "in 3d 2h" into milliseconds. */
function parseResetCountdownMs(resetDescription: string | null): number | null {
	if (!resetDescription) {
		return null;
	}

	let normalized = resetDescription
		.toLowerCase()
		.replaceAll(",", " ")
		.replaceAll("·", " ")
		.replaceAll("|", " ")
		.replaceAll(/\s+/g, " ")
		.trim();

	normalized = normalized
		.replace(/^resets?\s*/i, "")
		.replace(/^in\s*/i, "")
		.trim();

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

	const matches = [
		...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(weeks?|w|days?|d|hours?|hrs?|hr|h|minutes?|mins?|min|m)\b/g),
	];
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

function computeWindowPace(window: RateWindow): WindowPace | null {
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

function formatPaceLeft(pace: WindowPace): string {
	const delta = Math.round(Math.abs(pace.deltaPercent));
	if (delta <= 2) {
		return "On pace";
	}
	if (pace.deltaPercent > 0) {
		return `${delta}% in deficit`;
	}
	return `${delta}% in reserve`;
}

function formatPaceRight(pace: WindowPace): string {
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

function upsertWindow(windows: RateWindow[], nextWindow: RateWindow): RateWindow {
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

// ─── CLI probe — parse rate limits from `claude` and `codex` CLIs ────────

/** Strip ANSI escape codes from terminal output. */
function stripAnsi(text: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes use control chars by definition
	return text.replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b\(B/g, "");
}

/** ANSI escape sequence pattern for character-by-character walking. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes use control chars by definition
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b\(B/g;

/**
 * Truncate a string containing ANSI codes to a given *visible* width.
 * Walks the string character by character, skipping ANSI sequences when
 * counting width, so color codes are preserved and the line is cut at the
 * correct visual boundary.
 */
function truncateAnsi(line: string, width: number): string {
	const visibleLength = stripAnsi(line).length;
	if (visibleLength <= width) {
		return line;
	}

	let visible = 0;
	let i = 0;
	while (i < line.length && visible < width) {
		// Check if we're at the start of an ANSI sequence
		ANSI_RE.lastIndex = i;
		const match = ANSI_RE.exec(line);
		if (match && match.index === i) {
			// Skip the entire ANSI sequence (don't count toward visible width)
			i += match[0].length;
		} else {
			// Regular visible character
			visible++;
			i++;
		}
	}

	// Append a reset sequence in case we cut inside a styled region
	return `${line.slice(0, i)}\x1b[0m`;
}

/**
 * Extract a percentage value from a line like "Current session  ███░░ 72% remaining"
 * or "5h limit  ▓▓▓░░ 45% left  resets in 2h 15m".
 * Looks for patterns: `N%`, `N% left`, `N% remaining`.
 */
function extractPercentFromLine(line: string): number | null {
	const match = line.match(/(\d{1,3})\s*%/);
	if (!match) {
		return null;
	}
	const value = Number.parseInt(match[1], 10);
	// If the line says "used" this is usage%, we need to invert to get remaining%
	if (/used/i.test(line)) {
		return Math.max(0, 100 - value);
	}
	return value;
}

/**
 * Extract reset description from a line, e.g. "resets in 3d 2h" → "in 3d 2h".
 */
function extractResetFromLine(line: string): string | null {
	const match = line.match(/resets?\s*(?:in|at|on)?\s*([^|·]+)/i);
	if (match?.[1]?.trim()) {
		return match[1].trim();
	}
	const fallback = line.match(/reset\s*[:-]\s*([^|·]+)/i);
	return fallback?.[1]?.trim() || null;
}

function extractLineValue(text: string, pattern: RegExp): string | null {
	const match = text.match(pattern);
	const value = match?.[1]?.trim();
	if (!value) {
		return null;
	}
	return value;
}

function detectClaudeWindowLabel(lowerLine: string): string | null {
	if (
		lowerLine.includes("current session") ||
		(lowerLine.includes("session") && (lowerLine.includes("left") || lowerLine.includes("remaining")))
	) {
		return "Session";
	}
	if (
		(lowerLine.includes("current week") || lowerLine.includes("weekly")) &&
		(lowerLine.includes("all model") || lowerLine.includes("all models"))
	) {
		return "Weekly (all)";
	}
	if ((lowerLine.includes("current week") || lowerLine.includes("weekly")) && lowerLine.includes("opus")) {
		return "Weekly (Opus)";
	}
	if ((lowerLine.includes("current week") || lowerLine.includes("weekly")) && lowerLine.includes("sonnet")) {
		return "Weekly (Sonnet)";
	}
	if (lowerLine.includes("current week") || lowerLine.includes("weekly")) {
		return "Weekly";
	}
	return null;
}

function detectCodexWindowLabel(lowerLine: string): string | null {
	if (lowerLine.includes("5h limit") || lowerLine.includes("5-hour") || lowerLine.includes("five hour")) {
		return "5-hour";
	}
	if (lowerLine.includes("weekly limit") || lowerLine.includes("weekly")) {
		return "Weekly";
	}
	if (lowerLine.includes("session")) {
		return "Session";
	}
	return null;
}

/**
 * Extract a number after "Credits:" e.g. "Credits: 142.50" → 142.5.
 */
function extractCredits(text: string): number | null {
	const match = text.match(/Credits:\s*([0-9][0-9.,]*)/i);
	if (!match) {
		return null;
	}
	return Number.parseFloat(match[1].replace(",", ""));
}

function parseJsonObjectFromText(text: string): Record<string, unknown> | null {
	const clean = stripAnsi(text).trim();
	if (!clean) {
		return null;
	}

	try {
		const direct = JSON.parse(clean) as unknown;
		if (direct && typeof direct === "object") {
			return direct as Record<string, unknown>;
		}
	} catch {
		// Try extracting the first JSON object block below.
	}

	const start = clean.indexOf("{");
	const end = clean.lastIndexOf("}");
	if (start < 0 || end <= start) {
		return null;
	}
	try {
		const sliced = JSON.parse(clean.slice(start, end + 1)) as unknown;
		if (sliced && typeof sliced === "object") {
			return sliced as Record<string, unknown>;
		}
	} catch {
		return null;
	}
	return null;
}

function hydrateClaudeAuthStatus(result: ProviderRateLimits, text: string): void {
	const parsed = parseJsonObjectFromText(text);
	if (!parsed) {
		return;
	}

	const email = parsed.email;
	if (typeof email === "string" && email.trim()) {
		result.account ??= email.trim();
	}

	const subscriptionType = parsed.subscriptionType;
	if (typeof subscriptionType === "string" && subscriptionType.trim()) {
		result.plan ??= subscriptionType.trim();
	}

	const authMethod = parsed.authMethod;
	if (!result.plan && typeof authMethod === "string" && authMethod.trim()) {
		result.plan = authMethod.trim();
	}
}

function hasProviderDisplayData(rl: ProviderRateLimits): boolean {
	return rl.windows.length > 0 || rl.credits !== null || Boolean(rl.account || rl.plan || rl.note || rl.error);
}

function classifyClaudeUsageOutput(text: string): { error?: string; note?: string } {
	const lower = text.toLowerCase();
	if (
		lower.includes("not logged in") ||
		lower.includes("authentication_error") ||
		lower.includes("token has expired")
	) {
		return { error: "Claude CLI authentication required or expired; run claude auth login." };
	}
	if (lower.includes("stdin is not a terminal")) {
		return { note: "Claude usage windows require an interactive TTY in this environment." };
	}
	if (lower.includes('could you clarify what you mean by "usage"?') || lower.includes("unknown skill: usage")) {
		return { note: "Claude CLI no longer exposes /usage rate-limit windows in this build." };
	}
	return {};
}

function classifyCodexUsageOutput(text: string): { error?: string; note?: string } {
	const lower = text.toLowerCase();
	if (lower.includes("stdin is not a terminal")) {
		return { note: "Codex rate-limit windows require an interactive TTY in this environment." };
	}
	if (lower.includes("operation not permitted")) {
		return { note: "Codex CLI usage probing is blocked by local OS permissions in this environment." };
	}
	if (lower.includes("not logged in") || lower.includes("login required")) {
		return { error: "Codex CLI authentication required; run codex login." };
	}
	return {};
}

/**
 * Probe the Claude CLI for rate limit info.
 *
 * Runs `claude /usage` and parses the TUI output for:
 * - Current session % remaining
 * - Weekly (all models) % remaining
 * - Weekly (Opus/Sonnet) % remaining
 *
 * This is the same approach CodexBar uses.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-source Claude probing (auth metadata + legacy usage windows) requires layered fallbacks.
async function probeClaude(
	exec: (cmd: string, args: string[], opts?: { timeout?: number }) => Promise<{ stdout: string; exitCode: number }>,
): Promise<ProviderRateLimits> {
	const result: ProviderRateLimits = {
		provider: "claude",
		windows: [],
		credits: null,
		account: null,
		plan: null,
		note: null,
		probedAt: Date.now(),
		error: null,
	};

	try {
		const authStatus = await exec("claude", ["auth", "status"], { timeout: PROBE_TIMEOUT_MS });
		hydrateClaudeAuthStatus(result, authStatus.stdout);
	} catch {
		// Best-effort metadata probe only.
	}

	let clean = "";
	try {
		// Legacy window probe (some Claude CLI builds still expose this shape).
		const usage = await exec("claude", ["usage"], { timeout: PROBE_TIMEOUT_MS });
		clean = stripAnsi(usage.stdout);
	} catch (e) {
		const reason = e instanceof Error ? e.message : String(e);
		if (result.account || result.plan) {
			result.note = "Claude CLI usage windows are unavailable in this version.";
		} else {
			result.error = reason;
		}
		return result;
	}

	if (!clean || clean.length < 10) {
		if (result.account || result.plan) {
			result.note = "Claude CLI did not return rate-limit windows.";
		} else {
			result.error = "Empty output from claude CLI";
		}
		return result;
	}

	const classification = classifyClaudeUsageOutput(clean);
	if (classification.error) {
		result.error = classification.error;
		return result;
	}
	if (classification.note) {
		result.note = classification.note;
		return result;
	}

	const lines = clean.split("\n");
	let lastWindow: RateWindow | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}

		result.account ??= extractLineValue(trimmed, /account\s*[:-]\s*(.+)$/i);
		result.plan ??= extractLineValue(trimmed, /plan\s*[:-]\s*(.+)$/i);

		const lower = trimmed.toLowerCase();
		const pct = extractPercentFromLine(trimmed);
		const label = detectClaudeWindowLabel(lower);
		const resetDescription = extractResetFromLine(trimmed);

		if (label && pct !== null) {
			lastWindow = upsertWindow(result.windows, {
				label,
				percentLeft: clampPercent(pct),
				resetDescription,
				windowMinutes: inferWindowMinutes("claude", label),
			});
			continue;
		}

		if (resetDescription && lastWindow && !lastWindow.resetDescription) {
			lastWindow.resetDescription = resetDescription;
		}
	}

	// If line-by-line didn't work, try ordered percentage extraction (fallback)
	if (result.windows.length === 0) {
		const allPcts = [...clean.matchAll(/(\d{1,3})\s*%/g)].map((m) => Number.parseInt(m[1], 10));
		if (allPcts.length >= 1) {
			upsertWindow(result.windows, {
				label: "Session",
				percentLeft: clampPercent(allPcts[0]),
				resetDescription: null,
				windowMinutes: inferWindowMinutes("claude", "Session"),
			});
		}
		if (allPcts.length >= 2) {
			upsertWindow(result.windows, {
				label: "Weekly (all)",
				percentLeft: clampPercent(allPcts[1]),
				resetDescription: null,
				windowMinutes: inferWindowMinutes("claude", "Weekly (all)"),
			});
		}
		if (allPcts.length >= 3) {
			upsertWindow(result.windows, {
				label: "Weekly (model)",
				percentLeft: clampPercent(allPcts[2]),
				resetDescription: null,
				windowMinutes: inferWindowMinutes("claude", "Weekly (model)"),
			});
		}
	}

	if (result.windows.length === 0 && !result.note && !result.error) {
		result.note = "No Claude rate-limit windows found in CLI output.";
	}

	return result;
}

/**
 * Probe the Codex CLI for rate limit info.
 *
 * Parses for:
 * - 5-hour limit % remaining
 * - Weekly limit % remaining
 * - Credits remaining
 * - account/plan hints when available
 */
async function probeCodex(
	exec: (cmd: string, args: string[], opts?: { timeout?: number }) => Promise<{ stdout: string; exitCode: number }>,
): Promise<ProviderRateLimits> {
	const result: ProviderRateLimits = {
		provider: "codex",
		windows: [],
		credits: null,
		account: null,
		plan: null,
		note: null,
		probedAt: Date.now(),
		error: null,
	};

	try {
		const loginStatus = await exec("codex", ["login", "status"], { timeout: PROBE_TIMEOUT_MS });
		const loginClean = stripAnsi(loginStatus.stdout);
		result.plan ??= extractLineValue(loginClean, /logged in using\s+(.+)$/im);
		result.account ??= extractLineValue(loginClean, /account\s*[:-]\s*(.+)$/im);
	} catch {
		// Best-effort metadata probe only.
	}

	try {
		const proc = await exec("codex", ["-s", "read-only", "-a", "untrusted"], { timeout: PROBE_TIMEOUT_MS });
		const clean = stripAnsi(proc.stdout);

		if (!clean || clean.length < 10) {
			if (result.plan || result.account) {
				result.note = "Codex CLI did not return rate-limit windows.";
			} else {
				result.error = "Empty output from codex CLI";
			}
			return result;
		}

		const classification = classifyCodexUsageOutput(clean);
		if (classification.error) {
			result.error = classification.error;
			return result;
		}
		if (classification.note) {
			result.note = classification.note;
			return result;
		}

		result.credits = extractCredits(clean);

		const lines = clean.split("\n");
		let lastWindow: RateWindow | null = null;
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}

			result.account ??= extractLineValue(trimmed, /account\s*[:-]\s*(.+)$/i);
			result.plan ??= extractLineValue(trimmed, /logged in using\s+(.+)$/i);
			result.plan ??= extractLineValue(trimmed, /plan\s*[:-]\s*(.+)$/i);

			const lower = trimmed.toLowerCase();
			const pct = extractPercentFromLine(trimmed);
			const label = detectCodexWindowLabel(lower);
			const resetDescription = extractResetFromLine(trimmed);

			if (label && pct !== null) {
				lastWindow = upsertWindow(result.windows, {
					label,
					percentLeft: clampPercent(pct),
					resetDescription,
					windowMinutes: inferWindowMinutes("codex", label),
				});
				continue;
			}

			if (resetDescription && lastWindow && !lastWindow.resetDescription) {
				lastWindow.resetDescription = resetDescription;
			}
		}
	} catch (e) {
		result.error = e instanceof Error ? e.message : String(e);
		return result;
	}

	if (result.windows.length === 0 && !result.error) {
		result.note = result.note ?? "No Codex rate-limit windows found in CLI output.";
	}

	return result;
}

// ─── Extension entry point ──────────────────────────────────────────────────

/**
 * Ensure `ctrl+u` is unbound from the built-in `deleteToLineStart` action
 * so the usage-tracker shortcut takes priority without a conflict warning.
 *
 * Reads `~/.pi/agent/keybindings.json`, sets `deleteToLineStart: []` if not
 * already configured, and writes back. This is a one-time idempotent operation.
 */
function ensureCtrlUUnbound(): void {
	const keybindingsPath = join(homedir(), ".pi", "agent", "keybindings.json");
	try {
		let config: Record<string, unknown> = {};
		if (existsSync(keybindingsPath)) {
			config = JSON.parse(readFileSync(keybindingsPath, "utf-8"));
		}
		// Only write if deleteToLineStart isn't already configured
		if (!("deleteToLineStart" in config)) {
			config.deleteToLineStart = [];
			writeFileSync(keybindingsPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
		}
	} catch {
		// Non-critical — worst case the warning still shows
	}
}

export default function usageTracker(pi: ExtensionAPI) {
	// Unbind ctrl+u from deleteToLineStart so our shortcut wins cleanly
	ensureCtrlUUnbound();

	/** Per-model accumulated usage. Key = model ID. */
	const models = new Map<string, ModelUsage>();
	/** Recent turn snapshots for pace calc. */
	const turnHistory: TurnSnapshot[] = [];
	/** Highest cost threshold already triggered. */
	let lastThresholdIndex = -1;
	/** Session start time. */
	let sessionStart = Date.now();
	/** Widget visibility. */
	let widgetVisible = true;
	/** Cached rate limit probes. */
	const rateLimits = new Map<string, ProviderRateLimits>();
	/** Last probe timestamp per provider (for cooldown). */
	const lastProbeTime = new Map<string, number>();
	/** Whether a probe is currently in flight. */
	const probeInFlight = new Set<string>();

	// ─── Data collection ──────────────────────────────────────────────────

	function recordUsage(msg: AssistantMessage): void {
		const key = msg.model;
		const now = Date.now();
		const existing = models.get(key);
		if (existing) {
			existing.turns += 1;
			existing.input += msg.usage.input;
			existing.output += msg.usage.output;
			existing.cacheRead += msg.usage.cacheRead;
			existing.cacheWrite += msg.usage.cacheWrite;
			existing.costTotal += msg.usage.cost.total;
			existing.lastSeen = now;
		} else {
			models.set(key, {
				model: msg.model,
				provider: msg.provider,
				turns: 1,
				input: msg.usage.input,
				output: msg.usage.output,
				cacheRead: msg.usage.cacheRead,
				cacheWrite: msg.usage.cacheWrite,
				costTotal: msg.usage.cost.total,
				firstSeen: now,
				lastSeen: now,
			});
		}
		turnHistory.push({ timestamp: now, tokens: msg.usage.input + msg.usage.output, cost: msg.usage.cost.total });
		// Keep last 60 min
		const cutoff = now - 3_600_000;
		while (turnHistory.length > 0 && turnHistory[0].timestamp < cutoff) {
			turnHistory.shift();
		}
	}

	function getTotals() {
		let input = 0;
		let output = 0;
		let cacheRead = 0;
		let cacheWrite = 0;
		let cost = 0;
		let turns = 0;
		for (const m of models.values()) {
			input += m.input;
			output += m.output;
			cacheRead += m.cacheRead;
			cacheWrite += m.cacheWrite;
			cost += m.costTotal;
			turns += m.turns;
		}
		const totalTokens = input + output;
		const avgTokensPerTurn = turns > 0 ? totalTokens / turns : 0;
		const avgCostPerTurn = turns > 0 ? cost / turns : 0;
		return { input, output, cacheRead, cacheWrite, cost, turns, totalTokens, avgTokensPerTurn, avgCostPerTurn };
	}

	function getPace(): { tokensPerMin: number; costPerHour: number } | null {
		if (turnHistory.length < 2) {
			return null;
		}
		const spanMs = turnHistory[turnHistory.length - 1].timestamp - turnHistory[0].timestamp;
		if (spanMs < 10_000) {
			return null;
		}
		let tokenTotal = 0;
		let costTotal = 0;
		for (const t of turnHistory) {
			tokenTotal += t.tokens;
			costTotal += t.cost;
		}
		const tokensPerMin = Math.round(tokenTotal / (spanMs / 60_000));
		const costPerHour = costTotal / (spanMs / 3_600_000);
		return { tokensPerMin, costPerHour };
	}

	function checkThresholds(ctx: ExtensionContext): void {
		const { cost } = getTotals();
		for (let i = COST_THRESHOLDS.length - 1; i >= 0; i--) {
			if (cost >= COST_THRESHOLDS[i] && i > lastThresholdIndex) {
				lastThresholdIndex = i;
				ctx.ui.notify(`💰 Session cost reached ${fmtCost(COST_THRESHOLDS[i])} (now ${fmtCost(cost)})`, "warning");
				return;
			}
		}
	}

	function reset(): void {
		models.clear();
		turnHistory.length = 0;
		lastThresholdIndex = -1;
		sessionStart = Date.now();
	}

	function hydrateFromSession(ctx: ExtensionContext): void {
		reset();
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "message" && entry.message.role === "assistant") {
				recordUsage(entry.message as AssistantMessage);
			}
		}
	}

	// ─── Rate limit probing ───────────────────────────────────────────────

	/**
	 * Probe a provider for rate limit data (with cooldown).
	 * Uses `pi.exec()` to run CLI commands.
	 */
	async function probeProvider(provider: "claude" | "codex", force = false): Promise<void> {
		const now = Date.now();
		const last = lastProbeTime.get(provider) ?? 0;
		if ((!force && now - last < PROBE_COOLDOWN_MS) || probeInFlight.has(provider)) {
			return;
		}
		probeInFlight.add(provider);
		try {
			const execFn = async (cmd: string, args: string[], opts?: { timeout?: number }) => {
				const result = await pi.exec(cmd, args, { timeout: opts?.timeout });
				return { stdout: result.stdout, exitCode: result.exitCode };
			};
			const limits = provider === "claude" ? await probeClaude(execFn) : await probeCodex(execFn);
			rateLimits.set(provider, limits);
			lastProbeTime.set(provider, Date.now());
		} catch {
			// Probe failed — keep stale data if any
		} finally {
			probeInFlight.delete(provider);
		}
	}

	/**
	 * Determine which providers to probe based on the current model.
	 * Probes in the background (fire-and-forget) to not block the agent.
	 */
	function triggerProbe(ctx: ExtensionContext, force = false): void {
		const model = ctx.model;
		if (!model) {
			return;
		}
		const id = model.id.toLowerCase();
		// Detect provider from model ID
		if (id.includes("claude") || id.includes("sonnet") || id.includes("opus") || id.includes("haiku")) {
			probeProvider("claude", force);
		}
		if (id.includes("gpt") || id.includes("o1") || id.includes("o3") || id.includes("o4") || id.includes("codex")) {
			probeProvider("codex", force);
		}
	}

	// ─── Inter-extension event broadcasting ──────────────────────────────

	/**
	 * Broadcast current usage/rate-limit data to other extensions via `pi.events`.
	 *
	 * The ant-colony budget-planner listens on `"usage:limits"` to receive:
	 * - Provider rate limit windows (Claude session/weekly %, Codex 5h/weekly %)
	 * - Aggregate session cost
	 * - Per-model usage snapshots
	 *
	 * Other extensions may also listen for dashboard/alerting purposes.
	 */
	function broadcastUsageData(): void {
		const totals = getTotals();
		const providers: Record<string, ProviderRateLimits> = {};
		for (const [key, value] of rateLimits) {
			providers[key] = value;
		}
		const perModel: Record<string, ModelUsage> = {};
		for (const [key, value] of models) {
			perModel[key] = { ...value };
		}
		pi.events.emit("usage:limits", {
			providers,
			sessionCost: totals.cost,
			perModel,
		});
	}

	/**
	 * Respond to on-demand queries from other extensions.
	 * When an extension emits `"usage:query"`, we immediately broadcast
	 * current data via `"usage:limits"`.
	 */
	pi.events.on("usage:query", () => {
		broadcastUsageData();
	});

	// ─── Report generation ────────────────────────────────────────────────

	/** Render rate limit windows as plain text (for LLM tool). */
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: report composition intentionally handles multiple optional detail lines.
	function renderRateLimitsPlain(): string {
		const lines: string[] = [];
		for (const [, rl] of rateLimits) {
			if (!hasProviderDisplayData(rl)) {
				continue;
			}
			const name = rl.provider.charAt(0).toUpperCase() + rl.provider.slice(1);
			const windows = [...rl.windows].sort((a, b) => a.percentLeft - b.percentLeft);
			lines.push(`${name} Rate Limits:`);
			if (rl.error) {
				lines.push(`  Error: ${rl.error}`);
			}
			for (const w of windows) {
				const bar = progressBar(w.percentLeft, 20);
				const usedPercent = clampPercent(100 - w.percentLeft);
				const reset = w.resetDescription ? ` — resets ${w.resetDescription}` : "";
				lines.push(`  ${w.label}: ${bar} ${w.percentLeft}% left (${usedPercent.toFixed(0)}% used)${reset}`);

				const pace = computeWindowPace(w);
				if (pace) {
					const right = formatPaceRight(pace);
					const rightText = right ? ` | ${right}` : "";
					lines.push(
						`    Pace: ${formatPaceLeft(pace)} | Expected ${pace.expectedUsedPercent.toFixed(0)}% used${rightText}`,
					);
				}
			}

			const most = windows[0];
			if (most) {
				lines.push(`  Most constrained: ${most.label} (${most.percentLeft}% left)`);
			} else if (!rl.error) {
				lines.push("  Windows: unavailable from current CLI output");
			}
			if (rl.note) {
				lines.push(`  Note: ${rl.note}`);
			}
			if (rl.plan) {
				lines.push(`  Plan: ${rl.plan}`);
			}
			if (rl.account) {
				lines.push(`  Account: ${rl.account}`);
			}
			if (rl.credits !== null) {
				lines.push(`  Credits: ${rl.credits.toFixed(2)} remaining`);
			}
			const age = Date.now() - rl.probedAt;
			lines.push(`  Updated: ${fmtDuration(age)} ago`);
			lines.push("");
		}
		return lines.join("\n");
	}

	/** Render rate limit windows with theme colors (for TUI). */
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI output path includes pace, metadata, and per-window fallbacks.
	function renderRateLimitsRich(theme: { fg: (c: string, t: string) => string }): string[] {
		const lines: string[] = [];

		for (const [, rl] of rateLimits) {
			if (!hasProviderDisplayData(rl)) {
				continue;
			}

			const name = rl.provider.charAt(0).toUpperCase() + rl.provider.slice(1);
			const windows = [...rl.windows].sort((a, b) => a.percentLeft - b.percentLeft);
			lines.push(`  ${theme.fg("accent", `▸ ${name} Rate Limits`)}`);
			if (rl.error) {
				lines.push(`    ${theme.fg("error", "⚠ Error:")} ${theme.fg("dim", rl.error)}`);
			}

			for (const w of windows) {
				const color = pctColor(w.percentLeft);
				const usedPercent = clampPercent(100 - w.percentLeft);
				const bar = theme.fg(color, progressBar(w.percentLeft, 20));
				const pct = theme.fg(color, `${w.percentLeft}% left`);
				const used = theme.fg("dim", `(${usedPercent.toFixed(0)}% used)`);
				const reset = w.resetDescription ? theme.fg("dim", ` — resets ${w.resetDescription}`) : "";
				lines.push(`    ${theme.fg("accent", w.label.padEnd(15))}${bar} ${pct} ${used}${reset}`);

				const pace = computeWindowPace(w);
				if (pace) {
					const paceColor = pace.deltaPercent > 2 ? "warning" : pace.deltaPercent < -2 ? "success" : "accent";
					const right = formatPaceRight(pace);
					const rightText = right ? `${theme.fg("dim", " | ")}${theme.fg("dim", right)}` : "";
					lines.push(
						`      ${theme.fg("accent", "Pace")}${theme.fg("dim", ": ")}${theme.fg(paceColor, formatPaceLeft(pace))}${theme.fg("dim", ` | Expected ${pace.expectedUsedPercent.toFixed(0)}% used`)}${rightText}`,
					);
				}
			}

			const most = windows[0];
			if (most) {
				lines.push(`    ${theme.fg("dim", `Most constrained: ${most.label} (${most.percentLeft}% left)`)}`);
			} else if (!rl.error) {
				lines.push(`    ${theme.fg("dim", "Windows unavailable from current CLI output")}`);
			}
			if (rl.note) {
				lines.push(`    ${theme.fg("dim", `Note: ${rl.note}`)}`);
			}
			if (rl.plan) {
				lines.push(`    ${theme.fg("accent", "Plan".padEnd(15))}${theme.fg("warning", rl.plan)}`);
			}
			if (rl.account) {
				lines.push(`    ${theme.fg("accent", "Account".padEnd(15))}${theme.fg("dim", rl.account)}`);
			}
			if (rl.credits !== null) {
				lines.push(
					`    ${theme.fg("accent", "Credits".padEnd(15))}${theme.fg("warning", `${rl.credits.toFixed(2)} remaining`)}`,
				);
			}

			const age = Date.now() - rl.probedAt;
			lines.push(`    ${theme.fg("dim", `(updated ${fmtDuration(age)} ago)`)}`);
			lines.push("");
		}

		return lines;
	}

	/** Compact rate limit line for the widget. */
	function renderRateLimitsWidget(theme: { fg: (c: string, t: string) => string }): string {
		const parts: string[] = [];
		for (const [, rl] of rateLimits) {
			if (rl.error || rl.windows.length === 0) {
				continue;
			}
			const name = rl.provider === "claude" ? "Claude" : "Codex";
			// Show the most constrained window (lowest %)
			const most = rl.windows.reduce((a, b) => (a.percentLeft < b.percentLeft ? a : b));
			const color = pctColor(most.percentLeft);
			const bar = theme.fg(color, progressBar(most.percentLeft, 8));
			const reset = most.resetDescription ? theme.fg("dim", ` ↻${most.resetDescription}`) : "";
			parts.push(
				`${theme.fg("accent", name)} ${theme.fg("dim", `${most.label}:`)} ${bar} ${theme.fg(color, `${most.percentLeft}%`)}${reset}`,
			);
		}
		return parts.join(theme.fg("dim", "  "));
	}

	function generatePlainReport(ctx: ExtensionContext): string {
		const totals = getTotals();
		const elapsed = Date.now() - sessionStart;
		const pace = getPace();
		const ctxUsage = ctx.getContextUsage();
		const lines: string[] = [];

		// Rate limits first — that's the main thing
		const rlText = renderRateLimitsPlain();
		if (rlText.trim()) {
			lines.push("=== Provider Rate Limits ===");
			lines.push("");
			lines.push(rlText);
		} else {
			lines.push("=== Provider Rate Limits ===");
			lines.push("(No rate limit data yet — will probe after next turn)");
			lines.push("");
		}

		lines.push("=== Session Usage ===");
		lines.push("");
		lines.push(`Duration: ${fmtDuration(elapsed)} | Turns: ${totals.turns}`);
		lines.push(
			`Tokens: ${fmtTokens(totals.input)} in / ${fmtTokens(totals.output)} out (${fmtTokens(totals.totalTokens)} total)`,
		);
		lines.push(`Cost: ${fmtCost(totals.cost)}`);
		if (totals.turns > 0) {
			lines.push(
				`Avg/turn: ${fmtTokens(Math.round(totals.avgTokensPerTurn))} tokens, ${fmtCost(totals.avgCostPerTurn)}`,
			);
		}
		if (pace) {
			lines.push(`Pace: ~${fmtTokens(pace.tokensPerMin)} tokens/min (${fmtCost(pace.costPerHour)}/hour)`);
		}
		if (totals.cacheRead > 0 || totals.cacheWrite > 0) {
			const cacheRatio = totals.input > 0 ? (totals.cacheRead / totals.input) * 100 : 0;
			lines.push(
				`Cache: ${fmtTokens(totals.cacheRead)} read / ${fmtTokens(totals.cacheWrite)} write (${cacheRatio.toFixed(0)}% read vs input)`,
			);
		}
		if (ctxUsage?.percent != null) {
			lines.push(
				`Context: ${ctxUsage.percent.toFixed(0)}% used (${fmtTokens(ctxUsage.tokens ?? 0)} / ${fmtTokens(ctxUsage.contextWindow)})`,
			);
		}

		if (models.size > 0) {
			lines.push("");
			lines.push("--- Per-Model ---");
			const sorted = [...models.values()].sort((a, b) => b.costTotal - a.costTotal);
			for (const m of sorted) {
				const costShare = totals.cost > 0 ? (m.costTotal / totals.cost) * 100 : 0;
				const modelTokens = m.input + m.output;
				const avgTokens = m.turns > 0 ? modelTokens / m.turns : 0;
				lines.push(
					`  ${m.model} (${m.provider}): ${m.turns} turns, ${fmtTokens(m.input)} in / ${fmtTokens(m.output)} out, ${fmtCost(m.costTotal)} (${costShare.toFixed(0)}% of session), avg ${fmtTokens(Math.round(avgTokens))}/turn`,
				);
				if (m.cacheRead > 0 || m.cacheWrite > 0) {
					lines.push(`    cache: ${fmtTokens(m.cacheRead)} read / ${fmtTokens(m.cacheWrite)} write`);
				}
			}
		}

		return lines.join("\n");
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: rich dashboard aggregates multiple optional sections and formatting branches.
	function generateRichReport(ctx: ExtensionContext, theme: { fg: (c: string, t: string) => string }): string[] {
		const totals = getTotals();
		const elapsed = Date.now() - sessionStart;
		const pace = getPace();
		const ctxUsage = ctx.getContextUsage();
		const lines: string[] = [];
		const sep = theme.fg("dim", " │ ");
		const divider = theme.fg("dim", "─".repeat(60));

		lines.push(theme.fg("accent", "╭─ Usage Dashboard ──────────────────────────────────────╮"));
		lines.push("");

		// ── Rate limits (the main feature) ──
		const rlLines = renderRateLimitsRich(theme);
		if (rlLines.length > 0) {
			lines.push(...rlLines);
		} else {
			lines.push(`  ${theme.fg("dim", "No rate limit data yet — will probe after next turn")}`);
			lines.push("");
		}

		lines.push(`  ${divider}`);

		// ── Session summary ──
		lines.push(
			`  ${theme.fg("accent", "Session")}${sep}${fmtDuration(elapsed)}${sep}${totals.turns} turns${sep}${theme.fg("warning", fmtCost(totals.cost))}`,
		);

		lines.push(
			`  ${theme.fg("accent", "Tokens ")}${sep}${theme.fg("success", fmtTokens(totals.input))} in${sep}${theme.fg("warning", fmtTokens(totals.output))} out${sep}${theme.fg("dim", fmtTokens(totals.totalTokens))} total`,
		);

		if (totals.turns > 0) {
			lines.push(
				`  ${theme.fg("accent", "Avg    ")}${sep}${fmtTokens(Math.round(totals.avgTokensPerTurn))} tok/turn${sep}${theme.fg("warning", fmtCost(totals.avgCostPerTurn))}/turn`,
			);
		}

		if (pace) {
			lines.push(
				`  ${theme.fg("accent", "Pace   ")}${sep}~${fmtTokens(pace.tokensPerMin)} tok/min${sep}${theme.fg("warning", `${fmtCost(pace.costPerHour)}/h`)}`,
			);
		}

		if (totals.cacheRead > 0 || totals.cacheWrite > 0) {
			const cacheRatio = totals.input > 0 ? (totals.cacheRead / totals.input) * 100 : 0;
			lines.push(
				`  ${theme.fg("accent", "Cache  ")}${sep}${fmtTokens(totals.cacheRead)} read${sep}${fmtTokens(totals.cacheWrite)} write${sep}${theme.fg("dim", `${cacheRatio.toFixed(0)}% read/input`)}`,
			);
		}

		if (ctxUsage?.percent != null) {
			const pct = ctxUsage.percent;
			const color = pctColor(100 - pct); // invert: low remaining = danger
			lines.push(
				`  ${theme.fg("accent", "Context")}${sep}${theme.fg(color, progressBar(100 - pct, 20))} ${theme.fg(color, `${(100 - pct).toFixed(0)}% free`)} of ${fmtTokens(ctxUsage.contextWindow)}`,
			);
		}

		// ── Per-model breakdown ──
		if (models.size > 0) {
			lines.push("");
			lines.push(`  ${divider}`);
			lines.push(`  ${theme.fg("accent", "Per-Model Breakdown")}`);
			lines.push("");

			const sorted = [...models.values()].sort((a, b) => b.costTotal - a.costTotal);
			const maxCost = sorted[0]?.costTotal ?? 1;

			for (const m of sorted) {
				const costPct = maxCost > 0 ? (m.costTotal / maxCost) * 100 : 0;
				const costShare = totals.cost > 0 ? (m.costTotal / totals.cost) * 100 : 0;
				const modelTokens = m.input + m.output;
				const avgTokens = m.turns > 0 ? modelTokens / m.turns : 0;
				const bar = progressBar(costPct, 12);
				lines.push(`  ${theme.fg("accent", "◆")} ${theme.fg("accent", m.model)} ${theme.fg("dim", `(${m.provider})`)}`);
				lines.push(
					`    ${bar} ${theme.fg("warning", fmtCost(m.costTotal))}${sep}${m.turns} turns${sep}${fmtTokens(m.input)} in / ${fmtTokens(m.output)} out${sep}${theme.fg("dim", `${costShare.toFixed(0)}% of cost`)}`,
				);
				lines.push(`    ${theme.fg("dim", `avg ${fmtTokens(Math.round(avgTokens))} tok/turn`)}`);
				if (m.cacheRead > 0 || m.cacheWrite > 0) {
					lines.push(
						`    ${theme.fg("dim", `cache ${fmtTokens(m.cacheRead)} read / ${fmtTokens(m.cacheWrite)} write`)}`,
					);
				}
			}
		}

		lines.push("");
		lines.push(theme.fg("accent", "╰────────────────────────────────────────────────────────╯"));
		lines.push(theme.fg("dim", "  Press q/Esc/Space to close"));

		return lines;
	}

	// ─── Widget rendering ─────────────────────────────────────────────────

	function renderWidget(_ctx: ExtensionContext, theme: { fg: (c: string, t: string) => string }): string[] {
		if (!widgetVisible) {
			return [];
		}

		const totals = getTotals();
		const sep = theme.fg("dim", " │ ");
		const parts: string[] = [];

		// Rate limits — the primary info
		const rlWidget = renderRateLimitsWidget(theme);
		if (rlWidget) {
			parts.push(rlWidget);
		}

		// Session cost (only if we have data)
		if (totals.turns > 0) {
			parts.push(theme.fg("warning", `💰${fmtCost(totals.cost)}`));
			parts.push(`${theme.fg("success", fmtTokens(totals.input))}/${theme.fg("warning", fmtTokens(totals.output))}`);
		}

		if (parts.length === 0) {
			return []; // Nothing to show yet
		}

		return [parts.join(sep)];
	}

	// ─── Event handlers ───────────────────────────────────────────────────

	pi.on("session_start", (_event, ctx) => {
		hydrateFromSession(ctx);
		triggerProbe(ctx);

		ctx.ui.setWidget("usage-tracker", (tui, theme) => {
			const timer = setInterval(() => tui.requestRender(), 15_000);
			return {
				dispose() {
					clearInterval(timer);
				},
				// biome-ignore lint/suspicious/noEmptyBlockStatements: required by Component interface
				invalidate() {},
				render() {
					return renderWidget(ctx, theme);
				},
			};
		});
	});

	pi.on("session_switch", (_event, ctx) => {
		hydrateFromSession(ctx);
		triggerProbe(ctx);
	});

	pi.on("turn_end", (event, ctx) => {
		if (event.message.role === "assistant") {
			recordUsage(event.message as unknown as AssistantMessage);
			checkThresholds(ctx);
			triggerProbe(ctx); // Refresh rate limits after each turn
			broadcastUsageData(); // Notify other extensions (ant-colony budget planner)
		}
	});

	pi.on("model_select", (_event, ctx) => {
		triggerProbe(ctx); // Probe the new provider
	});

	// ─── /usage command ───────────────────────────────────────────────────

	pi.registerCommand("usage", {
		description: "Show rate limits, token usage, and cost breakdown",
		async handler(_args, ctx) {
			// Force a fresh probe before showing
			triggerProbe(ctx, true);
			// Small delay to let probe complete
			await new Promise((resolve) => setTimeout(resolve, 500));

			await ctx.ui.custom(
				(_tui, theme, _keybindings, done) => {
					const lines = generateRichReport(ctx, theme);
					return {
						render(width: number) {
							return lines.map((line) => truncateAnsi(line, width));
						},
						handleInput(data: string) {
							if (data === "q" || data === "\x1b" || data === "\r" || data === " ") {
								done(undefined);
							}
						},
						// biome-ignore lint/suspicious/noEmptyBlockStatements: required by Component interface
						dispose() {},
					};
				},
				{ overlay: true },
			);
		},
	});

	// ─── /usage-toggle command ────────────────────────────────────────────

	pi.registerCommand("usage-toggle", {
		description: "Toggle the usage tracker widget visibility",
		async handler(_args, ctx) {
			widgetVisible = !widgetVisible;
			if (widgetVisible) {
				ctx.ui.setWidget("usage-tracker", (tui, theme) => {
					const timer = setInterval(() => tui.requestRender(), 15_000);
					return {
						dispose() {
							clearInterval(timer);
						},
						// biome-ignore lint/suspicious/noEmptyBlockStatements: required by Component interface
						invalidate() {},
						render() {
							return renderWidget(ctx, theme);
						},
					};
				});
				ctx.ui.notify("Usage widget shown.", "info");
			} else {
				ctx.ui.setWidget("usage-tracker", undefined);
				ctx.ui.notify("Usage widget hidden. Run /usage-toggle to show.", "info");
			}
		},
	});

	// ─── /usage-refresh command ──────────────────────────────────────────

	pi.registerCommand("usage-refresh", {
		description: "Force refresh rate limit data from provider CLIs",
		async handler(_args, ctx) {
			// Clear cooldowns to force fresh probes
			lastProbeTime.clear();
			triggerProbe(ctx, true);
			ctx.ui.notify("Refreshing rate limits...", "info");
		},
	});

	// ─── usage_report tool ────────────────────────────────────────────────

	pi.registerTool({
		name: "usage_report",
		label: "Usage Report",
		description:
			"Generate a rate limit status and token usage report. Shows remaining weekly/session quotas for Claude and Codex, plus per-model costs. Use when the user asks about spending, rate limits, quotas, or remaining usage.",
		promptSnippet: "Show provider rate limits (% remaining, reset time) and session usage/cost report.",
		parameters: Type.Object({
			format: Type.Optional(
				Type.Union([Type.Literal("summary"), Type.Literal("detailed")], {
					description: "'summary' for rate limits only, 'detailed' for full breakdown. Default: detailed.",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			// Force a probe before reporting
			triggerProbe(ctx, true);
			await new Promise((resolve) => setTimeout(resolve, 1000));

			const format = params.format ?? "detailed";
			let text: string;

			if (format === "summary") {
				const rlText = renderRateLimitsPlain();
				const totals = getTotals();
				const sessionLine = `Session: ${fmtCost(totals.cost)} cost, ${totals.turns} turns, ${fmtTokens(totals.input)} in / ${fmtTokens(totals.output)} out`;
				text = rlText.trim() ? `${rlText}\n${sessionLine}` : `No rate limit data available.\n${sessionLine}`;
			} else {
				text = generatePlainReport(ctx);
			}

			return { content: [{ type: "text", text }], details: {} };
		},
	});

	// ─── Keyboard shortcut ────────────────────────────────────────────────

	pi.registerShortcut("ctrl+u", {
		description: "Show usage dashboard (rate limits + costs)",
		async handler(ctx) {
			triggerProbe(ctx, true);
			await new Promise((resolve) => setTimeout(resolve, 500));

			await ctx.ui.custom(
				(_tui, theme, _keybindings, done) => {
					const lines = generateRichReport(ctx, theme);
					return {
						render(width: number) {
							return lines.map((line) => truncateAnsi(line, width));
						},
						handleInput(data: string) {
							if (data === "q" || data === "\x1b" || data === "\r" || data === " ") {
								done(undefined);
							}
						},
						// biome-ignore lint/suspicious/noEmptyBlockStatements: required by Component interface
						dispose() {},
					};
				},
				{ overlay: true },
			);
		},
	});
}
