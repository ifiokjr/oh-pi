/**
<!-- {=extensionsWatchdogConfigOverview} -->

The watchdog extension reads optional runtime protection settings from a JSON config file in the pi
agent directory. That config controls whether sampling is enabled, how frequently samples run, and
which CPU, memory, and event-loop thresholds trigger alerts or safe-mode escalation.

<!-- {/extensionsWatchdogConfigOverview} -->

<!-- {=extensionsWatchdogAlertBehaviorDocs} -->

The watchdog samples CPU, memory, and event-loop lag on an interval, records recent samples and
alerts, and can escalate into safe mode automatically when repeated alerts indicate sustained UI
churn or lag. Toast notifications are intentionally capped per session; ongoing watchdog state is
kept visible in the status bar and the `/watchdog` overlay instead of repeatedly spamming the
terminal.

<!-- {/extensionsWatchdogAlertBehaviorDocs} -->
*/
import * as fs from "node:fs";
import { cpus, homedir } from "node:os";
import * as path from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getSafeModeState, setSafeModeState, subscribeSafeMode } from './runtime-mode';
import type { SafeModeSource, SafeModeState } from './runtime-mode';
import { createStatusBarState } from "./ui-status-cache.js";
import { formatExtensionDiagnostic, formatStartupDiagnostic, getExtensionDiagnostics, getStartupDiagnostics, installRuntimeDiagnostics } from './watchdog-runtime-diagnostics';
import type { ExtensionDiagnostic } from './watchdog-runtime-diagnostics';

const MB = 1024 * 1024;
const DEFAULT_SAMPLE_INTERVAL_MS = 5000;
const MIN_SAMPLE_INTERVAL_MS = 1000;
const MAX_SAMPLE_INTERVAL_MS = 60_000;
const ALERT_COOLDOWN_MS = 45_000;
const ALERT_NOTIFICATION_LIMIT = 2;
const AUTO_SAFE_MODE_AFTER_CONSECUTIVE_ALERTS = 2;
const HISTOGRAM_RESOLUTION_MS = 20;
const SAMPLE_HISTORY_LIMIT = 60;
const ALERT_HISTORY_LIMIT = 20;
const OVERLAY_WIDTH = 84;
const OVERLAY_MAX_HEIGHT = "80%";
const SAFE_MODE_REASON_MAX_LENGTH = 96;
const STARTUP_CONFIG_LOAD_DELAY_MS = 250;
/**
<!-- {=extensionsWatchdogConfigPathDocs} -->

Path to the optional watchdog JSON config file under the pi agent directory. This is the default
location used for watchdog sampling, threshold overrides, and enable/disable settings.

<!-- {/extensionsWatchdogConfigPathDocs} -->
*/
export const WATCHDOG_CONFIG_PATH = path.join(homedir(), ".pi", "agent", "extensions", "watchdog", "config.json");

export interface WatchdogSample {
	timestamp: number;
	cpuPercent: number;
	rssMb: number;
	heapUsedMb: number;
	heapTotalMb: number;
	eventLoopMeanMs: number;
	eventLoopP99Ms: number;
	eventLoopMaxMs: number;
	safeModeEnabled: boolean;
}

export interface WatchdogThresholds {
	cpuPercent: number;
	rssMb: number;
	heapUsedMb: number;
	eventLoopP99Ms: number;
	eventLoopMaxMs: number;
}

export interface WatchdogConfig {
	enabled?: boolean;
	sampleIntervalMs?: number;
	thresholds?: Partial<WatchdogThresholds>;
}

export interface WatchdogAlert {
	severity: "warning" | "critical";
	reasons: string[];
	sample: WatchdogSample;
}

export const DEFAULT_WATCHDOG_THRESHOLDS: WatchdogThresholds = {
	cpuPercent: 85,
	eventLoopMaxMs: 250,
	eventLoopP99Ms: 120,
	heapUsedMb: 768,
	rssMb: 1200,
};

