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
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
	/** Timestamp of the current session start, used for elapsed time. */
	let sessionStart = Date.now();

	/** Format a millisecond duration as a compact human-readable string (e.g. `42s`, `3m12s`, `1h5m`). */
	function formatElapsed(ms: number): string {
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
	function fmt(n: number): string {
		if (n < 1000) {
			return `${n}`;
		}
		return `${(n / 1000).toFixed(1)}k`;
	}

	pi.on("session_start", async (_event, ctx) => {
		sessionStart = Date.now();

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());
			const timer = setInterval(() => tui.requestRender(), 30000);

			return {
				dispose() {
					unsub();
					clearInterval(timer);
				},
				// biome-ignore lint/suspicious/noEmptyBlockStatements: Required by footer interface
				invalidate() {},
				// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Footer rendering combines multiple live metrics in one pass.
				render(width: number): string[] {
					let input = 0;
					let output = 0;
					let cost = 0;
					for (const e of ctx.sessionManager.getBranch()) {
						if (e.type === "message" && e.message.role === "assistant") {
							const m = e.message as AssistantMessage;
							input += m.usage.input;
							output += m.usage.output;
							cost += m.usage.cost.total;
						}
					}

					const usage = ctx.getContextUsage();
					const _ctxWindow = usage?.contextWindow ?? 0;
					const pct = usage?.percent ?? 0;

					const pctColor = pct > 75 ? "error" : pct > 50 ? "warning" : "success";

					const tokenStats = [
						theme.fg("accent", `${fmt(input)}/${fmt(output)}`),
						theme.fg("warning", `$${cost.toFixed(2)}`),
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

	pi.on("session_switch", (event, _ctx) => {
		if (event.reason === "new") {
			sessionStart = Date.now();
		}
	});
}
