/**
 * Oh-pi Secret Guard Extension — prevent secrets from reaching the LLM
 *
 * Scans all messages before they reach the LLM for secret patterns (API keys,
 * tokens, passwords, private keys, env-var values, etc.) and redacts them.
 * This prevents accidental leakage of credentials through conversation context,
 * file reads, or tool output.
 *
 * Detection strategies:
 * 1. **Pattern-based** — regexes for common secret formats (AWS keys, GitHub
 *    tokens, JWT patterns, private keys, connection strings, etc.)
 * 2. **Environment-based** — reads secrets from env vars with
 *    secret-sounding names and redacts their values when found in text.
 *
 * Redacted text is replaced with `[REDACTED:<label>]` so the agent knows
 * something was removed.
 *
 * Configuration (via PI_SECRET_GUARD env vars):
 * - `PI_SECRET_GUARD_LEVEL` — "off" | "patterns" (default) | "env" | "all"
 * - `PI_SECRET_GUARD_EXTRA_PATTERNS` — JSON array of `{pattern, label}` objects
 *
 * Retroactive scrubbing of existing session logs:
 *   npx tsx ~/.pi/agent/scripts/pi-scrub-secrets.ts           # dry run
 *   npx tsx ~/.pi/agent/scripts/pi-scrub-secrets.ts --apply   # modify files
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ── Redaction level ─────────────────────────────────────────────────────────

type GuardLevel = "off" | "patterns" | "env" | "all";

function getGuardLevel(): GuardLevel {
	const raw = process.env.PI_SECRET_GUARD_LEVEL?.toLowerCase()?.trim();
	switch (raw) {
		case "off":
			return "off";
		case "patterns":
			return "patterns";
		case "env":
			return "env";
		case "all":
			return "all";
		default:
			return "patterns";
	}
}

// ── Built-in secret patterns ────────────────────────────────────────────────

interface SecretPattern {
	/** Regex to match the secret value. */
	pattern: RegExp;
	/** Short label used in the redaction marker. */
	label: string;
}

