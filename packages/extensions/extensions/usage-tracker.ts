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
}

/** Rate limit snapshot from a provider CLI probe. */
interface ProviderRateLimits {
	provider: "claude" | "codex";
	windows: RateWindow[];
	credits: number | null;
	probedAt: number;
	error: string | null;
}

/** Cost thresholds that trigger user notifications. */
const COST_THRESHOLDS = [0.5, 1, 2, 5, 10, 25, 50];

/** Minimum interval between rate limit probes (30 seconds). */
const PROBE_COOLDOWN_MS = 30_000;

/** Probe timeout (15 seconds). */
const PROBE_TIMEOUT_MS = 15_000;

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
	const match = line.match(/resets?\s+(.*)/i);
	return match ? match[1].trim() : null;
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: CLI output parsing must handle multiple formats and fallbacks.
async function probeClaude(
	exec: (cmd: string, args: string[], opts?: { timeout?: number }) => Promise<{ stdout: string; exitCode: number }>,
): Promise<ProviderRateLimits> {
	const result: ProviderRateLimits = {
		provider: "claude",
		windows: [],
		credits: null,
		probedAt: Date.now(),
		error: null,
	};

	try {
		// Use `claude usage` subcommand to get rate limit info
		const usage = await exec("claude", ["usage"], { timeout: PROBE_TIMEOUT_MS });
		const clean = stripAnsi(usage.stdout);

		if (!clean || clean.length < 10) {
			result.error = "Empty output from claude CLI";
			return result;
		}

		// Parse each rate limit section
		const lines = clean.split("\n");
		for (const line of lines) {
			const lower = line.toLowerCase();
			if (lower.includes("current session")) {
				const pct = extractPercentFromLine(line);
				if (pct !== null) {
					result.windows.push({
						label: "Session",
						percentLeft: pct,
						resetDescription: extractResetFromLine(line),
					});
				}
			} else if (lower.includes("current week") && lower.includes("all model")) {
				const pct = extractPercentFromLine(line);
				if (pct !== null) {
					result.windows.push({
						label: "Weekly (all)",
						percentLeft: pct,
						resetDescription: extractResetFromLine(line),
					});
				}
			} else if (lower.includes("current week") && (lower.includes("opus") || lower.includes("sonnet"))) {
				const pct = extractPercentFromLine(line);
				if (pct !== null) {
					const model = lower.includes("opus") ? "Opus" : "Sonnet";
					result.windows.push({
						label: `Weekly (${model})`,
						percentLeft: pct,
						resetDescription: extractResetFromLine(line),
					});
				}
			}
		}

		// If line-by-line didn't work, try ordered percentage extraction (fallback)
		if (result.windows.length === 0) {
			const allPcts = [...clean.matchAll(/(\d{1,3})\s*%/g)].map((m) => Number.parseInt(m[1], 10));
			if (allPcts.length >= 1) {
				result.windows.push({ label: "Session", percentLeft: allPcts[0], resetDescription: null });
			}
			if (allPcts.length >= 2) {
				result.windows.push({ label: "Weekly (all)", percentLeft: allPcts[1], resetDescription: null });
			}
			if (allPcts.length >= 3) {
				result.windows.push({ label: "Weekly (model)", percentLeft: allPcts[2], resetDescription: null });
			}
		}
	} catch (e) {
		result.error = e instanceof Error ? e.message : String(e);
	}

	return result;
}

/**
 * Probe the Codex CLI for rate limit info.
 *
 * Runs `codex /status` and parses for:
 * - 5-hour limit % remaining
 * - Weekly limit % remaining
 * - Credits remaining
 */
