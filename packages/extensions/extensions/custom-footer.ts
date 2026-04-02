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
import type { ExtensionAPI, ExtensionContext, ReadonlyFooterDataProvider } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { getSafeModeState, subscribeSafeMode } from "./runtime-mode";

/** OSC 8 hyperlink: renders `text` as a clickable terminal link to `url`. */
export function hyperlink(url: string, text: string): string {
	return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

export type PrInfo = {
	number: number;
	url: string;
};

const PR_PROBE_COOLDOWN_MS = 60_000;

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
	/** Cached PR info for the current branch. */
	let activeFooterData: ReadonlyFooterDataProvider | null = null;
	let activeCtx: ExtensionContext | null = null;
	let cachedPr: PrInfo | null = null;
	/** Branch name when the PR was last probed. */
	let prProbedForBranch: string | null = null;
	/** Last time a PR probe was attempted. */
	let lastPrProbeAt = 0;
	/** Whether a PR probe is in flight. */
	let prProbeInFlight = false;

	const syncUsageTotals = (ctx: Pick<ExtensionContext, "sessionManager">) => {
		usageTotals = collectFooterUsageTotals(ctx);
	};

	const probePr = (branch: string | null) => {
		if (!branch || prProbeInFlight) {
			return;
		}
		const now = Date.now();
		if (branch === prProbedForBranch && now - lastPrProbeAt < PR_PROBE_COOLDOWN_MS) {
			return;
		}
		if (branch !== prProbedForBranch) {
			cachedPr = null;
		}
		prProbeInFlight = true;
		prProbedForBranch = branch;
		lastPrProbeAt = now;
		pi.exec("gh", ["pr", "view", "--json", "number,url", "--jq", "{number,url}"], { timeout: 8000 })
			.then(({ stdout, exitCode }) => {
				if (exitCode !== 0 || !stdout.trim()) {
					cachedPr = null;
					return;
				}
				try {
					const parsed = JSON.parse(stdout.trim()) as { number?: number; url?: string };
					if (parsed.number && parsed.url) {
						cachedPr = { number: parsed.number, url: parsed.url };
					} else {
						cachedPr = null;
					}
				} catch {
					cachedPr = null;
				}
			})
			.catch(() => {
				cachedPr = null;
			})
			.finally(() => {
				prProbeInFlight = false;
			});
	};

	pi.on("session_start", async (_event, ctx) => {
		sessionStart = Date.now();
		syncUsageTotals(ctx);
		activeCtx = ctx;

		ctx.ui.setFooter((tui, theme, footerData) => {
			activeFooterData = footerData;
			const unsub = footerData.onBranchChange(() => {
				probePr(footerData.getGitBranch());
				tui.requestRender();
			});
			const unsubSafeMode = subscribeSafeMode(() => tui.requestRender());
			const timer = setInterval(() => tui.requestRender(), 30000);
			probePr(footerData.getGitBranch());

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
					let branchStr = branch ? theme.fg("accent", `⎇ ${branch}`) : "";
					if (cachedPr) {
						const prLabel = theme.fg("success", `PR #${cachedPr.number}`);
						branchStr = branchStr
							? `${branchStr} ${hyperlink(cachedPr.url, prLabel)}`
							: hyperlink(cachedPr.url, prLabel);
					}

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

	// ─── /status overlay ─────────────────────────────────────────────────

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Status overlay assembles many optional sections.
	function buildStatusLines(theme: { fg: (color: string, text: string) => string }): string[] {
		const lines: string[] = [];
		const sep = theme.fg("dim", " │ ");
		const divider = theme.fg("dim", "─".repeat(60));

		lines.push(theme.fg("accent", "╭─ Status ───────────────────────────────────────────────────╮"));
		lines.push("");

		// ── Model ──
		const thinking = pi.getThinkingLevel();
		const thinkLabel = thinking === "none" ? "off" : thinking;
		const modelId = activeCtx?.model?.id || "no-model";
		const provider = (activeCtx?.model as { provider?: string })?.provider || "unknown";
		lines.push(`  ${theme.fg("accent", "Model")}${sep}${theme.fg("accent", modelId)}`);
		lines.push(`  ${theme.fg("accent", "Provider")}${sep}${provider}`);
		lines.push(`  ${theme.fg("accent", "Thinking")}${sep}${thinkLabel}`);
		lines.push("");

		// ── Session ──
		lines.push(`  ${divider}`);
		const elapsed = formatElapsed(Date.now() - sessionStart);
		lines.push(
			`  ${theme.fg("accent", "Session")}${sep}${elapsed}${sep}${theme.fg("warning", `$${usageTotals.cost.toFixed(2)}`)}`,
		);
		lines.push(
			`  ${theme.fg("accent", "Tokens")}${sep}${theme.fg("success", fmt(usageTotals.input))} in${sep}${theme.fg("warning", fmt(usageTotals.output))} out${sep}${theme.fg("dim", fmt(usageTotals.input + usageTotals.output))} total`,
		);

		// ── Context window ──
		const usage = activeCtx?.getContextUsage?.();
		if (usage) {
			const pct = usage.percent ?? 0;
			const pctColor = pct > 75 ? "error" : pct > 50 ? "warning" : "success";
			const tokens = usage.tokens == null ? "?" : fmt(usage.tokens);
			lines.push(
				`  ${theme.fg("accent", "Context")}${sep}${theme.fg(pctColor, `${pct.toFixed(0)}% used`)}${sep}${tokens} / ${fmt(usage.contextWindow)} tokens`,
			);
		}
		lines.push("");

		// ── Workspace ──
		lines.push(`  ${divider}`);
		lines.push(`  ${theme.fg("accent", "Directory")}${sep}${process.cwd()}`);

		const branch = activeFooterData?.getGitBranch?.();
		if (branch) {
			lines.push(`  ${theme.fg("accent", "Branch")}${sep}${theme.fg("accent", branch)}`);
		}

		if (cachedPr) {
			const prLink = hyperlink(cachedPr.url, `#${cachedPr.number}`);
			lines.push(
				`  ${theme.fg("accent", "Pull Request")}${sep}${theme.fg("success", prLink)}${sep}${theme.fg("dim", cachedPr.url)}`,
			);
		}
		lines.push("");

		// ── Extension statuses ──
		const statuses = activeFooterData?.getExtensionStatuses?.();
		if (statuses && statuses.size > 0) {
			lines.push(`  ${divider}`);
			lines.push(`  ${theme.fg("accent", "Extension Statuses")}`);
			lines.push("");
			for (const [key, value] of statuses) {
				lines.push(`  ${theme.fg("dim", key.padEnd(24))}${value}`);
			}
			lines.push("");
		}

		// ── Safe mode ──
		const safeMode = getSafeModeState();
		if (safeMode.enabled) {
			lines.push(`  ${divider}`);
			const source = safeMode.auto ? "watchdog" : (safeMode.source ?? "manual");
			lines.push(
				`  ${theme.fg("warning", "⚠ Safe mode ON")}${sep}source: ${source}${safeMode.reason ? `${sep}${safeMode.reason}` : ""}`,
			);
			lines.push("");
		}

		lines.push(theme.fg("accent", "╰────────────────────────────────────────────────────────────╯"));
		lines.push(theme.fg("dim", "  Press q/Esc/Space to close"));

		return lines;
	}

	pi.registerCommand("status", {
		description: "Show a full status overview: model, session, context, workspace, PR, and extension statuses",
		async handler(_args, ctx) {
			activeCtx = ctx;
			await ctx.ui.custom(
				(_tui, theme, _keybindings, done) => {
					const lines = buildStatusLines(theme);
					return {
						render(width: number) {
							return lines.map((line) => truncateToWidth(line, width));
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
