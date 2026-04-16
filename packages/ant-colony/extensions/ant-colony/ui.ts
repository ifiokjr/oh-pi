/**
 * Ant Colony UI Helpers
 *
 * Pure formatting functions for the colony's status bar, overlay panel,
 * and final report. All functions are stateless and side-effect free.
 *
 * Status keys use snake_case to match the `ColonyState["status"]` union
 * and the `COLONY_SIGNAL:*` protocol identifiers (e.g. `planning_recovery`,
 * `budget_exceeded`, `task_done`). These are wire-format constants, not
 * arbitrary variable names.
 *
 * Icon mode is controlled by the `OH_PI_PLAIN_ICONS` environment variable.
 * When set to `"1"` or `"true"`, all icons fall back to ASCII-safe glyphs.
 */
import type { ColonyState } from "./types.js";

/** Check whether plain (ASCII-safe) icon mode is active. */
function isPlain(): boolean {
	return process.env.OH_PI_PLAIN_ICONS === "1" || process.env.OH_PI_PLAIN_ICONS === "true";
}

/**
 * Format a millisecond duration into a human-readable string like `42s` or `3m12s`.
 */
export function formatDuration(ms: number): string {
	const s = Math.floor(ms / 1000);
	if (s < 60) {
		return `${s}s`;
	}
	const m = Math.floor(s / 60);
	return `${m}m${s % 60}s`;
}

/**
 * Format a USD cost value. Shows 4 decimal places for sub-cent values,
 * 2 decimal places otherwise.
 */
export function formatCost(cost: number): string {
	return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
}

/**
 * Format a token count with k/M suffixes for readability.
 */
export function formatTokens(n: number): string {
	if (n < 1000) {
		return `${n}`;
	}
	return n < 1000000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1000000).toFixed(1)}M`;
}

const EMOJI_STATUS_ICONS: Record<string, string> = {
	launched: "🚀",
	scouting: "🔍",
	// biome-ignore lint/style/useNamingConvention: Wire-format protocol key
	planning_recovery: "♻️",
	working: "⚒️",
	reviewing: "🛡️",
	// biome-ignore lint/style/useNamingConvention: Wire-format protocol key
	task_done: "✅",
	done: "✅",
	complete: "✅",
	failed: "❌",
	// biome-ignore lint/style/useNamingConvention: Wire-format protocol key
	budget_exceeded: "💰",
};

const PLAIN_STATUS_ICONS: Record<string, string> = {
	launched: "[>>]",
	scouting: "[?]",
	// biome-ignore lint/style/useNamingConvention: Wire-format protocol key
	planning_recovery: "[~]",
	working: "[w]",
	reviewing: "[!]",
	// biome-ignore lint/style/useNamingConvention: Wire-format protocol key
	task_done: "[ok]",
	done: "[ok]",
	complete: "[ok]",
	failed: "[ERR]",
	// biome-ignore lint/style/useNamingConvention: Wire-format protocol key
	budget_exceeded: "[$]",
};

const STATUS_LABELS: Record<string, string> = {
	launched: "LAUNCHED",
	scouting: "SCOUTING",
	// biome-ignore lint/style/useNamingConvention: Wire-format protocol key
	planning_recovery: "PLANNING_RECOVERY",
	working: "WORKING",
	reviewing: "REVIEWING",
	// biome-ignore lint/style/useNamingConvention: Wire-format protocol key
	task_done: "TASK_DONE",
	done: "DONE",
	complete: "COMPLETE",
	failed: "FAILED",
	// biome-ignore lint/style/useNamingConvention: Wire-format protocol key
	budget_exceeded: "BUDGET_EXCEEDED",
};

const EMOJI_CASTE_ICONS: Record<string, string> = {
	scout: "🔍",
	soldier: "🛡️",
	drone: "⚙️",
};

const PLAIN_CASTE_ICONS: Record<string, string> = {
	scout: "[?]",
	soldier: "[!]",
	drone: "[d]",
};

/**
 * Get the icon for a colony status/phase string.
 * Falls back to 🐜 / `[ant]` for unknown statuses.
 */
export function statusIcon(status: string): string {
	const map = isPlain() ? PLAIN_STATUS_ICONS : EMOJI_STATUS_ICONS;
	const fallback = isPlain() ? "[ant]" : "🐜";
	return map[status] || fallback;
}

/**
 * Get the uppercase label for a colony status/phase string.
 * Falls back to `status.toUpperCase()` for unknown statuses.
 */
export function statusLabel(status: string): string {
	return STATUS_LABELS[status] || status.toUpperCase();
}

/**
 * Render an ASCII progress bar like `[####------]`.
 *
 * @param progress - Value between 0 and 1
 * @param width - Total character width of the bar (default 14)
 */
export function progressBar(progress: number, width = 14): string {
	const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
	const filled = Math.round(width * p);
	return `[${"#".repeat(filled)}${"-".repeat(Math.max(0, width - filled))}]`;
}

/**
 * Get the icon for an ant caste (scout, worker, soldier, drone).
 */
export function casteIcon(caste: string): string {
	const map = isPlain() ? PLAIN_CASTE_ICONS : EMOJI_CASTE_ICONS;
	const fallback = isPlain() ? "[w]" : "⚒️";
	return map[caste] || fallback;
}

/** Ant icon — 🐜 or `[ant]` depending on icon mode. */
export function antIcon(): string {
	return isPlain() ? "[ant]" : "🐜";
}

/** Check mark — ✓ or `[ok]`. */
export function checkMark(): string {
	return isPlain() ? "[ok]" : "✓";
}

/** Cross mark — ✗ or `[x]`. */
export function crossMark(): string {
	return isPlain() ? "[x]" : "✗";
}

/** Lightning bolt — ⚡ or `!`. */
export function boltIcon(): string {
	return isPlain() ? "!" : "⚡";
}

/**
 * Build the final markdown report summarizing a colony run.
 * Includes goal, status, duration, cost, and per-task results.
 */
export function buildReport(state: ColonyState): string {
	const m = state.metrics;
	const elapsed = state.finishedAt ? formatDuration(state.finishedAt - state.createdAt) : "?";
	const routingSummary = Array.from(
		new Set(
			state.ants
				.filter((ant) => ant.model)
				.map(
					(ant) =>
						`${ant.caste}: ${ant.model}${ant.routeSource ? ` (${ant.routeSource}${ant.routeCategory ? `:${ant.routeCategory}` : ""})` : ""}`,
				),
		),
	);
	return [
		`## ${antIcon()} Ant Colony Report`,
		`**Goal:** ${state.goal}`,
		`**Status:** ${statusIcon(state.status)} ${state.status} │ ${formatCost(m.totalCost)}`,
		`**Duration:** ${elapsed}`,
		`**Tasks:** ${m.tasksDone}/${m.tasksTotal} done${m.tasksFailed > 0 ? `, ${m.tasksFailed} failed` : ""}`,
		...(routingSummary.length > 0 ? [`**Routing:** ${routingSummary.join(" │ ")}`] : []),
		"",
		...state.tasks.filter((t) => t.status === "done").map((t) => `- ${checkMark()} **${t.title}**`),
		...state.tasks
			.filter((t) => t.status === "failed")
			.map((t) => `- ${crossMark()} **${t.title}** — ${t.error?.slice(0, 200) || "unknown"}`),
	].join("\n");
}