async function probeCodex(
	exec: (cmd: string, args: string[], opts?: { timeout?: number }) => Promise<{ stdout: string; exitCode: number }>,
): Promise<ProviderRateLimits> {
	const result: ProviderRateLimits = {
		provider: "codex",
		windows: [],
		credits: null,
		probedAt: Date.now(),
		error: null,
	};

	try {
		const proc = await exec("codex", ["-s", "read-only", "-a", "untrusted"], { timeout: PROBE_TIMEOUT_MS });
		const clean = stripAnsi(proc.stdout);

		if (!clean || clean.length < 10) {
			result.error = "Empty output from codex CLI";
			return result;
		}

		result.credits = extractCredits(clean);

		const lines = clean.split("\n");
		for (const line of lines) {
			const lower = line.toLowerCase();
			if (lower.includes("5h limit") || lower.includes("5-hour") || lower.includes("five hour")) {
				const pct = extractPercentFromLine(line);
				if (pct !== null) {
					result.windows.push({
						label: "5-hour",
						percentLeft: pct,
						resetDescription: extractResetFromLine(line),
					});
				}
			} else if (lower.includes("weekly limit") || lower.includes("weekly")) {
				const pct = extractPercentFromLine(line);
				if (pct !== null) {
					result.windows.push({
						label: "Weekly",
						percentLeft: pct,
						resetDescription: extractResetFromLine(line),
					});
				}
			}
		}
	} catch (e) {
		result.error = e instanceof Error ? e.message : String(e);
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
		let cost = 0;
		let turns = 0;
		for (const m of models.values()) {
			input += m.input;
			output += m.output;
			cost += m.costTotal;
			turns += m.turns;
		}
		return { input, output, cost, turns };
	}

	function getPace(): { tokensPerMin: number } | null {
		if (turnHistory.length < 2) {
			return null;
		}
		const spanMs = turnHistory[turnHistory.length - 1].timestamp - turnHistory[0].timestamp;
		if (spanMs < 10_000) {
			return null;
		}
		let total = 0;
		for (const t of turnHistory) {
			total += t.tokens;
		}
		return { tokensPerMin: Math.round(total / (spanMs / 60_000)) };
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
	async function probeProvider(provider: "claude" | "codex"): Promise<void> {
		const now = Date.now();
		const last = lastProbeTime.get(provider) ?? 0;
		if (now - last < PROBE_COOLDOWN_MS || probeInFlight.has(provider)) {
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
			lastProbeTime.set(provider, now);
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
	function triggerProbe(ctx: ExtensionContext): void {
		const model = ctx.model;
		if (!model) {
			return;
		}
		const id = model.id.toLowerCase();
		// Detect provider from model ID
		if (id.includes("claude") || id.includes("sonnet") || id.includes("opus") || id.includes("haiku")) {
			probeProvider("claude");
		}
		if (id.includes("gpt") || id.includes("o1") || id.includes("o3") || id.includes("o4") || id.includes("codex")) {
			probeProvider("codex");
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
	function renderRateLimitsPlain(): string {
		const lines: string[] = [];
		for (const [, rl] of rateLimits) {
			if (rl.error) {
				lines.push(`${rl.provider}: Error — ${rl.error}`);
				continue;
			}
			if (rl.windows.length === 0) {
				continue;
			}
			lines.push(`${rl.provider.charAt(0).toUpperCase() + rl.provider.slice(1)} Rate Limits:`);
			for (const w of rl.windows) {
				const bar = progressBar(w.percentLeft, 20);
				const reset = w.resetDescription ? ` — resets ${w.resetDescription}` : "";
				lines.push(`  ${w.label}: ${bar} ${w.percentLeft}% left${reset}`);
			}
			if (rl.credits !== null) {
				lines.push(`  Credits: ${rl.credits.toFixed(2)} remaining`);
			}
			lines.push("");
		}
		return lines.join("\n");
	}

	/** Render rate limit windows with theme colors (for TUI). */
	function renderRateLimitsRich(theme: { fg: (c: string, t: string) => string }): string[] {
		const lines: string[] = [];

		for (const [, rl] of rateLimits) {
			if (rl.error) {
				lines.push(`  ${theme.fg("error", `⚠ ${rl.provider}`)} ${theme.fg("dim", rl.error)}`);
				continue;
			}
			if (rl.windows.length === 0) {
				continue;
			}

			const name = rl.provider.charAt(0).toUpperCase() + rl.provider.slice(1);
			lines.push(`  ${theme.fg("accent", `▸ ${name} Rate Limits`)}`);

			for (const w of rl.windows) {
				const color = pctColor(w.percentLeft);
				const bar = theme.fg(color, progressBar(w.percentLeft, 20));
				const pct = theme.fg(color, `${w.percentLeft}% left`);
				const reset = w.resetDescription ? theme.fg("dim", ` — resets ${w.resetDescription}`) : "";
				lines.push(`    ${theme.fg("accent", w.label.padEnd(15))}${bar} ${pct}${reset}`);
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
			parts.push(`${theme.fg("accent", name)} ${bar} ${theme.fg(color, `${most.percentLeft}%`)}${reset}`);
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
		lines.push(`Tokens: ${fmtTokens(totals.input)} in / ${fmtTokens(totals.output)} out`);
		lines.push(`Cost: ${fmtCost(totals.cost)}`);
		if (pace) {
			lines.push(`Pace: ~${fmtTokens(pace.tokensPerMin)} tokens/min`);
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
				lines.push(
					`  ${m.model} (${m.provider}): ${m.turns} turns, ${fmtTokens(m.input)} in / ${fmtTokens(m.output)} out, ${fmtCost(m.costTotal)}`,
				);
			}
		}

		return lines.join("\n");
	}

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

		if (ctxUsage?.percent != null) {
			const pct = ctxUsage.percent;
			const color = pctColor(100 - pct); // invert: low remaining = danger
			lines.push(
				`  ${theme.fg("accent", "Context")}${sep}${theme.fg(color, progressBar(100 - pct, 20))} ${theme.fg(color, `${(100 - pct).toFixed(0)}% free`)} of ${fmtTokens(ctxUsage.contextWindow)}`,
			);
		}

		if (pace) {
			lines.push(`  ${theme.fg("accent", "Pace   ")}${sep}~${fmtTokens(pace.tokensPerMin)} tok/min`);
		}

		// Tokens
		lines.push(
			`  ${theme.fg("accent", "Tokens ")}${sep}${theme.fg("success", fmtTokens(totals.input))} in${sep}${theme.fg("warning", fmtTokens(totals.output))} out${sep}${theme.fg("dim", fmtTokens(totals.input + totals.output))} total`,
		);

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
				const bar = progressBar(costPct, 12);
				lines.push(`  ${theme.fg("accent", "◆")} ${theme.fg("accent", m.model)} ${theme.fg("dim", `(${m.provider})`)}`);
				lines.push(
					`    ${bar} ${theme.fg("warning", fmtCost(m.costTotal))}${sep}${m.turns} turns${sep}${fmtTokens(m.input)} in / ${fmtTokens(m.output)} out`,
				);
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
			triggerProbe(ctx);
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
			triggerProbe(ctx);
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
			triggerProbe(ctx);
			await new Promise((resolve) => setTimeout(resolve, 1000));

			const format = params.format ?? "detailed";
			let text: string;

			if (format === "summary") {
				const rlText = renderRateLimitsPlain();
				const totals = getTotals();
				text = rlText.trim()
					? `${rlText}Session: ${fmtCost(totals.cost)} cost, ${totals.turns} turns`
					: `No rate limit data available.\nSession: ${fmtCost(totals.cost)} cost, ${totals.turns} turns`;
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
			triggerProbe(ctx);
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
