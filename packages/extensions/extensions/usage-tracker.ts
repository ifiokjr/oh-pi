/**
 * Usage Tracker Extension — Rate Limit & Cost Monitor for pi
 *
 * The **main feature** is showing **provider-level rate limits** by querying
 * provider APIs directly using pi-managed auth tokens stored in
 * `~/.pi/agent/auth.json`. Supports Anthropic, OpenAI, and Google providers.
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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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

interface UsageSample {
	source: string;
	model: string;
	provider: string;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	costTotal: number;
}

interface SourceUsage {
	source: string;
	turns: number;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	costTotal: number;
}

/** Persisted historical cost point for rolling 30-day totals. */
interface HistoricalCostPoint {
	timestamp: number;
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

/** Known provider keys — matches pi auth.json provider entries. */
type ProviderKey = "anthropic" | "openai" | "google";

/** Rate limit snapshot from a provider API probe. */
interface ProviderRateLimits {
	provider: ProviderKey;
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

/** Rolling cost window duration (30 days). */
const ROLLING_COST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Cap persisted history size so the file cannot grow unbounded. */
const ROLLING_HISTORY_MAX_POINTS = 20_000;

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

function inferWindowMinutes(label: string): number | null {
	const lower = label.toLowerCase();
	if (lower.includes("5-hour") || lower.includes("5h")) {
		return 300;
	}
	if (lower.includes("weekly") || lower.includes("week")) {
		return 10_080;
	}
	if (lower.includes("daily") || lower.includes("day")) {
		return 1_440;
	}
	if (lower.includes("/min")) {
		return 1;
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

// ─── ANSI helpers ────────────────────────────────────────────────────────────

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

// ─── pi-managed auth ─────────────────────────────────────────────────────────

/** Structure of an entry in ~/.pi/agent/auth.json. */
interface PiAuthEntry {
	type: string;
	access: string;
	refresh: string;
	expires: number;
	accountId?: string;
	projectId?: string;
	email?: string;
}

/** Map from auth.json key to ProviderKey. */
const AUTH_KEY_TO_PROVIDER: Record<string, ProviderKey> = {
	anthropic: "anthropic",
	"openai-codex": "openai",
	"google-antigravity": "google",
	"google-gemini-cli": "google",
};

/** Provider API base URLs. */
const PROVIDER_API_BASE: Record<ProviderKey, string> = {
	anthropic: "https://api.anthropic.com",
	openai: "https://api.openai.com",
	google: "https://generativelanguage.googleapis.com",
};

/**
 * Lazy-loaded reference to pi's OAuth refresh machinery.
 * We import `@mariozechner/pi-ai/oauth` at runtime (the extension runs
 * inside pi, so the module is always available). This avoids hardcoding
 * OAuth client IDs/secrets and stays in sync with pi's auth system.
 */
let oauthModule: typeof import("@mariozechner/pi-ai/oauth") | null = null;
async function getOAuthModule(): Promise<typeof import("@mariozechner/pi-ai/oauth") | null> {
	if (oauthModule) {
		return oauthModule;
	}
	try {
		oauthModule = await import("@mariozechner/pi-ai/oauth");
		return oauthModule;
	} catch {
		return null;
	}
}

/** Path to pi's auth storage file. */
function getAuthPath(): string {
	return join(homedir(), ".pi", "agent", "auth.json");
}

/** Read pi's auth config from ~/.pi/agent/auth.json. */
function readPiAuth(): Record<string, PiAuthEntry> {
	const authPath = getAuthPath();
	try {
		if (!existsSync(authPath)) {
			return {};
		}
		const raw = readFileSync(authPath, "utf-8");
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") {
			return {};
		}
		return parsed as Record<string, PiAuthEntry>;
	} catch {
		return {};
	}
}

/**
 * Refresh an expired OAuth token using pi's built-in OAuth module.
 * Delegates to `getOAuthApiKey()` from `@mariozechner/pi-ai/oauth` which
 * handles token refresh, client credentials, and endpoint selection for
 * all supported providers.
 *
 * Updates auth.json on success. Returns the fresh entry or null on failure.
 */
async function refreshProviderToken(
	authKey: string,
	entry: PiAuthEntry,
	allAuth: Record<string, PiAuthEntry>,
): Promise<{ token: string; entry: PiAuthEntry } | null> {
	const oauth = await getOAuthModule();
	if (!oauth) {
		return null;
	}

	try {
		// Build the credentials map that pi's OAuth module expects
		const credentials: Record<string, { type: string; [key: string]: unknown }> = {};
		for (const [key, value] of Object.entries(allAuth)) {
			if (value.type === "oauth") {
				credentials[key] = { type: "oauth", ...value };
			}
		}

		const result = await oauth.getOAuthApiKey(authKey, credentials);
		if (!result) {
			return null;
		}

		// Update the entry with refreshed credentials
		const updated: PiAuthEntry = {
			...entry,
			...(result.newCredentials as Partial<PiAuthEntry>),
		};

		// Persist to auth.json
		try {
			const authPath = getAuthPath();
			const current = existsSync(authPath) ? JSON.parse(readFileSync(authPath, "utf-8")) : {};
			current[authKey] = { type: "oauth", ...updated };
			writeFileSync(authPath, `${JSON.stringify(current, null, 2)}\n`, "utf-8");
		} catch {
			// Non-critical: token works in-memory even if persistence fails.
		}

		// For Google Antigravity, the API key is JSON-encoded with projectId.
		// Extract the raw token for direct API calls.
		let apiToken = result.apiKey;
		try {
			const parsed = JSON.parse(apiToken) as { token?: string };
			if (parsed.token) {
				apiToken = parsed.token;
			}
		} catch {
			// Not JSON — use as-is (Anthropic and OpenAI return raw tokens).
		}

		return { token: apiToken, entry: updated };
	} catch {
		return null;
	}
}

/**
 * Ensure we have a fresh (non-expired) token for a provider.
 * Checks the `expires` field; if expired, attempts OAuth token refresh.
 * Returns the token string or null if refresh failed.
 */
async function ensureFreshToken(
	authKey: string,
	entry: PiAuthEntry,
	allAuth: Record<string, PiAuthEntry>,
): Promise<{ token: string; entry: PiAuthEntry } | null> {
	if (Date.now() < entry.expires && entry.access) {
		return { token: entry.access, entry };
	}

	// Token expired — try refreshing via pi's OAuth module
	return refreshProviderToken(authKey, entry, allAuth);
}

/** Decode a JWT payload without verification. */
function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
	try {
		const parts = jwt.split(".");
		if (parts.length < 2) {
			return null;
		}
		const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
		return JSON.parse(payload) as Record<string, unknown>;
	} catch {
		return null;
	}
}

/** Convert an ISO 8601 timestamp or OpenAI-style duration string to a countdown. */
function resetCountdown(isoOrDuration: string): string | null {
	// Try ISO timestamp first (e.g. "2025-03-13T11:00:30Z")
	const resetTime = new Date(isoOrDuration).getTime();
	if (Number.isFinite(resetTime) && resetTime > 0) {
		const diffMs = resetTime - Date.now();
		if (diffMs <= 0) {
			return "now";
		}
		return `in ${fmtDuration(diffMs)}`;
	}
	// OpenAI uses compact durations like "6ms", "2s", "1m3s"
	const matches = [...isoOrDuration.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)];
	if (matches.length > 0) {
		const multipliers: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
		let totalMs = 0;
		for (const match of matches) {
			totalMs += Number.parseFloat(match[1]) * (multipliers[match[2]] ?? 1);
		}
		if (totalMs <= 0) {
			return "now";
		}
		return `in ${fmtDuration(totalMs)}`;
	}
	return isoOrDuration;
}

// ─── Direct API probes ──────────────────────────────────────────────────────

/** Anthropic OAuth usage endpoint constants (mirrors Claude Code/CodexBar behavior). */
const ANTHROPIC_OAUTH_USAGE_PATH = "/api/oauth/usage";
const ANTHROPIC_OAUTH_USAGE_BETA = "oauth-2025-04-20";
const ANTHROPIC_OAUTH_USER_AGENT = "claude-code/2.1.0";

function isAnthropicOAuthToken(token: string): boolean {
	return token.trim().startsWith("sk-ant-oat");
}

function isAnthropicApiKeyToken(token: string): boolean {
	return token.trim().startsWith("sk-ant-api");
}

function utilizationToPercentLeft(utilization: number): number {
	const usedPercent = utilization <= 1 ? utilization * 100 : utilization;
	return clampPercent(100 - usedPercent);
}

function maybeAddAnthropicOAuthWindow(
	result: ProviderRateLimits,
	entry: unknown,
	label: string,
	windowMinutes: number,
): void {
	if (!(entry && typeof entry === "object")) {
		return;
	}
	// biome-ignore lint/style/useNamingConvention: Anthropic OAuth payload uses snake_case keys.
	const typed = entry as { utilization?: unknown; resets_at?: unknown };
	const utilization = typed.utilization;
	if (!(typeof utilization === "number" && Number.isFinite(utilization))) {
		return;
	}
	const resetRaw = typed.resets_at;
	const reset = typeof resetRaw === "string" ? resetRaw : null;
	upsertWindow(result.windows, {
		label,
		percentLeft: utilizationToPercentLeft(utilization),
		resetDescription: reset ? resetCountdown(reset) : null,
		windowMinutes,
	});
}

/**
 * Probe Anthropic rate limits.
 *
 * OAuth tokens (pi login) use `GET /api/oauth/usage`.
 * API-key tokens use `POST /v1/messages/count_tokens` and headers.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handles OAuth and API-key probe flows with provider-specific status semantics.
async function probeAnthropicDirect(token: string): Promise<ProviderRateLimits> {
	const result: ProviderRateLimits = {
		provider: "anthropic",
		windows: [],
		credits: null,
		account: null,
		plan: null,
		note: null,
		probedAt: Date.now(),
		error: null,
	};

	try {
		if (isAnthropicOAuthToken(token)) {
			const response = await fetch(`${PROVIDER_API_BASE.anthropic}${ANTHROPIC_OAUTH_USAGE_PATH}`, {
				method: "GET",
				headers: {
					authorization: `Bearer ${token}`,
					accept: "application/json",
					"content-type": "application/json",
					"anthropic-beta": ANTHROPIC_OAUTH_USAGE_BETA,
					"user-agent": ANTHROPIC_OAUTH_USER_AGENT,
				},
				signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
			});

			if (response.status === 401) {
				result.error = "Anthropic auth token expired \u2014 re-authenticate in pi settings.";
				return result;
			}
			if (response.status === 429) {
				const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
				const retryHint = Number.isFinite(retryAfter)
					? ` (retry in ${fmtDuration(Math.max(0, retryAfter) * 1000)})`
					: "";
				result.note = `Anthropic OAuth usage endpoint is rate-limited${retryHint}.`;
				result.plan = "OAuth";
				return result;
			}
			if (!response.ok) {
				result.note = `Anthropic OAuth usage endpoint returned ${response.status} — rate limit details unavailable.`;
				result.plan = "OAuth";
				return result;
			}

			const payload = (await response.json()) as Record<string, unknown>;
			maybeAddAnthropicOAuthWindow(result, payload.five_hour, "5-hour", 300);
			maybeAddAnthropicOAuthWindow(result, payload.seven_day, "7-day", 10_080);
			maybeAddAnthropicOAuthWindow(result, payload.seven_day_oauth_apps, "7-day OAuth Apps", 10_080);
			maybeAddAnthropicOAuthWindow(result, payload.seven_day_sonnet, "7-day Sonnet", 10_080);
			maybeAddAnthropicOAuthWindow(result, payload.seven_day_opus, "7-day Opus", 10_080);
			result.plan = "OAuth";
			if (result.windows.length === 0) {
				result.note = "Anthropic OAuth usage response did not include window data.";
			}
			return result;
		}

		// Fallback path for API-key style Anthropic credentials.
		const headers: Record<string, string> = {
			"anthropic-version": "2023-06-01",
			"anthropic-beta": "token-counting-2024-11-01",
			"content-type": "application/json",
		};
		if (isAnthropicApiKeyToken(token)) {
			headers["x-api-key"] = token;
		} else {
			headers.authorization = `Bearer ${token}`;
		}

		const response = await fetch(`${PROVIDER_API_BASE.anthropic}/v1/messages/count_tokens`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				model: "claude-sonnet-4-20250514",
				messages: [{ role: "user", content: "hi" }],
			}),
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});

		if (response.status === 401) {
			result.error = "Anthropic auth token expired \u2014 re-authenticate in pi settings.";
			return result;
		}
		if (!response.ok) {
			result.error = `Anthropic API returned ${response.status}`;
			return result;
		}

		// Extract rate limit info from response headers
		const reqLimit = Number.parseInt(response.headers.get("anthropic-ratelimit-requests-limit") ?? "", 10);
		const reqRemaining = Number.parseInt(response.headers.get("anthropic-ratelimit-requests-remaining") ?? "", 10);
		const reqReset = response.headers.get("anthropic-ratelimit-requests-reset");
		const tokLimit = Number.parseInt(response.headers.get("anthropic-ratelimit-tokens-limit") ?? "", 10);
		const tokRemaining = Number.parseInt(response.headers.get("anthropic-ratelimit-tokens-remaining") ?? "", 10);
		const tokReset = response.headers.get("anthropic-ratelimit-tokens-reset");

		if (Number.isFinite(reqLimit) && Number.isFinite(reqRemaining) && reqLimit > 0) {
			const percentLeft = clampPercent((reqRemaining / reqLimit) * 100);
			upsertWindow(result.windows, {
				label: `Requests (${fmtTokens(reqLimit)}/min)`,
				percentLeft,
				resetDescription: reqReset ? resetCountdown(reqReset) : null,
				windowMinutes: 1,
			});
		}

		if (Number.isFinite(tokLimit) && Number.isFinite(tokRemaining) && tokLimit > 0) {
			const percentLeft = clampPercent((tokRemaining / tokLimit) * 100);
			upsertWindow(result.windows, {
				label: `Tokens (${fmtTokens(tokLimit)}/min)`,
				percentLeft,
				resetDescription: tokReset ? resetCountdown(tokReset) : null,
				windowMinutes: 1,
			});
		}

		result.plan = isAnthropicApiKeyToken(token) ? "API key" : "OAuth";
	} catch (e) {
		if (e instanceof Error && e.name === "TimeoutError") {
			result.error = "Anthropic API probe timed out";
		} else {
			result.error = e instanceof Error ? e.message : String(e);
		}
	}

	return result;
}

/** Extract OpenAI account info from a JWT access token. */
function hydrateOpenAIFromJwt(result: ProviderRateLimits, token: string): void {
	const jwt = decodeJwtPayload(token);
	if (!jwt) {
		return;
	}
	const profile = jwt["https://api.openai.com/profile"] as { email?: string } | undefined;
	if (profile?.email) {
		result.account = profile.email;
	}
	// biome-ignore lint/style/useNamingConvention: OpenAI JWT claim uses snake_case
	const auth = jwt["https://api.openai.com/auth"] as { chatgpt_plan_type?: string } | undefined;
	if (auth?.chatgpt_plan_type) {
		result.plan = auth.chatgpt_plan_type;
	}
}

/**
 * Probe OpenAI API for rate limits using pi-managed OAuth token.
 *
 * Calls `GET /v1/models` (free) and reads rate limit headers. Also decodes the
 * JWT to extract plan type and account email.
 */
async function probeOpenAIDirect(token: string): Promise<ProviderRateLimits> {
	const result: ProviderRateLimits = {
		provider: "openai",
		windows: [],
		credits: null,
		account: null,
		plan: null,
		note: null,
		probedAt: Date.now(),
		error: null,
	};

	hydrateOpenAIFromJwt(result, token);

	try {
		const response = await fetch(`${PROVIDER_API_BASE.openai}/v1/models`, {
			method: "GET",
			headers: { authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});

		if (response.status === 401) {
			result.error = "OpenAI auth token expired \u2014 re-authenticate in pi settings.";
			return result;
		}
		if (response.status === 403) {
			// ChatGPT/Codex subscription tokens can't access /v1/models but
			// JWT info (plan, account) was already extracted above.
			result.note = "Subscription auth \u2014 per-request rate limit windows unavailable.";
			return result;
		}
		if (!response.ok) {
			result.note = `OpenAI API returned ${response.status} \u2014 rate limit details unavailable.`;
			return result;
		}

		// Extract rate limit info from response headers
		const reqLimit = Number.parseInt(response.headers.get("x-ratelimit-limit-requests") ?? "", 10);
		const reqRemaining = Number.parseInt(response.headers.get("x-ratelimit-remaining-requests") ?? "", 10);
		const reqReset = response.headers.get("x-ratelimit-reset-requests");
		const tokLimit = Number.parseInt(response.headers.get("x-ratelimit-limit-tokens") ?? "", 10);
		const tokRemaining = Number.parseInt(response.headers.get("x-ratelimit-remaining-tokens") ?? "", 10);
		const tokReset = response.headers.get("x-ratelimit-reset-tokens");

		if (Number.isFinite(reqLimit) && Number.isFinite(reqRemaining) && reqLimit > 0) {
			const percentLeft = clampPercent((reqRemaining / reqLimit) * 100);
			upsertWindow(result.windows, {
				label: `Requests (${fmtTokens(reqLimit)}/win)`,
				percentLeft,
				resetDescription: reqReset ? resetCountdown(reqReset) : null,
				windowMinutes: inferWindowMinutes(`Requests (${fmtTokens(reqLimit)}/win)`),
			});
		}

		if (Number.isFinite(tokLimit) && Number.isFinite(tokRemaining) && tokLimit > 0) {
			const percentLeft = clampPercent((tokRemaining / tokLimit) * 100);
			upsertWindow(result.windows, {
				label: `Tokens (${fmtTokens(tokLimit)}/win)`,
				percentLeft,
				resetDescription: tokReset ? resetCountdown(tokReset) : null,
				windowMinutes: inferWindowMinutes(`Tokens (${fmtTokens(tokLimit)}/win)`),
			});
		}
	} catch (e) {
		if (e instanceof Error && e.name === "TimeoutError") {
			result.error = "OpenAI API probe timed out";
		} else {
			result.error = e instanceof Error ? e.message : String(e);
		}
	}

	return result;
}

/**
 * Probe Google AI API for rate limits using pi-managed OAuth token.
 *
 * Calls `GET /v1beta/models` (free) and reads any rate limit headers.
 */
async function probeGoogleDirect(token: string, authEntry?: PiAuthEntry): Promise<ProviderRateLimits> {
	const result: ProviderRateLimits = {
		provider: "google",
		windows: [],
		credits: null,
		account: authEntry?.email ?? null,
		plan: "OAuth",
		note: null,
		probedAt: Date.now(),
		error: null,
	};

	try {
		const response = await fetch(`${PROVIDER_API_BASE.google}/v1beta/models`, {
			method: "GET",
			headers: { authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});

		if (response.status === 401) {
			result.error = "Google auth token expired \u2014 re-authenticate in pi settings.";
			return result;
		}
		if (!response.ok) {
			result.error = `Google API returned ${response.status}`;
			return result;
		}

		// Google's model listing typically doesn't include per-request rate limit
		// headers, but check for them anyway.
		const rateLimit = response.headers.get("x-ratelimit-limit");
		const rateRemaining = response.headers.get("x-ratelimit-remaining");
		const rateReset = response.headers.get("x-ratelimit-reset");

		if (rateLimit && rateRemaining) {
			const limit = Number.parseInt(rateLimit, 10);
			const remaining = Number.parseInt(rateRemaining, 10);
			if (Number.isFinite(limit) && Number.isFinite(remaining) && limit > 0) {
				const percentLeft = clampPercent((remaining / limit) * 100);
				upsertWindow(result.windows, {
					label: `Requests (${fmtTokens(limit)}/win)`,
					percentLeft,
					resetDescription: rateReset ? resetCountdown(rateReset) : null,
					windowMinutes: null,
				});
			}
		}

		if (result.windows.length === 0) {
			result.note = "Google API authenticated successfully; rate limit details are project-scoped.";
		}
	} catch (e) {
		if (e instanceof Error && e.name === "TimeoutError") {
			result.error = "Google API probe timed out";
		} else {
			result.error = e instanceof Error ? e.message : String(e);
		}
	}

	return result;
}

function hasProviderDisplayData(rl: ProviderRateLimits): boolean {
	return rl.windows.length > 0 || rl.credits !== null || Boolean(rl.account || rl.plan || rl.note || rl.error);
}

/** Map from ProviderKey to human-readable display name. */
function providerDisplayName(provider: ProviderKey): string {
	switch (provider) {
		case "anthropic":
			return "Anthropic";
		case "openai":
			return "OpenAI";
		case "google":
			return "Google";
	}
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

		let shouldWrite = false;
		const existing = config.deleteToLineStart;

		if (existing === undefined) {
			// Explicitly set [] so built-in default ctrl+u does not conflict.
			config.deleteToLineStart = [];
			shouldWrite = true;
		} else if (Array.isArray(existing)) {
			const filtered = existing.filter((binding) => {
				if (typeof binding !== "string") {
					return true;
				}
				return binding.trim().toLowerCase() !== "ctrl+u";
			});
			if (filtered.length !== existing.length) {
				config.deleteToLineStart = filtered;
				shouldWrite = true;
			}
		} else {
			// Malformed config; normalize to an explicit empty binding list.
			config.deleteToLineStart = [];
			shouldWrite = true;
		}

		if (shouldWrite) {
			writeFileSync(keybindingsPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
		}
	} catch {
		// Non-critical — worst case the warning still shows
	}
}

function getUsageHistoryPath(): string {
	return join(homedir(), ".pi", "agent", "usage-tracker-history.json");
}

export default function usageTracker(pi: ExtensionAPI) {
	// Unbind ctrl+u from deleteToLineStart so our shortcut wins cleanly
	ensureCtrlUUnbound();

	/** Per-model accumulated usage. Key = model ID. */
	const models = new Map<string, ModelUsage>();
	/** Per-source accumulated usage (session, ant-colony background, etc.). */
	const sources = new Map<string, SourceUsage>();
	/** Recent turn snapshots for pace calc. */
	const turnHistory: TurnSnapshot[] = [];
	/** Highest cost threshold already triggered. */
	let lastThresholdIndex = -1;
	/** Session start time. */
	let sessionStart = Date.now();
	/** Last known extension context (used for cross-extension usage events). */
	let activeCtx: ExtensionContext | null = null;
	/** Widget visibility. */
	let widgetVisible = true;
	/** Cached rate limit probes. */
	const rateLimits = new Map<string, ProviderRateLimits>();
	/** Last probe timestamp per provider (for cooldown). */
	const lastProbeTime = new Map<string, number>();
	/** Whether a probe is currently in flight. */
	const probeInFlight = new Set<string>();
	/** Persistent history file for rolling 30d totals. */
	const usageHistoryPath = getUsageHistoryPath();
	/** Rolling history points (cost + timestamp), persisted on disk. */
	const rollingHistory: HistoricalCostPoint[] = [];

	function pruneRollingHistory(now = Date.now()): void {
		const cutoff = now - ROLLING_COST_WINDOW_MS;
		for (let i = rollingHistory.length - 1; i >= 0; i--) {
			if (!Number.isFinite(rollingHistory[i].timestamp) || rollingHistory[i].timestamp < cutoff) {
				rollingHistory.splice(i, 1);
			}
		}
		if (rollingHistory.length > ROLLING_HISTORY_MAX_POINTS) {
			rollingHistory.splice(0, rollingHistory.length - ROLLING_HISTORY_MAX_POINTS);
		}
	}

	function getRolling30dCost(now = Date.now()): number {
		pruneRollingHistory(now);
		let total = 0;
		for (const point of rollingHistory) {
			total += point.cost;
		}
		return total;
	}

	function loadRollingHistory(): void {
		try {
			if (!existsSync(usageHistoryPath)) {
				return;
			}
			const raw = JSON.parse(readFileSync(usageHistoryPath, "utf-8")) as { entries?: unknown };
			if (!Array.isArray(raw.entries)) {
				return;
			}
			for (const item of raw.entries) {
				if (!item || typeof item !== "object") {
					continue;
				}
				const timestamp = Number((item as { timestamp?: unknown }).timestamp);
				const cost = Number((item as { cost?: unknown }).cost);
				if (!(Number.isFinite(timestamp) && Number.isFinite(cost)) || cost < 0) {
					continue;
				}
				rollingHistory.push({ timestamp, cost });
			}
			rollingHistory.sort((a, b) => a.timestamp - b.timestamp);
			pruneRollingHistory();
		} catch {
			// Non-critical. If history cannot be read, continue with in-memory tracking.
		}
	}

	function saveRollingHistory(): void {
		try {
			const dir = dirname(usageHistoryPath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}
			const payload = {
				version: 1,
				entries: rollingHistory,
			};
			writeFileSync(usageHistoryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
		} catch {
			// Non-critical. We still keep in-memory stats for current runtime.
		}
	}

	loadRollingHistory();

	// ─── Data collection ──────────────────────────────────────────────────

	function toFiniteNumber(value: unknown): number {
		const n = typeof value === "number" ? value : Number(value);
		return Number.isFinite(n) ? n : 0;
	}

	function sourceLabel(source: string, scope?: string): string {
		const base = source.trim() || "external";
		const scoped = scope?.trim();
		return scoped ? `${base}/${scoped}` : base;
	}

	function recordUsageSample(sample: UsageSample, options: { persist?: boolean } = {}): void {
		const now = Date.now();
		const input = Math.max(0, toFiniteNumber(sample.input));
		const output = Math.max(0, toFiniteNumber(sample.output));
		const cacheRead = Math.max(0, toFiniteNumber(sample.cacheRead));
		const cacheWrite = Math.max(0, toFiniteNumber(sample.cacheWrite));
		const cost = Math.max(0, toFiniteNumber(sample.costTotal));
		const modelKey = sample.model;

		const existing = models.get(modelKey);
		if (existing) {
			existing.turns += 1;
			existing.input += input;
			existing.output += output;
			existing.cacheRead += cacheRead;
			existing.cacheWrite += cacheWrite;
			existing.costTotal += cost;
			existing.lastSeen = now;
		} else {
			models.set(modelKey, {
				model: sample.model,
				provider: sample.provider,
				turns: 1,
				input,
				output,
				cacheRead,
				cacheWrite,
				costTotal: cost,
				firstSeen: now,
				lastSeen: now,
			});
		}

		const sourceKey = sample.source.trim() || "session";
		const sourceTotals = sources.get(sourceKey);
		if (sourceTotals) {
			sourceTotals.turns += 1;
			sourceTotals.input += input;
			sourceTotals.output += output;
			sourceTotals.cacheRead += cacheRead;
			sourceTotals.cacheWrite += cacheWrite;
			sourceTotals.costTotal += cost;
		} else {
			sources.set(sourceKey, {
				source: sourceKey,
				turns: 1,
				input,
				output,
				cacheRead,
				cacheWrite,
				costTotal: cost,
			});
		}

		turnHistory.push({ timestamp: now, tokens: input + output, cost });
		// Keep last 60 min
		const cutoff = now - 3_600_000;
		while (turnHistory.length > 0 && turnHistory[0].timestamp < cutoff) {
			turnHistory.shift();
		}

		if (options.persist !== false && Number.isFinite(cost) && cost >= 0) {
			rollingHistory.push({ timestamp: now, cost });
			pruneRollingHistory(now);
			saveRollingHistory();
		}
	}

	function recordUsage(msg: AssistantMessage, options: { persist?: boolean } = {}): void {
		recordUsageSample(
			{
				source: "session",
				model: msg.model,
				provider: msg.provider,
				input: msg.usage.input,
				output: msg.usage.output,
				cacheRead: msg.usage.cacheRead,
				cacheWrite: msg.usage.cacheWrite,
				costTotal: msg.usage.cost.total,
			},
			options,
		);
	}

	function parseExternalUsageSample(payload: unknown): UsageSample | null {
		if (!payload || typeof payload !== "object") {
			return null;
		}
		const data = payload as {
			source?: unknown;
			scope?: unknown;
			model?: unknown;
			provider?: unknown;
			usage?: unknown;
		};
		if (!data.usage || typeof data.usage !== "object") {
			return null;
		}
		const model = typeof data.model === "string" ? data.model.trim() : "";
		const provider = typeof data.provider === "string" ? data.provider.trim() : "";
		if (!(model && provider)) {
			return null;
		}
		const usage = data.usage as {
			input?: unknown;
			output?: unknown;
			cacheRead?: unknown;
			cacheWrite?: unknown;
			costTotal?: unknown;
			cost?: { total?: unknown };
		};
		const directCost = toFiniteNumber(usage.costTotal);
		const nestedCost = toFiniteNumber(usage.cost?.total);
		return {
			source: sourceLabel(
				typeof data.source === "string" ? data.source : "external",
				typeof data.scope === "string" ? data.scope : undefined,
			),
			model,
			provider,
			input: toFiniteNumber(usage.input),
			output: toFiniteNumber(usage.output),
			cacheRead: toFiniteNumber(usage.cacheRead),
			cacheWrite: toFiniteNumber(usage.cacheWrite),
			costTotal: directCost > 0 ? directCost : nestedCost,
		};
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
		const rolling30dCost = getRolling30dCost();
		return {
			input,
			output,
			cacheRead,
			cacheWrite,
			cost,
			turns,
			totalTokens,
			avgTokensPerTurn,
			avgCostPerTurn,
			rolling30dCost,
		};
	}

	function getExternalSources(): SourceUsage[] {
		return [...sources.values()]
			.filter((entry) => entry.source !== "session" && entry.turns > 0)
			.sort((a, b) => b.costTotal - a.costTotal);
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
		sources.clear();
		turnHistory.length = 0;
		lastThresholdIndex = -1;
		sessionStart = Date.now();
	}

	function hydrateFromSession(ctx: ExtensionContext): void {
		reset();
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "message" && entry.message.role === "assistant") {
				recordUsage(entry.message as AssistantMessage, { persist: false });
			}
		}
	}

	// ─── Rate limit probing ───────────────────────────────────────────────

	/**
	 * Probe a provider for rate limit data using pi-managed auth tokens.
	 * Reads credentials from `~/.pi/agent/auth.json` and calls the provider
	 * API directly — no external CLI tools required.
	 */
	async function probeProvider(provider: ProviderKey, force = false): Promise<void> {
		const now = Date.now();
		const last = lastProbeTime.get(provider) ?? 0;
		if ((!force && now - last < PROBE_COOLDOWN_MS) || probeInFlight.has(provider)) {
			return;
		}
		probeInFlight.add(provider);
		try {
			const auth = readPiAuth();
			let authKey: string | null = null;
			let authEntry: PiAuthEntry | undefined;

			// Find the auth entry for this provider
			for (const [key, entry] of Object.entries(auth)) {
				if (AUTH_KEY_TO_PROVIDER[key] === provider && entry.access) {
					authKey = key;
					authEntry = entry;
					break;
				}
			}

			if (!(authKey && authEntry)) {
				rateLimits.set(provider, {
					provider,
					windows: [],
					credits: null,
					account: null,
					plan: null,
					note: `No pi auth configured for ${providerDisplayName(provider)} \u2014 run pi login.`,
					probedAt: now,
					error: null,
				});
				lastProbeTime.set(provider, now);
				return;
			}

			// Ensure the token is fresh — auto-refresh expired OAuth tokens
			const fresh = await ensureFreshToken(authKey, authEntry, auth);
			if (!fresh) {
				rateLimits.set(provider, {
					provider,
					windows: [],
					credits: null,
					account: null,
					plan: null,
					note: null,
					probedAt: now,
					error: `${providerDisplayName(provider)} token refresh failed \u2014 re-authenticate with pi login.`,
				});
				lastProbeTime.set(provider, now);
				return;
			}

			let limits: ProviderRateLimits;
			switch (provider) {
				case "anthropic":
					limits = await probeAnthropicDirect(fresh.token);
					break;
				case "openai":
					limits = await probeOpenAIDirect(fresh.token);
					break;
				case "google":
					limits = await probeGoogleDirect(fresh.token, fresh.entry);
					break;
			}

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
			probeProvider("anthropic", force);
		}
		if (id.includes("gpt") || id.includes("o1") || id.includes("o3") || id.includes("o4") || id.includes("codex")) {
			probeProvider("openai", force);
		}
		if (id.includes("gemini") || id.includes("flash") || id.includes("pro-exp") || id.includes("antigravity")) {
			probeProvider("google", force);
		}
	}

	/**
	 * Probe all providers that have auth configured in pi.
	 * Used when opening the dashboard overlay to show complete status.
	 */
	function triggerProbeAll(force = false): void {
		const auth = readPiAuth();
		const seen = new Set<ProviderKey>();
		for (const key of Object.keys(auth)) {
			const provider = AUTH_KEY_TO_PROVIDER[key];
			if (provider && !seen.has(provider)) {
				seen.add(provider);
				probeProvider(provider, force);
			}
		}
	}

	// ─── Inter-extension event broadcasting ──────────────────────────────

	/**
	 * Broadcast current usage/rate-limit data to other extensions via `pi.events`.
	 *
	 * The ant-colony budget-planner listens on `"usage:limits"` to receive:
	 * - Provider rate limit windows (Anthropic, OpenAI, Google rate limits)
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
		const perSource: Record<string, SourceUsage> = {};
		for (const [key, value] of sources) {
			perSource[key] = { ...value };
		}
		pi.events.emit("usage:limits", {
			providers,
			sessionCost: totals.cost,
			rolling30dCost: totals.rolling30dCost,
			perModel,
			perSource,
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

	pi.events.on("usage:record", (payload) => {
		const sample = parseExternalUsageSample(payload);
		if (!sample) {
			return;
		}
		recordUsageSample(sample);
		if (activeCtx) {
			checkThresholds(activeCtx);
		}
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
			const name = providerDisplayName(rl.provider);
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

			const name = providerDisplayName(rl.provider);
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
			const name = providerDisplayName(rl.provider);
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

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Plain-text report combines many optional telemetry sections.
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
		lines.push(`30d total cost: ${fmtCost(totals.rolling30dCost)}`);
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

		const externalSources = getExternalSources();
		if (externalSources.length > 0) {
			const externalTotalCost = externalSources.reduce((sum, source) => sum + source.costTotal, 0);
			const externalTurns = externalSources.reduce((sum, source) => sum + source.turns, 0);
			const externalTokens = externalSources.reduce((sum, source) => sum + source.input + source.output, 0);
			lines.push(
				`External inference: ${fmtCost(externalTotalCost)} across ${externalTurns} turns (${fmtTokens(externalTokens)} tokens)`,
			);
			for (const source of externalSources) {
				lines.push(
					`  - ${source.source}: ${fmtCost(source.costTotal)}, ${source.turns} turns, ${fmtTokens(source.input)} in / ${fmtTokens(source.output)} out`,
				);
			}
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
			`  ${theme.fg("accent", "30d    ")}${sep}${theme.fg("warning", fmtCost(totals.rolling30dCost))} ${theme.fg("dim", "total cost")}`,
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

		const externalSources = getExternalSources();
		if (externalSources.length > 0) {
			const externalTotalCost = externalSources.reduce((sum, source) => sum + source.costTotal, 0);
			const externalTurns = externalSources.reduce((sum, source) => sum + source.turns, 0);
			const externalTokens = externalSources.reduce((sum, source) => sum + source.input + source.output, 0);
			lines.push(
				`  ${theme.fg("accent", "External")}${sep}${theme.fg("warning", fmtCost(externalTotalCost))}${sep}${externalTurns} turns${sep}${fmtTokens(externalTokens)} tokens`,
			);
			for (const source of externalSources.slice(0, 4)) {
				lines.push(
					`    ${theme.fg("dim", source.source)}${sep}${theme.fg("warning", fmtCost(source.costTotal))}${sep}${source.turns} turns${sep}${fmtTokens(source.input)} in / ${fmtTokens(source.output)} out`,
				);
			}
			if (externalSources.length > 4) {
				lines.push(`    ${theme.fg("dim", `+${externalSources.length - 4} more sources`)}`);
			}
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

		// Session + rolling 30d cost (only if we have data)
		if (totals.turns > 0) {
			parts.push(theme.fg("warning", `💰${fmtCost(totals.cost)}`));
			parts.push(theme.fg("dim", `30d: ${fmtCost(totals.rolling30dCost)}`));
			parts.push(`${theme.fg("success", fmtTokens(totals.input))}/${theme.fg("warning", fmtTokens(totals.output))}`);
		}

		const externalSources = getExternalSources();
		if (externalSources.length > 0) {
			const externalCost = externalSources.reduce((sum, source) => sum + source.costTotal, 0);
			parts.push(theme.fg("warning", `🐜${fmtCost(externalCost)}`));
		}

		if (parts.length === 0) {
			return []; // Nothing to show yet
		}

		return [parts.join(sep)];
	}

	// ─── Event handlers ───────────────────────────────────────────────────

	pi.on("session_start", (_event, ctx) => {
		activeCtx = ctx;
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
		activeCtx = ctx;
		hydrateFromSession(ctx);
		triggerProbe(ctx);
	});

	pi.on("turn_end", (event, ctx) => {
		activeCtx = ctx;
		if (event.message.role === "assistant") {
			recordUsage(event.message as unknown as AssistantMessage);
			checkThresholds(ctx);
			triggerProbe(ctx); // Refresh rate limits after each turn
			broadcastUsageData(); // Notify other extensions (ant-colony budget planner)
		}
	});

	pi.on("model_select", (_event, ctx) => {
		activeCtx = ctx;
		triggerProbe(ctx); // Probe the new provider
	});

	// ─── /usage command ───────────────────────────────────────────────────

	pi.registerCommand("usage", {
		description: "Show rate limits, token usage, and cost breakdown",
		async handler(_args, ctx) {
			// Force a fresh probe of all configured providers before showing
			triggerProbeAll(true);
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
		description: "Force refresh rate limit data from provider APIs",
		async handler(_args, ctx) {
			// Clear cooldowns to force fresh probes
			lastProbeTime.clear();
			triggerProbeAll(true);
			ctx.ui.notify("Refreshing rate limits...", "info");
		},
	});

	// ─── usage_report tool ────────────────────────────────────────────────

	pi.registerTool({
		name: "usage_report",
		label: "Usage Report",
		description:
			"Generate a rate limit status and token usage report. Shows provider rate limits (Anthropic, OpenAI, Google) using pi-managed auth, plus per-model costs. Use when the user asks about spending, rate limits, quotas, or remaining usage.",
		promptSnippet: "Show provider rate limits (% remaining, reset time) and session usage/cost report.",
		parameters: Type.Object({
			format: Type.Optional(
				Type.Union([Type.Literal("summary"), Type.Literal("detailed")], {
					description: "'summary' for rate limits only, 'detailed' for full breakdown. Default: detailed.",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			// Force a probe of all configured providers before reporting
			triggerProbeAll(true);
			await new Promise((resolve) => setTimeout(resolve, 1000));

			const format = params.format ?? "detailed";
			let text: string;

			if (format === "summary") {
				const rlText = renderRateLimitsPlain();
				const totals = getTotals();
				const externalSources = getExternalSources();
				const externalCost = externalSources.reduce((sum, source) => sum + source.costTotal, 0);
				const externalText = externalCost > 0 ? ` | external: ${fmtCost(externalCost)}` : "";
				const sessionLine = `Session: ${fmtCost(totals.cost)} cost, ${totals.turns} turns, ${fmtTokens(totals.input)} in / ${fmtTokens(totals.output)} out | 30d: ${fmtCost(totals.rolling30dCost)}${externalText}`;
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
			triggerProbeAll(true);
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
