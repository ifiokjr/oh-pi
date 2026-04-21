import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { clampPercent, fmtDuration, fmtTokens, upsertWindow } from "./usage-tracker-formatting.js";
import {
	type PiAuthEntry,
	PROBE_TIMEOUT_MS,
	type ProviderKey,
	type ProviderRateLimits,
} from "./usage-tracker-shared.js";

// Pre-compiled regex for OpenAI-style compact duration parsing
const OPENAI_DURATION_RE = /(\d+(?:\.\d+)?)(ms|s|m|h)/g;

// ─── pi-managed auth ─────────────────────────────────────────────────────────

/** Map from auth.json key to ProviderKey. */
export const AUTH_KEY_TO_PROVIDER: Record<string, ProviderKey> = {
	anthropic: "anthropic",
	"openai-codex": "openai",
	"google-antigravity": "google",
	"google-gemini-cli": "google",
	"ollama-cloud": "ollama",
};

/** Provider API base URLs used by direct usage/rate-limit probes. */
const PROVIDER_API_BASE: Record<ProviderKey, string> = {
	anthropic: "https://api.anthropic.com",
	openai: "https://chatgpt.com/backend-api",
	google: "https://cloudcode-pa.googleapis.com",
	ollama: "https://ollama.com",
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
	return join(getAgentDir(), "auth.json");
}

