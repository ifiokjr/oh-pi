/**
 * Custom Footer Extension — Enhanced Status Bar
 *
 * Replaces the default pi footer with a rich status bar showing:
 * - Model name with thinking-level indicator
 * - Input/output token counts and accumulated cost
 * - Context window usage percentage (color-coded: green/yellow/red)
 * - Elapsed session time
 * - Current working directory (abbreviated)
 * - Git branch name (if available)
 *
 * The footer auto-refreshes every 30 seconds and on git branch changes.
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { getSafeModeState, subscribeSafeMode } from "./runtime-mode";

export type FooterUsageTotals = {
	input: number;
	output: number;
	cost: number;
};

/** Format a millisecond duration as a compact human-readable string (e.g. `42s`, `3m12s`, `1h5m`). */
export function formatElapsed(ms: number): string {
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

/** Format a number with k-suffix for values ≥1000. */
export function fmt(n: number): string {
	if (n < 1000) {
		return `${n}`;
	}
	return `${(n / 1000).toFixed(1)}k`;
}

function accumulateAssistantUsage(totals: FooterUsageTotals, message: AssistantMessage): void {
	totals.input += Number(message.usage.input) || 0;
	totals.output += Number(message.usage.output) || 0;
	totals.cost += Number(message.usage.cost.total) || 0;
}

export function collectFooterUsageTotals(ctx: Pick<ExtensionContext, "sessionManager">): FooterUsageTotals {
	const totals: FooterUsageTotals = { input: 0, output: 0, cost: 0 };
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "message" && entry.message.role === "assistant") {
			accumulateAssistantUsage(totals, entry.message as AssistantMessage);
		}
	}
	return totals;
}

export default function (pi: ExtensionAPI) {
	/** Timestamp of the current session start, used for elapsed time. */
	let sessionStart = Date.now();
	/** Cached assistant usage totals to avoid rescanning the full session on every render. */
	let usageTotals: FooterUsageTotals = { input: 0, output: 0, cost: 0 };

	const syncUsageTotals = (ctx: Pick<ExtensionContext, "sessionManager">) => {
		usageTotals = collectFooterUsageTotals(ctx);
	};

	pi.on("session_start", async (_event, ctx) => {
		sessionStart = Date.now();
		syncUsageTotals(ctx);

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());
			const unsubSafeMode = subscribeSafeMode(() => tui.requestRender());
			const timer = setInterval(() => tui.requestRender(), 30000);

			return {
				dispose() {
					unsub();
					unsubSafeMode();
					clearInterval(timer);
				},
				// biome-ignore lint/suspicious/noEmptyBlockStatements: Required by footer interface
				invalidate() {},
				// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Footer rendering combines multiple live metrics in one pass.
				render(width: number): string[] {
					if (getSafeModeState().enabled) {
						return [];
					}
					const usage = ctx.getContextUsage();
					const pct = usage?.percent ?? 0;

					const pctColor = pct > 75 ? "error" : pct > 50 ? "warning" : "success";

					const tokenStats = [
						theme.fg("accent", `${fmt(usageTotals.input)}/${fmt(usageTotals.output)}`),
						theme.fg("warning", `$${usageTotals.cost.toFixed(2)}`),
						theme.fg(pctColor, `${pct.toFixed(0)}%`),
					].join(" ");

					const elapsed = theme.fg("dim", `⏱${formatElapsed(Date.now() - sessionStart)}`);

					const parts = process.cwd().split("/");
					const short = parts.length > 2 ? parts.slice(-2).join("/") : process.cwd();
					const cwdStr = theme.fg("muted", `⌂ ${short}`);

					const branch = footerData.getGitBranch();
					const branchStr = branch ? theme.fg("accent", `⎇ ${branch}`) : "";

					const thinking = pi.getThinkingLevel();
					const thinkColor =
						thinking === "high" ? "warning" : thinking === "medium" ? "accent" : thinking === "low" ? "dim" : "muted";
					const modelId = ctx.model?.id || "no-model";
					const modelStr = `${theme.fg(thinkColor, "◆")} ${theme.fg("accent", modelId)}`;

					const sep = theme.fg("dim", " | ");
					const leftParts = [modelStr, tokenStats, elapsed, cwdStr];
					if (branchStr) {
						leftParts.push(branchStr);
					}
					const left = leftParts.join(sep);

					return [truncateToWidth(left, width)];
				},
			};
		});
	});

	pi.on("session_switch", (event, ctx) => {
		syncUsageTotals(ctx);
		if (event.reason === "new") {
			sessionStart = Date.now();
		}
	});

	pi.on("session_tree", (_event, ctx) => {
		syncUsageTotals(ctx);
	});

	pi.on("session_fork", (_event, ctx) => {
		syncUsageTotals(ctx);
	});

	pi.on("turn_end", (event) => {
		if (event.message.role === "assistant") {
			accumulateAssistantUsage(usageTotals, event.message as AssistantMessage);
		}
	});
}
