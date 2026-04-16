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

import path from "node:path";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, ReadonlyFooterDataProvider } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { getSafeModeState, subscribeSafeMode } from "./runtime-mode";
import { recordRuntimeSample } from "./watchdog-runtime-diagnostics";
import {
	formatOwnerLabel,
	getCachedRepoWorktreeContext,
	getRepoWorktreeSnapshot,
	type RepoWorktreeContext,
	type RepoWorktreeSnapshot,
	refreshRepoWorktreeContext,
} from "./worktree-shared";

/** OSC 8 hyperlink: renders `text` as a clickable terminal link to `url`. */
export function hyperlink(url: string, text: string): string {
	return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

export type PrInfo = {
	number: number;
	url: string;
	headRefName?: string;
};

const PR_PROBE_COOLDOWN_MS = 60_000;
const FOOTER_STARTUP_REFRESH_DELAY_MS = 250;
const FOOTER_STARTUP_DEFER_ENTRY_THRESHOLD = 250;

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

function collectFooterUsageTotalsFromEntries(
	entries: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>,
): FooterUsageTotals {
	const totals: FooterUsageTotals = { input: 0, output: 0, cost: 0 };
	for (const entry of entries) {
		if (entry.type === "message" && entry.message.role === "assistant") {
			accumulateAssistantUsage(totals, entry.message as AssistantMessage);
		}
	}
	return totals;
}

export function collectFooterUsageTotals(ctx: Pick<ExtensionContext, "sessionManager">): FooterUsageTotals {
	return collectFooterUsageTotalsFromEntries(ctx.sessionManager.getBranch());
}

export default function (pi: ExtensionAPI) {
	/** Timestamp of the current session start, used for elapsed time. */
	let sessionStart = Date.now();
	/** Cached assistant usage totals to avoid rescanning the full session on every render. */
	let usageTotals: FooterUsageTotals = { input: 0, output: 0, cost: 0 };
	/** Cached PR info for the current branch. */
	let activeFooterData: ReadonlyFooterDataProvider | null = null;
	let activeCtx: ExtensionContext | null = null;
	let cachedPrs: PrInfo[] = [];
	let cachedWorktreeContext: RepoWorktreeContext | null = null;
	let startupRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	let worktreeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	let worktreeRefreshInFlight = false;
	let requestFooterRender: (() => void) | null = null;
	/** Branch name when the PR was last probed. */
	let prProbedForBranch: string | null = null;
	/** Last time a PR probe was attempted. */
	let lastPrProbeAt = 0;
	/** Whether a PR probe is in flight. */
	let prProbeInFlight = false;

	const syncUsageTotalsFromEntries = (entries: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>) => {
		usageTotals = collectFooterUsageTotalsFromEntries(entries);
	};

	const clearStartupRefreshTimer = () => {
		if (!startupRefreshTimer) {
			return;
		}
		clearTimeout(startupRefreshTimer);
		startupRefreshTimer = null;
	};

	const scheduleUsageTotalsRefresh = (ctx: Pick<ExtensionContext, "sessionManager">) => {
		clearStartupRefreshTimer();
		const entries = ctx.sessionManager.getBranch();
		const refresh = () => {
			syncUsageTotalsFromEntries(entries);
			requestFooterRender?.();
		};

		if (entries.length < FOOTER_STARTUP_DEFER_ENTRY_THRESHOLD) {
			refresh();
			return;
		}

		startupRefreshTimer = setTimeout(() => {
			startupRefreshTimer = null;
			refresh();
		}, FOOTER_STARTUP_REFRESH_DELAY_MS);
	};

	const refreshWorktreeContext = async (cwd = process.cwd()) => {
		if (worktreeRefreshInFlight) {
			return;
		}

		const startedAt = Date.now();
		worktreeRefreshInFlight = true;
		try {
			cachedWorktreeContext = await refreshRepoWorktreeContext(cwd);
		} finally {
			worktreeRefreshInFlight = false;
			recordRuntimeSample(
				"custom-footer",
				"event",
				"worktree_context_refresh",
				Date.now() - startedAt,
				"custom-footer",
			);
			requestFooterRender?.();
		}
	};

	const clearWorktreeRefreshTimer = () => {
		if (!worktreeRefreshTimer) {
			return;
		}
		clearTimeout(worktreeRefreshTimer);
		worktreeRefreshTimer = null;
	};

	const scheduleWorktreeContextRefresh = (cwd = process.cwd(), options: { delayMs?: number; force?: boolean } = {}) => {
		const delayMs = Math.max(0, options.delayMs ?? 0);
		if (!options.force && (cachedWorktreeContext || worktreeRefreshTimer || worktreeRefreshInFlight)) {
			return;
		}
		if (worktreeRefreshTimer) {
			return;
		}

		worktreeRefreshTimer = setTimeout(() => {
			worktreeRefreshTimer = null;
			refreshWorktreeContext(cwd).catch(() => undefined);
		}, delayMs);
	};

	const getWorktreeContext = () => {
		if (!cachedWorktreeContext) {
			cachedWorktreeContext = getCachedRepoWorktreeContext(activeCtx?.cwd ?? process.cwd());
		}
		if (!cachedWorktreeContext) {
			scheduleWorktreeContextRefresh(activeCtx?.cwd ?? process.cwd());
		}
		return cachedWorktreeContext;
	};

	const probePrs = (branch: string | null) => {
		if (!branch || prProbeInFlight) {
			return;
		}
		const now = Date.now();
		if (branch === prProbedForBranch && now - lastPrProbeAt < PR_PROBE_COOLDOWN_MS) {
			return;
		}
		if (branch !== prProbedForBranch) {
			cachedPrs = [];
		}
		prProbeInFlight = true;
		prProbedForBranch = branch;
		lastPrProbeAt = now;
		pi.exec("gh", ["pr", "list", "--head", branch, "--state", "open", "--json", "number,url,headRefName"], {
			timeout: 8000,
		})
			.then(({ stdout, exitCode }) => {
				if (exitCode !== 0 || !stdout.trim()) {
					cachedPrs = [];
					return;
				}
				try {
					const parsed = JSON.parse(stdout.trim()) as Array<{ number?: number; url?: string; headRefName?: string }>;
					cachedPrs = parsed.filter((entry): entry is PrInfo => !!entry.number && !!entry.url);
				} catch {
					cachedPrs = [];
				}
			})
			.catch(() => {
				cachedPrs = [];
			})
			.finally(() => {
				prProbeInFlight = false;
			});
	};

	pi.on("session_start", async (_event, ctx) => {
		const worktreeCwd = ctx.cwd ?? process.cwd();
		sessionStart = Date.now();
		activeCtx = ctx;
		scheduleUsageTotalsRefresh(ctx);
		scheduleWorktreeContextRefresh(worktreeCwd, { delayMs: FOOTER_STARTUP_REFRESH_DELAY_MS, force: true });

		ctx.ui.setFooter((tui, theme, footerData) => {
			activeFooterData = footerData;
			requestFooterRender = () => tui.requestRender();
			const probeActivePrs = () => {
				probePrs(footerData.getGitBranch() || cachedWorktreeContext?.current?.branch || null);
			};
			const unsub = footerData.onBranchChange(() => {
				scheduleWorktreeContextRefresh(worktreeCwd, { force: true });
				probeActivePrs();
				tui.requestRender();
			});
			cachedWorktreeContext = getCachedRepoWorktreeContext(worktreeCwd);
			const unsubSafeMode = subscribeSafeMode(() => tui.requestRender());
			const timer = setInterval(() => {
				probeActivePrs();
				tui.requestRender();
			}, 30000);
			probeActivePrs();

			return {
				dispose() {
					requestFooterRender = null;
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
					const worktreeContext = getWorktreeContext();
					const repoStr = worktreeContext ? theme.fg("muted", `repo ${path.basename(worktreeContext.repoRoot)}`) : "";
					const worktreeStr = worktreeContext?.isLinkedWorktree
						? theme.fg(
								worktreeContext.current?.isManaged ? "warning" : "muted",
								`wt ${worktreeContext.current?.branch ?? path.basename(worktreeContext.currentWorktreeRoot)}${worktreeContext.current?.isManaged ? " pi" : ""}`,
							)
						: "";

					const branch = worktreeContext?.current?.branch ?? footerData.getGitBranch();
					let branchStr = branch ? theme.fg("accent", `⎇ ${branch}`) : "";
					if (cachedPrs.length > 0) {
						const prLinks = cachedPrs.map((pr) => hyperlink(pr.url, theme.fg("success", `PR #${pr.number}`))).join(" ");
						branchStr = branchStr ? `${branchStr} ${prLinks}` : prLinks;
					}

					const thinking = pi.getThinkingLevel();
					const thinkColor =
						thinking === "high" ? "warning" : thinking === "medium" ? "accent" : thinking === "low" ? "dim" : "muted";
					const modelId = ctx.model?.id || "no-model";
					const modelStr = `${theme.fg(thinkColor, "◆")} ${theme.fg("accent", modelId)}`;

					const sep = theme.fg("dim", " | ");
					const leftParts = [modelStr, tokenStats, elapsed];
					if (repoStr) {
						leftParts.push(repoStr);
					}
					leftParts.push(cwdStr);
					if (branchStr) {
						leftParts.push(branchStr);
					}
					if (worktreeStr) {
						leftParts.push(worktreeStr);
					}
					const left = leftParts.join(sep);

					return [truncateToWidth(left, width)];
				},
			};
		});
	});

	pi.on("session_switch", (event, ctx) => {
		activeCtx = ctx;
		scheduleUsageTotalsRefresh(ctx);
		scheduleWorktreeContextRefresh(ctx.cwd ?? process.cwd(), {
			delayMs: FOOTER_STARTUP_REFRESH_DELAY_MS,
			force: true,
		});
		if (event.reason === "new") {
			sessionStart = Date.now();
		}
	});

	pi.on("session_tree", (_event, ctx) => {
		activeCtx = ctx;
		scheduleUsageTotalsRefresh(ctx);
	});

	pi.on("session_fork", (_event, ctx) => {
		activeCtx = ctx;
		scheduleUsageTotalsRefresh(ctx);
	});

	pi.on("turn_end", (event) => {
		if (event.message.role === "assistant") {
			accumulateAssistantUsage(usageTotals, event.message as AssistantMessage);
		}
	});

	pi.on("session_shutdown", () => {
		clearStartupRefreshTimer();
		clearWorktreeRefreshTimer();
		cachedWorktreeContext = null;
		requestFooterRender = null;
	});

	// ─── /status overlay ─────────────────────────────────────────────────

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Status overlay assembles many optional sections.
	function buildStatusLines(
		theme: { fg: (color: string, text: string) => string },
		worktreeSnapshot: RepoWorktreeSnapshot | null,
	): string[] {
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

		const worktreeContext = getWorktreeContext();
		if (worktreeContext) {
			lines.push(`  ${theme.fg("accent", "Repo Root")}${sep}${worktreeContext.repoRoot}`);
			lines.push(`  ${theme.fg("accent", "Worktree Root")}${sep}${worktreeContext.currentWorktreeRoot}`);
			lines.push(
				`  ${theme.fg("accent", "Worktree Kind")}${sep}${worktreeContext.isLinkedWorktree ? (worktreeContext.current?.isManaged ? "pi-owned linked worktree" : "external linked worktree") : "main checkout"}`,
			);
			if (worktreeContext.current?.metadata) {
				lines.push(`  ${theme.fg("accent", "Purpose")}${sep}${worktreeContext.current.metadata.purpose}`);
				lines.push(`  ${theme.fg("accent", "Owner")}${sep}${formatOwnerLabel(worktreeContext.current.metadata.owner)}`);
			}
		}

		if (worktreeSnapshot) {
			lines.push(
				`  ${theme.fg("accent", "Worktrees")}${sep}${worktreeSnapshot.worktrees.length} total${worktreeSnapshot.staleManagedWorktrees.length > 0 ? `${sep}${worktreeSnapshot.staleManagedWorktrees.length} stale pi record(s)` : ""}`,
			);
		}

		const branch =
			worktreeContext?.current?.branch ?? worktreeSnapshot?.current?.branch ?? activeFooterData?.getGitBranch?.();
		if (branch) {
			lines.push(`  ${theme.fg("accent", "Branch")}${sep}${theme.fg("accent", branch)}`);
		}

		if (cachedPrs.length > 0) {
			const prLabel = cachedPrs.length > 1 ? "Pull Requests" : "Pull Request";
			for (const pr of cachedPrs) {
				const prLink = hyperlink(pr.url, `#${pr.number}`);
				lines.push(
					`  ${theme.fg("accent", prLabel)}${sep}${theme.fg("success", prLink)}${sep}${theme.fg("dim", pr.url)}`,
				);
			}
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
			const worktreeCwd = ctx.cwd ?? process.cwd();
			activeCtx = ctx;
			await refreshWorktreeContext(worktreeCwd);
			const worktreeSnapshot = getRepoWorktreeSnapshot(worktreeCwd);
			await ctx.ui.custom(
				(_tui, theme, _keybindings, done) => {
					const lines = buildStatusLines(theme, worktreeSnapshot);
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