/** Read pi's auth config from ~/.pi/agent/auth.json. */
export function readPiAuth(): Record<string, PiAuthEntry> {
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
export async function ensureFreshToken(
	authKey: string,
	entry: PiAuthEntry,
	allAuth: Record<string, PiAuthEntry>,
): Promise<{ token: string; entry: PiAuthEntry } | null> {
	if (Date.now() < entry.expires && entry.access) {
		return { token: entry.access, entry };
	}

	if (authKey === "ollama-cloud") {
		const token = entry.access || entry.refresh;
		return token ? { token, entry: { ...entry, access: token, refresh: entry.refresh || token } } : null;
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
	OPENAI_DURATION_RE.lastIndex = 0;
	const matches = [...isoOrDuration.matchAll(OPENAI_DURATION_RE)];
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

function parseFiniteNumber(value: unknown): number | null {
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(parsed)) {
		return null;
	}
	return parsed;
}

function countdownFromSeconds(seconds: unknown): string | null {
	const parsed = parseFiniteNumber(seconds);
	if (parsed === null) {
		return null;
	}
	if (parsed <= 0) {
		return "now";
	}
	return `in ${fmtDuration(parsed * 1000)}`;
}

function windowLabelFromSeconds(seconds: number): string {
	if (seconds <= 0 || !Number.isFinite(seconds)) {
		return "window";
	}
	if (seconds % 604_800 === 0) {
		const weeks = seconds / 604_800;
		return `${weeks}w`;
	}
	if (seconds % 86_400 === 0) {
		const days = seconds / 86_400;
		return `${days}d`;
	}
	if (seconds % 3_600 === 0) {
		const hours = seconds / 3_600;
		return `${hours}h`;
	}
	if (seconds % 60 === 0) {
		const minutes = seconds / 60;
		return `${minutes}m`;
	}
	return `${Math.round(seconds)}s`;
}

function appendNote(existing: string | null, next: string): string {
	return existing ? `${existing} ${next}` : next;
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
	// Anthropic OAuth usage reports utilization as a percentage in [0,100]
	// (e.g. 1.0 means 1% used, not 100% used).
	const usedPercent = utilization;
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
export async function probeAnthropicDirect(token: string): Promise<ProviderRateLimits> {
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
function hydrateOpenAIFromJwt(result: ProviderRateLimits, token: string): { accountId: string | null } {
	const jwt = decodeJwtPayload(token);
	if (!jwt) {
		return { accountId: null };
	}
	const profile = jwt["https://api.openai.com/profile"] as { email?: string } | undefined;
	if (profile?.email) {
		result.account = profile.email;
	}
	const auth = jwt["https://api.openai.com/auth"] as Record<string, unknown> | undefined;
	const planType = typeof auth?.chatgpt_plan_type === "string" ? auth.chatgpt_plan_type : null;
	if (planType) {
		result.plan = planType;
	}
	const accountId = typeof auth?.chatgpt_account_id === "string" ? auth.chatgpt_account_id : null;
	return { accountId };
}

function maybeAddOpenAIWhamWindow(
	result: ProviderRateLimits,
	groupLabel: string,
	windowLabel: string,
	window: unknown,
): void {
	if (!(window && typeof window === "object")) {
		return;
	}

	const typed = window as Record<string, unknown>;

	const usedPercent = parseFiniteNumber(typed.used_percent);
	if (usedPercent === null) {
		return;
	}

	const windowSeconds = parseFiniteNumber(typed.limit_window_seconds);
	const roundedWindowSeconds = windowSeconds !== null && windowSeconds > 0 ? Math.round(windowSeconds) : null;
	const labelSuffix = roundedWindowSeconds ? windowLabelFromSeconds(roundedWindowSeconds) : windowLabel;
	const resetFromDuration = countdownFromSeconds(typed.reset_after_seconds);
	const resetAtSeconds = parseFiniteNumber(typed.reset_at);
	const resetFromTimestamp = resetAtSeconds === null ? null : countdownFromSeconds(resetAtSeconds - Date.now() / 1000);

	upsertWindow(result.windows, {
		label: `${groupLabel} (${labelSuffix})`,
		percentLeft: clampPercent(100 - usedPercent),
		resetDescription: resetFromDuration ?? resetFromTimestamp,
		windowMinutes: roundedWindowSeconds ? Math.max(1, Math.round(roundedWindowSeconds / 60)) : null,
	});
}

function maybeAddOpenAIWhamRateLimitGroup(result: ProviderRateLimits, groupLabel: string, group: unknown): void {
	if (!(group && typeof group === "object")) {
		return;
	}

	const typed = group as Record<string, unknown>;

	if (typed.allowed === false) {
		result.note = appendNote(result.note, `${groupLabel} currently blocked.`);
	}
	if (typed.limit_reached === true) {
		result.note = appendNote(result.note, `${groupLabel} limit reached.`);
	}

	maybeAddOpenAIWhamWindow(result, groupLabel, "primary", typed.primary_window);
	maybeAddOpenAIWhamWindow(result, groupLabel, "secondary", typed.secondary_window);
}

/**
 * Probe OpenAI ChatGPT backend for Codex usage/rate limits.
 *
 * Codex OAuth tokens can query `GET /backend-api/wham/usage`, which exposes
 * the active 5-hour/weekly windows plus additional model-specific limits.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: provider probe handles endpoint status variants and nested window payloads.
export async function probeOpenAIDirect(token: string): Promise<ProviderRateLimits> {
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

	const { accountId } = hydrateOpenAIFromJwt(result, token);

	try {
		const headers: Record<string, string> = {
			authorization: `Bearer ${token}`,
			accept: "application/json",
		};
		if (accountId) {
			headers["chatgpt-account-id"] = accountId;
		}

		const response = await fetch(`${PROVIDER_API_BASE.openai}/wham/usage`, {
			method: "GET",
			headers,
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});

		if (response.status === 401) {
			result.error = "OpenAI auth token expired — re-authenticate in pi settings.";
			return result;
		}
		if (response.status === 429) {
			const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
			const retryHint = Number.isFinite(retryAfter) ? ` (retry in ${fmtDuration(Math.max(0, retryAfter) * 1000)})` : "";
			result.note = `OpenAI usage endpoint is rate-limited${retryHint}.`;
			return result;
		}
		if (!response.ok) {
			result.note = `OpenAI usage endpoint returned ${response.status} — rate limit details unavailable.`;
			return result;
		}

		const payload = (await response.json()) as Record<string, unknown>;
		if (typeof payload.plan_type === "string") {
			result.plan = payload.plan_type;
		}
		if (typeof payload.email === "string") {
			result.account = payload.email;
		}

		const credits = payload.credits;
		if (credits && typeof credits === "object") {
			const typedCredits = credits as { unlimited?: unknown; balance?: unknown };
			if (typedCredits.unlimited === true) {
				result.note = appendNote(result.note, "Credits are unlimited.");
			} else {
				const balance = parseFiniteNumber(typedCredits.balance);
				if (balance !== null) {
					result.credits = balance;
				}
			}
		}

		maybeAddOpenAIWhamRateLimitGroup(result, "Codex", payload.rate_limit);
		maybeAddOpenAIWhamRateLimitGroup(result, "Code Review", payload.code_review_rate_limit);

		const additionalRateLimits = payload.additional_rate_limits;
		if (Array.isArray(additionalRateLimits)) {
			for (const item of additionalRateLimits) {
				if (!(item && typeof item === "object")) {
					continue;
				}
				const typedItem = item as Record<string, unknown>;
				const label =
					typeof typedItem.limit_name === "string"
						? typedItem.limit_name
						: typeof typedItem.metered_feature === "string"
							? typedItem.metered_feature
							: "Additional";
				maybeAddOpenAIWhamRateLimitGroup(result, label, typedItem.rate_limit);
			}
		}

		if (result.windows.length === 0) {
			result.note = appendNote(result.note, "OpenAI usage response did not include window data.");
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

const GOOGLE_CLIENT_METADATA = {
	ideType: "IDE_UNSPECIFIED",
	platform: "PLATFORM_UNSPECIFIED",
	pluginType: "GEMINI",
};

function googleCodeAssistHeaders(token: string): Record<string, string> {
	return {
		authorization: `Bearer ${token}`,
		"content-type": "application/json",
		"user-agent": "google-cloud-sdk vscode_cloudshelleditor/0.1",
		"x-goog-api-client": "gl-node/22.17.0",
		"client-metadata": JSON.stringify(GOOGLE_CLIENT_METADATA),
	};
}

async function hydrateGoogleAccount(result: ProviderRateLimits, token: string): Promise<void> {
	if (result.account) {
		return;
	}
	try {
		const response = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
			method: "GET",
			headers: { authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
		if (!response.ok) {
			return;
		}
		const payload = (await response.json()) as { email?: unknown };
		if (typeof payload.email === "string") {
			result.account = payload.email;
		}
	} catch {
		// Optional enrichment only.
	}
}

/**
 * Probe Google Cloud Code Assist for subscription/project metadata.
 *
 * OAuth tokens used by pi target Cloud Code Assist endpoints (not
 * generativelanguage.googleapis.com), so we probe `loadCodeAssist`.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: provider probe handles auth status, tier parsing, and optional account hydration.
export async function probeGoogleDirect(token: string, authEntry?: PiAuthEntry): Promise<ProviderRateLimits> {
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
		const body: Record<string, unknown> = {
			metadata: {
				...GOOGLE_CLIENT_METADATA,
				...(authEntry?.projectId ? { duetProject: authEntry.projectId } : {}),
			},
			...(authEntry?.projectId ? { cloudaicompanionProject: authEntry.projectId } : {}),
		};

		const response = await fetch(`${PROVIDER_API_BASE.google}/v1internal:loadCodeAssist`, {
			method: "POST",
			headers: googleCodeAssistHeaders(token),
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});

		if (response.status === 401) {
			result.error = "Google auth token expired — re-authenticate in pi settings.";
			return result;
		}
		if (!response.ok) {
			result.error = `Google Cloud Code Assist API returned ${response.status}`;
			return result;
		}

		const payload = (await response.json()) as Record<string, unknown>;
		const currentTier = payload.currentTier as { id?: unknown; name?: unknown; description?: unknown } | undefined;
		const tierId = typeof currentTier?.id === "string" ? currentTier.id : null;
		const tierName = typeof currentTier?.name === "string" ? currentTier.name : null;
		const tierDescription = typeof currentTier?.description === "string" ? currentTier.description : null;
		if (tierName && tierId) {
			result.plan = `${tierName} (${tierId})`;
		} else if (tierName) {
			result.plan = tierName;
		} else if (tierId) {
			result.plan = tierId;
		}
		if (tierDescription?.toLowerCase().includes("unlimited")) {
			upsertWindow(result.windows, {
				label: "Subscription quota",
				percentLeft: 100,
				resetDescription: null,
				windowMinutes: null,
			});
			result.note = appendNote(result.note, "Tier reports unlimited coding assistant capacity.");
		}

		const projectId =
			typeof payload.cloudaicompanionProject === "string"
				? payload.cloudaicompanionProject
				: (authEntry?.projectId ?? null);
		if (projectId) {
			result.note = appendNote(result.note, `Project: ${projectId}.`);
		}

		const rateLimit = parseFiniteNumber(response.headers.get("x-ratelimit-limit"));
		const rateRemaining = parseFiniteNumber(response.headers.get("x-ratelimit-remaining"));
		const rateReset = response.headers.get("x-ratelimit-reset");
		if (rateLimit !== null && rateRemaining !== null && rateLimit > 0) {
			upsertWindow(result.windows, {
				label: `Requests (${fmtTokens(Math.round(rateLimit))}/win)`,
				percentLeft: clampPercent((rateRemaining / rateLimit) * 100),
				resetDescription: rateReset ? resetCountdown(rateReset) : null,
				windowMinutes: null,
			});
		}

		if (result.windows.length === 0) {
			result.note = appendNote(result.note, "Rate limit windows are project-scoped and not exposed by this API.");
		}

		await hydrateGoogleAccount(result, token);
	} catch (e) {
		if (e instanceof Error && e.name === "TimeoutError") {
			result.error = "Google API probe timed out";
		} else {
			result.error = e instanceof Error ? e.message : String(e);
		}
	}

	return result;
}

function getEnv(name: string): string | null {
	const value = process.env[name];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stripTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

function normalizeOllamaApiUrl(value: string, fallbackOrigin: string): string {
	try {
		const url = new URL(value);
		if (url.pathname === "" || url.pathname === "/") {
			url.pathname = "/v1";
		}
		url.search = "";
		url.hash = "";
		return stripTrailingSlash(url.toString());
	} catch {
		return `${stripTrailingSlash(fallbackOrigin)}/v1`;
	}
}

function deriveOllamaOrigin(apiUrl: string, fallbackOrigin: string): string {
	try {
		const url = new URL(apiUrl);
		url.pathname = "";
		url.search = "";
		url.hash = "";
		return stripTrailingSlash(url.toString());
	} catch {
		return stripTrailingSlash(fallbackOrigin);
	}
}

function maybeAddGenericRateLimitWindow(
	result: ProviderRateLimits,
	headers: Headers | { get: (key: string) => string | null },
): void {
	const limit = parseFiniteNumber(headers.get("x-ratelimit-limit") ?? headers.get("ratelimit-limit"));
	const remaining = parseFiniteNumber(headers.get("x-ratelimit-remaining") ?? headers.get("ratelimit-remaining"));
	const reset = headers.get("x-ratelimit-reset") ?? headers.get("ratelimit-reset");
	if (limit === null || remaining === null || limit <= 0) {
		return;
	}
	upsertWindow(result.windows, {
		label: `Requests (${fmtTokens(Math.round(limit))}/win)`,
		percentLeft: clampPercent((remaining / limit) * 100),
		resetDescription: reset ? resetCountdown(reset) : null,
		windowMinutes: null,
	});
}

export async function probeOllamaDirect(token: string | null): Promise<ProviderRateLimits> {
	const result: ProviderRateLimits = {
		provider: "ollama",
		windows: [],
		credits: null,
		account: null,
		plan: token ? "API key" : null,
		note: null,
		probedAt: Date.now(),
		error: null,
	};

	const localBase = normalizeOllamaApiUrl(getEnv("OLLAMA_HOST") ?? "http://127.0.0.1:11434", "http://127.0.0.1:11434");
	const cloudBase = normalizeOllamaApiUrl(
		getEnv("OLLAMA_HOST_CLOUD") ?? PROVIDER_API_BASE.ollama,
		PROVIDER_API_BASE.ollama,
	);
	const localOrigin = deriveOllamaOrigin(localBase, "http://127.0.0.1:11434");

	let localNote: string;
	try {
		const response = await fetch(`${localBase}/models`, {
			method: "GET",
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
		if (response.ok) {
			const payload = (await response.json()) as { data?: Array<{ id?: string }> };
			localNote = `Local daemon reachable at ${localOrigin} (${payload.data?.length ?? 0} model(s)).`;
		} else {
			localNote = `Local daemon unavailable at ${localOrigin} (${response.status}).`;
		}
	} catch {
		localNote = `Local daemon unavailable at ${localOrigin}.`;
	}

	let cloudNote: string;
	if (token) {
		try {
			const response = await fetch(`${cloudBase}/models`, {
				method: "GET",
				headers: { authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
			});
			if (response.status === 401) {
				cloudNote = "Cloud auth was rejected — run /login ollama-cloud again.";
			} else if (response.ok) {
				const payload = (await response.json()) as { data?: Array<{ id?: string }> };
				maybeAddGenericRateLimitWindow(result, response.headers);
				cloudNote = `Cloud auth configured (${payload.data?.length ?? 0} model(s)).`;
			} else {
				cloudNote = `Cloud API returned ${response.status}.`;
			}
		} catch {
			cloudNote = "Cloud API unavailable.";
		}
	} else {
		cloudNote = "Cloud auth not configured.";
	}

	result.note = `${localNote} ${cloudNote}`;
	if (result.windows.length === 0) {
		result.note = appendNote(
			result.note,
			"Ollama does not currently expose a documented quota endpoint to pi, so remaining account limits are unavailable.",
		);
	}
	return result;
}

export function hasProviderDisplayData(rl: ProviderRateLimits): boolean {
	return rl.windows.length > 0 || rl.credits !== null || Boolean(rl.account || rl.plan || rl.note || rl.error);
}

export function shouldPreserveStaleWindows(
	previous: ProviderRateLimits | undefined,
	next: ProviderRateLimits,
): boolean {
	if (!previous || previous.windows.length === 0 || next.windows.length > 0 || next.error) {
		return false;
	}
	const note = next.note?.toLowerCase() ?? "";
	return note.includes("rate-limited") || note.includes("unavailable");
}

/** Map from ProviderKey to human-readable display name. */
export function providerDisplayName(provider: ProviderKey): string {
	switch (provider) {
		case "anthropic":
			return "Anthropic";
		case "openai":
			return "OpenAI";
		case "google":
			return "Google";
		case "ollama":
			return "Ollama";
	}
}