function toMilliseconds(value: number): number {
	return Number.isFinite(value) ? value / 1_000_000 : 0;
}

/** Amortized O(1) bounded push — trims with copyWithin only when array has doubled past limit. */
function pushBounded<T>(items: T[], item: T, limit: number): void {
	items.push(item);
	if (items.length > limit * 2) {
		items.copyWithin(0, items.length - limit);
		items.length = limit;
	}
}

function formatRelativeAge(timestamp: number, now = Date.now()): string {
	const diffMs = Math.max(0, now - timestamp);
	if (diffMs < 1000) {
		return "just now";
	}
	const seconds = Math.floor(diffMs / 1000);
	if (seconds < 60) {
		return `${seconds}s ago`;
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.floor(minutes / 60);
	return `${hours}h ago`;
}

function clampSampleIntervalMs(value: number | undefined): number {
	if (!Number.isFinite(value)) {
		return DEFAULT_SAMPLE_INTERVAL_MS;
	}
	return Math.min(MAX_SAMPLE_INTERVAL_MS, Math.max(MIN_SAMPLE_INTERVAL_MS, Math.round(value)));
}

function shortenReason(reason: string | null | undefined): string | null {
	if (!reason) {
		return null;
	}
	return reason.length > SAFE_MODE_REASON_MAX_LENGTH ? `${reason.slice(0, SAFE_MODE_REASON_MAX_LENGTH - 1)}…` : reason;
}

function formatThresholdSummary(thresholds: WatchdogThresholds): string {
	return `CPU ${thresholds.cpuPercent}% · RSS ${thresholds.rssMb}MB · Heap ${thresholds.heapUsedMb}MB · P99 ${thresholds.eventLoopP99Ms}ms · Max ${thresholds.eventLoopMaxMs}ms`;
}

function formatSafeModeStatusHint(state: SafeModeState): string | undefined {
	if (!state.enabled) {
		return undefined;
	}
	const source = state.auto ? "watchdog" : (state.source ?? "manual");
	const reason = shortenReason(state.reason);
	return reason ? `safe-mode: ${source} · ${reason}` : `safe-mode: ${source}`;
}

/**
<!-- {=extensionsLoadWatchdogConfigDocs} -->

Load watchdog config from disk and return a safe object. Missing files, invalid JSON, or malformed
values all fall back to an empty config so runtime monitoring can continue safely.

<!-- {/extensionsLoadWatchdogConfigDocs} -->
*/
export function loadWatchdogConfig(configPath = WATCHDOG_CONFIG_PATH): WatchdogConfig {
	try {
		if (!fs.existsSync(configPath)) {
			return {};
		}
		const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown;
		return raw && typeof raw === "object" ? (raw as WatchdogConfig) : {};
	} catch {
		return {};
	}
}

/**
<!-- {=extensionsResolveWatchdogThresholdsDocs} -->

Resolve the effective watchdog thresholds by merging optional config overrides onto the built-in
default thresholds.

<!-- {/extensionsResolveWatchdogThresholdsDocs} -->
*/
export function resolveWatchdogThresholds(config: WatchdogConfig = {}): WatchdogThresholds {
	return {
		...DEFAULT_WATCHDOG_THRESHOLDS,
		...config.thresholds,
	};
}

/**
<!-- {=extensionsResolveWatchdogSampleIntervalMsDocs} -->

Resolve the watchdog sampling interval in milliseconds, clamping configured values into the
supported range and falling back to the default interval when no valid override is provided.

<!-- {/extensionsResolveWatchdogSampleIntervalMsDocs} -->
*/
export function resolveWatchdogSampleIntervalMs(config: WatchdogConfig = {}): number {
	return clampSampleIntervalMs(config.sampleIntervalMs);
}

export function calculateCpuPercent(usage: { user: number; system: number }, elapsedMs: number, coreCount = 1): number {
	if (!(elapsedMs > 0 && Number.isFinite(elapsedMs))) {
		return 0;
	}
	const coreDivisor = Math.max(1, coreCount);
	const usedMs = (usage.user + usage.system) / 1000;
	return Math.max(0, (usedMs / elapsedMs / coreDivisor) * 100);
}

export function createWatchdogSample(input: {
	timestamp: number;
	cpuUsage: { user: number; system: number };
	elapsedMs: number;
	coreCount?: number;
	memoryUsage: { rss: number; heapUsed: number; heapTotal: number };
	eventLoopMeanNs: number;
	eventLoopP99Ns: number;
	eventLoopMaxNs: number;
	safeModeEnabled: boolean;
}): WatchdogSample {
	return {
		cpuPercent: calculateCpuPercent(input.cpuUsage, input.elapsedMs, input.coreCount ?? 1),
		eventLoopMaxMs: toMilliseconds(input.eventLoopMaxNs),
		eventLoopMeanMs: toMilliseconds(input.eventLoopMeanNs),
		eventLoopP99Ms: toMilliseconds(input.eventLoopP99Ns),
		heapTotalMb: input.memoryUsage.heapTotal / MB,
		heapUsedMb: input.memoryUsage.heapUsed / MB,
		rssMb: input.memoryUsage.rss / MB,
		safeModeEnabled: input.safeModeEnabled,
		timestamp: input.timestamp,
	};
}

export function evaluateWatchdogSample(
	sample: WatchdogSample,
	thresholds: WatchdogThresholds = DEFAULT_WATCHDOG_THRESHOLDS,
): WatchdogAlert | null {
	const reasons: string[] = [];
	let severity: WatchdogAlert["severity"] = "warning";

	if (sample.eventLoopP99Ms >= thresholds.eventLoopP99Ms) {
		reasons.push(`event-loop p99 ${sample.eventLoopP99Ms.toFixed(0)}ms`);
	}
	if (sample.eventLoopMaxMs >= thresholds.eventLoopMaxMs) {
		reasons.push(`event-loop max ${sample.eventLoopMaxMs.toFixed(0)}ms`);
		severity = "critical";
	}
	if (sample.cpuPercent >= thresholds.cpuPercent) {
		reasons.push(`cpu ${sample.cpuPercent.toFixed(0)}%`);
	}
	if (sample.rssMb >= thresholds.rssMb) {
		reasons.push(`rss ${sample.rssMb.toFixed(0)}MB`);
		severity = "critical";
	}
	if (sample.heapUsedMb >= thresholds.heapUsedMb) {
		reasons.push(`heap ${sample.heapUsedMb.toFixed(0)}MB`);
	}

	if (reasons.length === 0) {
		return null;
	}

	if (reasons.length >= 3) {
		severity = "critical";
	}

	return { reasons, sample, severity };
}

export function formatWatchdogStatus(sample: WatchdogSample | null): string {
	if (!sample) {
		return "watchdog: waiting for first sample";
	}
	const safeMode = sample.safeModeEnabled ? "safe-mode:on" : "safe-mode:off";
	return [
		`cpu ${sample.cpuPercent.toFixed(0)}%`,
		`rss ${sample.rssMb.toFixed(0)}MB`,
		`heap ${sample.heapUsedMb.toFixed(0)}/${sample.heapTotalMb.toFixed(0)}MB`,
		`lag p99 ${sample.eventLoopP99Ms.toFixed(0)}ms`,
		`max ${sample.eventLoopMaxMs.toFixed(0)}ms`,
		safeMode,
	].join(" · ");
}

export function formatWatchdogAlert(alert: WatchdogAlert): string {
	return `Performance watchdog ${alert.severity}: ${alert.reasons.join(", ")}. Run /watchdog:status or /safe-mode on if input feels laggy.`;
}

export function applySafeMode(
	pi: Pick<ExtensionAPI, "events">,
	enabled: boolean,
	options: { source?: SafeModeSource; reason?: string | null; auto?: boolean } = {},
): SafeModeState {
	const state = setSafeModeState(enabled, {
		auto: options.auto,
		reason: options.reason,
		source: options.source,
	});
	pi.events.emit("oh-pi:safe-mode", state);
	return state;
}

function levelForAlert(alert: WatchdogAlert): "warning" | "error" {
	return alert.severity === "critical" ? "error" : "warning";
}

function shortSafeModeStatus(state: SafeModeState): string {
	if (!state.enabled) {
		return "safe mode is off";
	}
	const source = state.auto ? "watchdog" : (state.source ?? "manual");
	return `safe mode is on (${source}${state.reason ? `: ${state.reason}` : ""})`;
}

function formatLikelyCulpritSummary(diagnostic: ExtensionDiagnostic | undefined): string | null {
	if (!diagnostic) {
		return null;
	}
	const details = diagnostic.reasons.slice(0, 2).join(" · ");
	return details ? `likely culprit ${diagnostic.extensionId} (${details})` : `likely culprit ${diagnostic.extensionId}`;
}

function buildOverlayLines(
	theme: { fg: (color: string, text: string) => string; bold?: (text: string) => string },
	input: {
		enabled: boolean;
		latestSample: WatchdogSample | null;
		sampleHistory: WatchdogSample[];
		alertHistory: WatchdogAlert[];
		thresholds: WatchdogThresholds;
		safeModeState: SafeModeState;
		sampleIntervalMs: number;
		diagnostics: ExtensionDiagnostic[];
	},
): string[] {
	const now = Date.now();
	const title = theme.bold ? theme.bold("Performance Watchdog") : "Performance Watchdog";
	const lines: string[] = [theme.fg("toolTitle", title), ""];
	lines.push(`${theme.fg("accent", "State:")} ${input.enabled ? "enabled" : "disabled"}`);
	lines.push(`${theme.fg("accent", "Sampling:")} every ${input.sampleIntervalMs}ms`);
	lines.push(`${theme.fg("accent", "Safe mode:")} ${shortSafeModeStatus(input.safeModeState)}`);
	lines.push("");
	lines.push(theme.fg("accent", "Current sample"));
	lines.push(input.latestSample ? formatWatchdogStatus(input.latestSample) : "No samples recorded yet.");
	lines.push("");
	lines.push(theme.fg("accent", "Thresholds"));
	lines.push(formatThresholdSummary(input.thresholds));
	lines.push("");
	lines.push(theme.fg("accent", "Recent alerts"));
	if (input.alertHistory.length === 0) {
		lines.push(theme.fg("dim", "No alerts yet."));
	} else {
		for (const alert of input.alertHistory.slice(-6).toReversed()) {
			const color = alert.severity === "critical" ? "error" : "warning";
			lines.push(
				`${theme.fg(color, alert.severity.toUpperCase())} · ${alert.reasons.join(", ")} · ${theme.fg("dim", formatRelativeAge(alert.sample.timestamp, now))}`,
			);
		}
	}
	lines.push("");
	lines.push(theme.fg("accent", "Recent samples"));
	if (input.sampleHistory.length === 0) {
		lines.push(theme.fg("dim", "No samples yet."));
	} else {
		for (const sample of input.sampleHistory.slice(-8).toReversed()) {
			lines.push(
				`${theme.fg("dim", formatRelativeAge(sample.timestamp, now))} · cpu ${sample.cpuPercent.toFixed(0)}% · rss ${sample.rssMb.toFixed(0)}MB · p99 ${sample.eventLoopP99Ms.toFixed(0)}ms · max ${sample.eventLoopMaxMs.toFixed(0)}ms`,
			);
		}
	}
	lines.push("");
	lines.push(theme.fg("accent", "Likely extension culprits"));
	if (input.diagnostics.length === 0) {
		lines.push(theme.fg("dim", "No suspicious extension activity recorded."));
	} else {
		for (const diagnostic of input.diagnostics.slice(0, 5)) {
			lines.push(`${theme.fg("warning", diagnostic.extensionId)} · ${diagnostic.reasons.join(" · ")}`);
		}
	}
	lines.push("");
	lines.push(theme.fg("dim", `Config: ${WATCHDOG_CONFIG_PATH}`));
	lines.push(theme.fg("dim", "Keys: [r] sample now · [s] toggle safe mode · [q/Esc/Space] close"));
	return lines;
}

/**
<!-- {=extensionsWatchdogAlertBehaviorDocs} -->

The watchdog samples CPU, memory, and event-loop lag on an interval, records recent samples and
alerts, and can escalate into safe mode automatically when repeated alerts indicate sustained UI
churn or lag. Toast notifications are intentionally capped per session; ongoing watchdog state is
kept visible in the status bar and the `/watchdog` overlay instead of repeatedly spamming the
terminal.

<!-- {/extensionsWatchdogAlertBehaviorDocs} -->
*/
export default function watchdogExtension(pi: ExtensionAPI) {
	installRuntimeDiagnostics(pi);
	let thresholds = DEFAULT_WATCHDOG_THRESHOLDS;
	let sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS;
	const histogram = monitorEventLoopDelay({ resolution: HISTOGRAM_RESOLUTION_MS });

	const coreCount = Math.max(1, cpus().length || 1);
	const sampleHistory: WatchdogSample[] = [];
	const alertHistory: WatchdogAlert[] = [];
	let activeCtx: ExtensionContext | ExtensionCommandContext | null = null;
	let latestSample: WatchdogSample | null = null;
	let lastAlertAt = 0;
	let consecutiveAlerts = 0;
	let alertNotificationCount = 0;
	let latestAlertMessage: string | null = null;
	let enabled = true;
	let timer: ReturnType<typeof setInterval> | null = null;
	let lastCpuUsage = process.cpuUsage();
	let lastSampleAt = Date.now();
	let configLoaded = false;
	let startupConfigTimer: ReturnType<typeof setTimeout> | null = null;
	const statusBar = createStatusBarState();

	const setAlertStatus = (text: string | undefined) => {
		statusBar.set(activeCtx, "watchdog", text);
	};

	const setSafeModeStatus = (state = getSafeModeState()) => {
		statusBar.set(activeCtx, "safe-mode", formatSafeModeStatusHint(state));
	};

	const stopTimer = () => {
		if (!timer) {
			return;
		}
		clearInterval(timer);
		timer = null;
	};

	const ensureTimer = () => {
		if (timer || !enabled) {
			return;
		}
		timer = setInterval(() => {
			takeSample();
		}, sampleIntervalMs);
		timer.unref?.();
	};

	const applyLoadedConfig = (config: WatchdogConfig) => {
		const nextThresholds = resolveWatchdogThresholds(config);
		const nextSampleIntervalMs = resolveWatchdogSampleIntervalMs(config);
		const nextEnabled = config.enabled !== false;
		const intervalChanged = nextSampleIntervalMs !== sampleIntervalMs;
		const enabledChanged = nextEnabled !== enabled;

		thresholds = nextThresholds;
		sampleIntervalMs = nextSampleIntervalMs;
		enabled = nextEnabled;
		configLoaded = true;

		if (intervalChanged || !enabled || enabledChanged) {
			stopTimer();
		}
		if (!enabled) {
			setAlertStatus(undefined);
			return;
		}
		ensureTimer();
	};

	const cancelStartupConfigLoad = () => {
		if (!startupConfigTimer) {
			return;
		}
		clearTimeout(startupConfigTimer);
		startupConfigTimer = null;
	};

	const loadConfigNow = () => {
		cancelStartupConfigLoad();
		if (configLoaded) {
			return;
		}
		applyLoadedConfig(loadWatchdogConfig());
	};

	const scheduleStartupConfigLoad = () => {
		cancelStartupConfigLoad();
		if (configLoaded) {
			return;
		}
		startupConfigTimer = setTimeout(() => {
			startupConfigTimer = null;
			loadConfigNow();
		}, STARTUP_CONFIG_LOAD_DELAY_MS);
		startupConfigTimer.unref?.();
	};

	const takeSample = () => {
		if (!enabled) {
			setAlertStatus(undefined);
			return latestSample;
		}

		const now = Date.now();
		const elapsedMs = Math.max(1, now - lastSampleAt);
		const cpuNow = process.cpuUsage();
		const cpuDelta = {
			system: cpuNow.system - lastCpuUsage.system,
			user: cpuNow.user - lastCpuUsage.user,
		};
		lastCpuUsage = cpuNow;
		lastSampleAt = now;

		latestSample = createWatchdogSample({
			coreCount,
			cpuUsage: cpuDelta,
			elapsedMs,
			eventLoopMaxNs: Number(histogram.max),
			eventLoopMeanNs: Number(histogram.mean),
			eventLoopP99Ns: Number(histogram.percentile(99)),
			memoryUsage: process.memoryUsage(),
			safeModeEnabled: getSafeModeState().enabled,
			timestamp: now,
		});
		histogram.reset();
		pushBounded(sampleHistory, latestSample, SAMPLE_HISTORY_LIMIT);

		const alert = evaluateWatchdogSample(latestSample, thresholds);
		if (!alert) {
			consecutiveAlerts = 0;
			setAlertStatus(undefined);
			return latestSample;
		}

		consecutiveAlerts += 1;
		pushBounded(alertHistory, alert, ALERT_HISTORY_LIMIT);
		const culprit = getExtensionDiagnostics(now)[0];
		const culpritSummary = formatLikelyCulpritSummary(culprit);
		latestAlertMessage = culpritSummary
			? `watchdog: ${alert.reasons.join(", ")} · ${culpritSummary}`
			: `watchdog: ${alert.reasons.join(", ")}`;
		setAlertStatus(latestAlertMessage);

		if (
			activeCtx?.hasUI &&
			now - lastAlertAt >= ALERT_COOLDOWN_MS &&
			alertNotificationCount < ALERT_NOTIFICATION_LIMIT
		) {
			lastAlertAt = now;
			alertNotificationCount += 1;
			if (alertNotificationCount >= ALERT_NOTIFICATION_LIMIT) {
				activeCtx.ui.notify(
					`${formatWatchdogAlert(alert)} Further alerts suppressed — check status bar or /watchdog:overlay.`,
					levelForAlert(alert),
				);
			} else {
				activeCtx.ui.notify(formatWatchdogAlert(alert), levelForAlert(alert));
			}
		}

		if (
			consecutiveAlerts >= AUTO_SAFE_MODE_AFTER_CONSECUTIVE_ALERTS &&
			!getSafeModeState().enabled &&
			activeCtx?.hasUI
		) {
			const state = applySafeMode(pi, true, {
				auto: true,
				reason: alert.reasons.join(", "),
				source: "watchdog",
			});
			setSafeModeStatus(state);
			activeCtx.ui.notify(`Watchdog enabled safe mode automatically: ${shortSafeModeStatus(state)}.`, "warning");
		}

		return latestSample;
	};

	const resetCounters = () => {
		histogram.enable();
		lastCpuUsage = process.cpuUsage();
		lastSampleAt = Date.now();
		consecutiveAlerts = 0;
		histogram.reset();
	};

	const resetHistory = () => {
		resetCounters();
		latestSample = null;
		lastAlertAt = 0;
		alertNotificationCount = 0;
		latestAlertMessage = null;
		sampleHistory.length = 0;
		alertHistory.length = 0;
		setAlertStatus(undefined);
	};

	const notifyStatus = (ctx: ExtensionCommandContext | ExtensionContext) => {
		loadConfigNow();
		takeSample();
		const culprit = getExtensionDiagnostics()[0];
		const culpritSummary = formatLikelyCulpritSummary(culprit);
		ctx.ui.notify(
			`${formatWatchdogStatus(latestSample)} · ${formatThresholdSummary(thresholds)}${culpritSummary ? ` · ${culpritSummary}` : ""}`,
			"info",
		);
	};

	const notifyBlame = (ctx: ExtensionCommandContext | ExtensionContext) => {
		const diagnostics = getExtensionDiagnostics();
		if (diagnostics.length === 0) {
			ctx.ui.notify("No suspicious extension activity recorded yet.", "info");
			return;
		}
		ctx.ui.notify(
			`Watchdog diagnostics: ${diagnostics.slice(0, 3).map(formatExtensionDiagnostic).join(" | ")}`,
			"warning",
		);
	};

	const notifyStartupBreakdown = (ctx: ExtensionCommandContext | ExtensionContext) => {
		const diagnostics = getStartupDiagnostics();
		if (diagnostics.length === 0) {
			ctx.ui.notify("No startup timings recorded yet. Restart the session and run /watchdog:startup.", "info");
			return;
		}

		const totalLastStartupMs = diagnostics.reduce((total, diagnostic) => total + diagnostic.lastMs, 0);
		ctx.ui.notify(
			`Startup timings: total ${totalLastStartupMs.toFixed(1)}ms | ${diagnostics.slice(0, 5).map(formatStartupDiagnostic).join(" | ")}`,
			"info",
		);
	};

	const notifyConfig = (ctx: ExtensionCommandContext | ExtensionContext) => {
		loadConfigNow();
		ctx.ui.notify(
			`watchdog config: ${enabled ? "enabled" : "disabled"} · interval ${sampleIntervalMs}ms · ${formatThresholdSummary(thresholds)} · ${WATCHDOG_CONFIG_PATH}`,
			"info",
		);
	};

	const openOverlay = async (ctx: ExtensionCommandContext | ExtensionContext) => {
		activeCtx = ctx;
		loadConfigNow();
		setSafeModeStatus();
		takeSample();
		await ctx.ui.custom(
			(tui, theme, _keybindings, done) => ({
				render(width: number) {
					return buildOverlayLines(theme, {
						alertHistory,
						diagnostics: getExtensionDiagnostics(),
						enabled,
						latestSample,
						safeModeState: getSafeModeState(),
						sampleHistory,
						sampleIntervalMs,
						thresholds,
					}).map((line) => line.slice(0, width));
				},
				handleInput(data: string) {
					if (data === "q" || data === "\u001b" || data === " " || data === "\r") {
						done();
						return;
					}
					if (data === "r") {
						takeSample();
						tui.requestRender();
						return;
					}
					if (data === "s") {
						const state = applySafeMode(pi, !getSafeModeState().enabled, {
							auto: false,
							reason: getSafeModeState().enabled ? null : "enabled from watchdog overlay",
							source: "manual",
						});
						setSafeModeStatus(state);
						takeSample();
						tui.requestRender();
					}
				},
				// Biome-ignore lint/suspicious/noEmptyBlockStatements: required by Component interface
				dispose() {},
			}),
			{ overlay: true, overlayOptions: { anchor: "center", maxHeight: OVERLAY_MAX_HEIGHT, width: OVERLAY_WIDTH } },
		);
	};

	subscribeSafeMode((state) => {
		setSafeModeStatus(state);
		if (latestSample) {
			latestSample = { ...latestSample, safeModeEnabled: state.enabled };
		}
	});

	const watchdogCommand = {
		description:
			"Inspect or control the performance watchdog: /watchdog:status|startup|overlay|dashboard|config|reset|on|off|sample|blame",
		async handler(args, ctx) {
			activeCtx = ctx;
			setSafeModeStatus();
			loadConfigNow();
			const command = args.trim().toLowerCase() || "status";
			switch (command) {
				case "on": {
					enabled = true;
					resetCounters();
					ensureTimer();
					ctx.ui.notify("Performance watchdog enabled.", "info");
					return;
				}
				case "off": {
					enabled = false;
					stopTimer();
					setAlertStatus(undefined);
					ctx.ui.notify("Performance watchdog disabled.", "warning");
					return;
				}
				case "sample": {
					latestSample = takeSample();
					ctx.ui.notify(formatWatchdogStatus(latestSample), "info");
					return;
				}
				case "reset": {
					resetHistory();
					ctx.ui.notify("Performance watchdog history reset.", "info");
					return;
				}
				case "overlay":
				case "dashboard": {
					await openOverlay(ctx);
					return;
				}
				case "config": {
					notifyConfig(ctx);
					return;
				}
				case "blame": {
					notifyBlame(ctx);
					return;
				}
				case "startup": {
					notifyStartupBreakdown(ctx);
					return;
				}
				default: {
					notifyStatus(ctx);
				}
			}
		},
	};

	pi.registerCommand("watchdog", watchdogCommand);

	const watchdogAliases: { name: string; subcommand: string; description: string }[] = [
		{ description: "Show the current watchdog status.", name: "watchdog:status", subcommand: "status" },
		{ description: "Show watchdog startup timings.", name: "watchdog:startup", subcommand: "startup" },
		{ description: "Open the watchdog overlay.", name: "watchdog:overlay", subcommand: "overlay" },
		{ description: "Open the watchdog dashboard overlay.", name: "watchdog:dashboard", subcommand: "dashboard" },
		{ description: "Show the watchdog config file path and settings.", name: "watchdog:config", subcommand: "config" },
		{ description: "Reset watchdog metrics and alert history.", name: "watchdog:reset", subcommand: "reset" },
		{ description: "Enable the performance watchdog.", name: "watchdog:on", subcommand: "on" },
		{ description: "Disable the performance watchdog.", name: "watchdog:off", subcommand: "off" },
		{ description: "Capture a watchdog sample right now.", name: "watchdog:sample", subcommand: "sample" },
		{ description: "Show the watchdog blame report.", name: "watchdog:blame", subcommand: "blame" },
	];

	for (const alias of watchdogAliases) {
		pi.registerCommand(alias.name, {
			description: alias.description,
			handler: (args, ctx) => watchdogCommand.handler(args ? `${alias.subcommand} ${args}` : alias.subcommand, ctx),
		});
	}

	pi.registerCommand("safe-mode", {
		description: "Reduce nonessential UI churn: /safe-mode [on|off|status]",
		async handler(args, ctx) {
			activeCtx = ctx;
			const command = args.trim().toLowerCase() || "status";
			switch (command) {
				case "on": {
					const state = applySafeMode(pi, true, { auto: false, reason: "enabled by user", source: "manual" });
					setSafeModeStatus(state);
					ctx.ui.notify(`Enabled ${shortSafeModeStatus(state)}.`, "warning");
					return;
				}
				case "off": {
					const state = applySafeMode(pi, false, { auto: false, reason: null, source: "manual" });
					setSafeModeStatus(state);
					ctx.ui.notify(`Disabled ${shortSafeModeStatus(state)}.`, "success");
					setAlertStatus(undefined);
					consecutiveAlerts = 0;
					return;
				}
				default: {
					setSafeModeStatus();
					ctx.ui.notify(shortSafeModeStatus(getSafeModeState()), "info");
				}
			}
		},
	});

	pi.on("session_start", (_event, ctx) => {
		activeCtx = ctx;
		resetCounters();
		setSafeModeStatus();
		ensureTimer();
		scheduleStartupConfigLoad();
	});

	pi.on("session_switch", (_event, ctx) => {
		activeCtx = ctx;
		loadConfigNow();
		resetCounters();
		setSafeModeStatus();
		ensureTimer();
	});

	pi.on("session_shutdown", () => {
		cancelStartupConfigLoad();
		setAlertStatus(undefined);
		statusBar.set(activeCtx, "safe-mode", undefined);
		stopTimer();
		histogram.disable();
	});
}