const BUILTIN_PATTERNS: SecretPattern[] = [
	// AWS
	{ pattern: /AKIA[0-9A-Z]{16}/g, label: "AWS_ACCESS_KEY_ID" },

	// GitHub
	{ pattern: /ghp_[0-9a-zA-Z]{36,}/g, label: "GH_PAT" },
	{ pattern: /gho_[0-9a-zA-Z]{36,}/g, label: "GH_OAUTH" },
	{ pattern: /ghu_[0-9a-zA-Z]{36,}/g, label: "GH_USER_TOKEN" },
	{ pattern: /ghs_[0-9a-zA-Z]{36,}/g, label: "GH_APP_TOKEN" },
	{ pattern: /ghr_[0-9a-zA-Z]{36,}/g, label: "GH_REFRESH_TOKEN" },
	{ pattern: /github_pat_[0-9a-zA-Z_]{82}/g, label: "GH_FINE_GRAINED_PAT" },

	// GitLab
	{ pattern: /glpat-[0-9a-zA-Z\-]{20,}/g, label: "GL_PAT" },

	// Slack
	{ pattern: /xoxb-[0-9]{10,13}-[0-9]{10,13}-[0-9a-zA-Z]{24,34}/g, label: "SLACK_BOT_TOKEN" },
	{ pattern: /xoxp-[0-9]{10,13}-[0-9]{10,13}-[0-9]{10,13}-[0-9a-zA-Z]{24,34}/g, label: "SLACK_USER_TOKEN" },
	{ pattern: /xoxa-[0-9]{10,13}-[0-9]{10,13}-[0-9]{10,13}-[0-9a-zA-Z]{24,34}/g, label: "SLACK_APP_TOKEN" },

	// Stripe
	{ pattern: /sk_live_[0-9a-zA-Z]{24,99}/g, label: "STRIPE_SECRET_KEY" },
	{ pattern: /sk_test_[0-9a-zA-Z]{24,99}/g, label: "STRIPE_TEST_KEY" },
	{ pattern: /rk_live_[0-9a-zA-Z]{24,99}/g, label: "STRIPE_RESTRICTED_KEY" },

	// Private keys (PEM)
	{ pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g, label: "PRIVATE_KEY_BEGIN" },
	{ pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g, label: "PGP_PRIVATE_KEY_BEGIN" },

	// JWT (at least 3 dot-separated segments, base64url chars)
	{ pattern: /eyJ[0-9a-zA-Z_-]{10,}\.eyJ[0-9a-zA-Z_-]{10,}\.[0-9a-zA-Z_-]{10,}/g, label: "JWT" },

	// Connection strings with passwords
	{ pattern: /(?:mongodb|postgres|postgresql|mysql|redis|amqp):\/\/[^:\s]+:([^@\s]{3,})@/g, label: "DB_PASSWORD" },

	// Generic env-var assignments in text (KEY=VALUE where KEY looks secret)
	{ pattern: /(?<=(?:^|[\s"'`]))([A-Z_][A-Z0-9_]{0,}(?:PASSWORD|SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL|AUTH)[A-Z0-9_]*)=([^\s"'`]{8,})/gm, label: "ENV_SECRET" },

	// Heroku
	{ pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, label: "HEROKU_API_KEY" },

	// NPM tokens
	{ pattern: /npm_[0-9a-zA-Z]{36,}/g, label: "NPM_TOKEN" },

	// Docker
	{ pattern: /dckr_pat_[0-9a-zA-Z]{22,}/g, label: "DOCKER_PAT" },

	// Anthropic
	{ pattern: /sk-ant-api[0-9a-z]{2}-[0-9a-zA-Z_-]{20,}/g, label: "ANTHROPIC_API_KEY" },

	// OpenAI
	{ pattern: /sk-[0-9a-zA-Z]{20,}(?:T3BlbnFpX2tleSB[0-9a-zA-Z_-]+)?/g, label: "OPENAI_API_KEY" },

	// Google Cloud service account keys (JSON blocks)
	{ pattern: /"type"\s*:\s*"service_account"/g, label: "GCP_SERVICE_ACCOUNT" },

	// Azure connection strings
	{ pattern: /(?:DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=)[0-9a-zA-Z+/=]{40,}/g, label: "AZURE_STORAGE_KEY" },
];

// ── Environment-based secret detection ──────────────────────────────────────

/** Environment variable name substrings that indicate secrets. */
const SECRET_ENV_PATTERNS = [
	"PASSWORD",
	"SECRET",
	"TOKEN",
	"API_KEY",
	"ACCESS_KEY",
	"PRIVATE_KEY",
	"CREDENTIAL",
	"AUTH",
	"DATABASE_URL",
	"CONNECTION_STRING",
	"CONNECTIONSTRING",
];

/** Env vars that should never be redacted (common non-secret vars). */
const ALLOWED_ENV_VARS = new Set([
	"PATH",
	"HOME",
	"USER",
	"SHELL",
	"TERM",
	"LANG",
	"LC_ALL",
	"PWD",
	"OLDPWD",
	"EDITOR",
	"PAGER",
	"TZ",
	"HOSTNAME",
	"DOCKER_HOST",
	"DISPLAY",
	"XDG_CONFIG_HOME",
	"XDG_DATA_HOME",
	"XDG_CACHE_HOME",
	"NODE_ENV",
	"NPM_CONFIG_REGISTRY",
]);

interface EnvSecret {
	name: string;
	value: string;
}

let cachedEnvSecrets: EnvSecret[] | null = null;
let cachedEnvSecretsTime = 0;
const ENV_CACHE_MS = 30_000; // Re-scan env every 30s

/** Get secret values from environment variables. */
function getEnvSecrets(): EnvSecret[] {
	const now = Date.now();
	if (cachedEnvSecrets && now - cachedEnvSecretsTime < ENV_CACHE_MS) {
		return cachedEnvSecrets;
	}

	const secrets: EnvSecret[] = [];
	for (const [name, value] of Object.entries(process.env)) {
		if (!value || value.length < 4) continue;
		if (ALLOWED_ENV_VARS.has(name)) continue;

		const upperName = name.toUpperCase();
		const isSecretVar = SECRET_ENV_PATTERNS.some((pattern) => upperName.includes(pattern));
		if (isSecretVar) {
			secrets.push({ name, value });
		}
	}

	// Sort longest-first to avoid partial redaction (e.g., if one value contains another)
	secrets.sort((a, b) => b.value.length - a.value.length);

	cachedEnvSecrets = secrets;
	cachedEnvSecretsTime = now;
	return secrets;
}

// ── Extra patterns from env config ──────────────────────────────────────────

let extraPatterns: SecretPattern[] | null = null;

function getExtraPatterns(): SecretPattern[] {
	if (extraPatterns !== null) return extraPatterns;

	const raw = process.env.PI_SECRET_GUARD_EXTRA_PATTERNS?.trim();
	if (!raw) {
		extraPatterns = [];
		return extraPatterns;
	}

	try {
		const parsed = JSON.parse(raw) as Array<{ pattern: string; label: string }>;
		extraPatterns = parsed.map((p) => ({
			pattern: new RegExp(p.pattern, "g"),
			label: p.label,
		}));
	} catch {
		extraPatterns = [];
	}
	return extraPatterns;
}

// ── Redaction engine ─────────────────────────────────────────────────────────

/** Replace all occurrences of secret values in text with `[REDACTED:<label>]`. */
function redactText(text: string): string {
	const level = getGuardLevel();
	if (level === "off") return text;

	let result = text;

	// Pattern-based redaction
	if (level === "patterns" || level === "all") {
		const allPatterns = [...BUILTIN_PATTERNS, ...getExtraPatterns()];
		for (const { pattern, label } of allPatterns) {
			// Reset regex state (we use /g flag)
			pattern.lastIndex = 0;
			result = result.replace(pattern, `[REDACTED:${label}]`);
		}
	}

	// Environment-based redaction
	if (level === "env" || level === "all") {
		const envSecrets = getEnvSecrets();
		for (const { name, value } of envSecrets) {
			// Skip values that are too short or obviously non-secret
			if (value.length < 6) continue;
			// Avoid redacting common placeholder words
			if (/^(true|false|null|undefined|none|empty)$/i.test(value)) continue;

			// Use a global replace for the literal value
			const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const valuePattern = new RegExp(escaped, "g");
			result = result.replace(valuePattern, `[REDACTED:${name}]`);
		}
	}

	return result;
}

/** Recursively redact all string content in an AgentMessage. */
function redactMessage<T>(msg: T): T {
	if (typeof msg === "string") {
		return redactText(msg) as unknown as T;
	}

	if (Array.isArray(msg)) {
		return msg.map((item) => redactMessage(item)) as unknown as T;
	}

	if (msg && typeof msg === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(msg as Record<string, unknown>)) {
			if (typeof value === "string") {
				result[key] = redactText(value);
			} else if (typeof value === "object" && value !== null) {
				result[key] = redactMessage(value);
			} else {
				result[key] = value;
			}
		}
		return result as unknown as T;
	}

	return msg;
}

/** Context-event key names that commonly carry secret data. */
const SECRET_CONTENT_KEYS = new Set([
	"content",
	"text",
	"thinking",
	"command",
	"input",
	"output",
	"diff",
	"patch",
	"result",
]);

/** Redact only string fields likely to contain secrets (not metadata like role, type, stopReason). */
function redactMessageSelective<T>(msg: T): T {
	if (!msg || typeof msg !== "object") return msg;

	const result = { ...(msg as Record<string, unknown>) };
	for (const key of Object.keys(result)) {
		const value = result[key];
		if (typeof value === "string" && SECRET_CONTENT_KEYS.has(key)) {
			result[key] = redactText(value);
		} else if (Array.isArray(value)) {
			result[key] = value.map((item) =>
				typeof item === "object" && item !== null ? redactMessageSelective(item) : item,
			);
		} else if (typeof value === "object" && value !== null) {
			result[key] = redactMessageSelective(value);
		}
	}
	return result as unknown as T;
}

// ── Extension entry point ────────────────────────────────────────────────────

export default function secretGuard(pi: ExtensionAPI) {
	// Cache env secrets on startup
	getEnvSecrets();

	// ── Scrub secrets from context before sending to LLM ─────────────────────

	pi.on("context", async (event) => {
		return {
			messages: event.messages.map((msg) => redactMessageSelective(msg)),
		};
	});

	// ── Scrub secrets from the system prompt per turn ─────────────────────────

	pi.on("before_agent_start", async (_event) => {
		// We return nothing — we'd need a systemPrompt-modifying hook for this.
		// The system prompt is not passed through before_agent_start in a modifiable
		// way yet in this API version, but Pi already strips some env vars from it.
		// The context filter above is the primary defense.
		return {};
	});

	// ── Notify on session start if guard is active ────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		const level = getGuardLevel();
		if (level === "off") return;

		const label =
			level === "patterns" ? "pattern-based" : level === "env" ? "environment-based" : "full (patterns + env)";
		ctx.ui.setStatus("secret-guard:active", `🔓 Secret guard: ${label} redaction active`);
	});
}