/**
Usage Tracker Extension — Rate Limit & Cost Monitor for pi

<!-- {=extensionsUsageTrackerOverview} -->

The usage-tracker extension is a CodexBar-inspired provider quota and cost monitor for pi. It
shows provider-level rate limits for Anthropic, OpenAI, and Google using pi-managed auth, while
also tracking per-model token usage and session costs locally.

<!-- {/extensionsUsageTrackerOverview} -->

<!-- {=extensionsUsageTrackerPersistenceDocs} -->

Usage-tracker persists rolling 30-day cost history and the last known provider rate-limit snapshot
under the pi agent directory. That lets the widget and dashboard survive restarts and keep showing
recent subscription windows when a live provider probe is temporarily rate-limited or unavailable.

<!-- {/extensionsUsageTrackerPersistenceDocs} -->

<!-- {=extensionsUsageTrackerCommandsDocs} -->

Key usage-tracker surfaces:

- widget above the editor for at-a-glance quotas and session totals
- `/usage` for the full dashboard overlay
- `Ctrl+U` as a shortcut for the same overlay
- `/usage-toggle` to show or hide the widget
- `/usage-refresh` to force fresh provider probes
- `usage_report` so the agent can answer quota and spend questions directly

<!-- {/extensionsUsageTrackerCommandsDocs} -->
*/

import { existsSync, promises as fsp, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { type ExtensionAPI, type ExtensionContext, getAgentDir } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { getSafeModeState, subscribeSafeMode } from "./runtime-mode.js";
import {
	clampPercent,
	computeWindowPace,
	fmtCost,
	fmtDuration,
	fmtTokens,
	formatPaceLeft,
	formatPaceRight,
	pctColor,
	progressBar,
	truncateAnsi,
} from "./usage-tracker-formatting.js";
import {
	AUTH_KEY_TO_PROVIDER,
	ensureFreshToken,
	hasProviderDisplayData,
	probeAnthropicDirect,
	probeGoogleDirect,
	probeOllamaDirect,
	probeOpenAIDirect,
	providerDisplayName,
	readPiAuth,
	shouldPreserveStaleWindows,
} from "./usage-tracker-providers.js";
import {
	COST_THRESHOLDS,
	type HistoricalCostPoint,
	type ModelUsage,
	type PiAuthEntry,
	PROBE_COOLDOWN_MS,
	type ProviderKey,
	type ProviderRateLimits,
	ROLLING_COST_WINDOW_MS,
	ROLLING_HISTORY_MAX_POINTS,
	type SourceUsage,
	type TurnSnapshot,
	type UsageSample,
} from "./usage-tracker-shared.js";

// ─── Extension entry point ──────────────────────────────────────────────────

const KEYBINDINGS_SYNC_DELAY_MS = 250;
const STARTUP_REFRESH_DELAY_MS = 250;
const STARTUP_DEFER_ENTRY_THRESHOLD = 250;
const PERSISTED_STATE_LOAD_DELAY_MS = 250;

/**
 * Ensure `ctrl+u` is unbound from the built-in `deleteToLineStart` action
 * so the usage-tracker shortcut takes priority without a conflict warning.
 *
 * Reads `~/.pi/agent/keybindings.json`, sets `deleteToLineStart: []` if not
 * already configured, and writes back. This is a one-time idempotent operation.
 */
function ensureCtrlUUnbound(): void {
	const keybindingsPath = join(getAgentDir(), "keybindings.json");
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
	return join(getAgentDir(), "usage-tracker-history.json");
}

/**
<!-- {=extensionsUsageTrackerPersistenceDocs} -->

Usage-tracker persists rolling 30-day cost history and the last known provider rate-limit snapshot
under the pi agent directory. That lets the widget and dashboard survive restarts and keep showing
recent subscription windows when a live provider probe is temporarily rate-limited or unavailable.

<!-- {/extensionsUsageTrackerPersistenceDocs} -->
*/
function getRateLimitCachePath(): string {
	return join(getAgentDir(), "usage-tracker-rate-limits.json");
}

export default function usageTracker(pi: ExtensionAPI) {
	let keybindingsSyncScheduled = false;
	let persistedStateLoadPromise: Promise<void> | null = null;
	let persistedStateLoadScheduled = false;
	let persistedStateLoadTimer: ReturnType<typeof setTimeout> | null = null;
	let startupRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	let requestWidgetRender: (() => void) | null = null;
	let lastWidgetSignature: string | null = null;

	const getUsageWidgetSignature = (ctx: ExtensionContext | null | undefined = activeCtx): string => {
		if (!widgetVisible) {
			return "hidden";
		}
		if (getSafeModeState().enabled) {
			return "safe-mode";
		}

		const activeProvider = getActiveProvider(ctx);
		const totals = getTotals(activeProvider);
		const visibleTotals =
			activeProvider && totals.turns > 0
				? {
						cost: totals.cost,
						input: totals.input,
						output: totals.output,
					}
				: null;
		const visibleRateLimits = getRateLimitEntries(activeProvider)
			.filter((rl) => !(rl.error || rl.windows.length === 0))
			.map((rl) => ({
				provider: rl.provider,
				windows: rl.windows.map((window) => ({
					label: window.label,
					percentLeft: window.percentLeft,
					resetDescription: window.resetDescription,
				})),
			}));

		return JSON.stringify({
			activeProvider,
			visibleTotals,
			visibleRateLimits,
		});
	};

	const requestUsageWidgetRender = (ctx: ExtensionContext | null | undefined = activeCtx) => {
		const nextSignature = getUsageWidgetSignature(ctx);
		if (nextSignature === lastWidgetSignature) {
			return;
		}
		lastWidgetSignature = nextSignature;
		requestWidgetRender?.();
	};

	const scheduleCtrlUUnbound = () => {
		if (keybindingsSyncScheduled) {
			return;
		}

		keybindingsSyncScheduled = true;
		setTimeout(() => {
			keybindingsSyncScheduled = false;
			ensureCtrlUUnbound();
		}, KEYBINDINGS_SYNC_DELAY_MS);
	};

	// Unbind ctrl+u from deleteToLineStart without doing sync fs work on extension load.
	scheduleCtrlUUnbound();

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
	/** Last provider explicitly opened in the usage dashboard. */
	let lastSelectedUsageProvider: ProviderKey | null = null;
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
	/** Persistent cache of last known provider rate limits. */
	const rateLimitCachePath = getRateLimitCachePath();

	function pruneRollingHistory(now = Date.now()): void {
		const cutoff = now - ROLLING_COST_WINDOW_MS;
		let write = 0;
		// biome-ignore lint/style/useForOf: C-style loop needed for write-pointer in-place filter algorithm
		for (let read = 0; read < rollingHistory.length; read++) {
			const entry = rollingHistory[read];
			if (Number.isFinite(entry.timestamp) && entry.timestamp >= cutoff) {
				rollingHistory[write++] = entry;
			}
		}
		rollingHistory.length = write;
		if (rollingHistory.length > ROLLING_HISTORY_MAX_POINTS) {
			const excess = rollingHistory.length - ROLLING_HISTORY_MAX_POINTS;
			rollingHistory.copyWithin(0, excess);
			rollingHistory.length = ROLLING_HISTORY_MAX_POINTS;
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

	async function loadRollingHistory(): Promise<void> {
		try {
			const raw = JSON.parse(await fsp.readFile(usageHistoryPath, "utf-8")) as { entries?: unknown };
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

	const PERSIST_DEBOUNCE_MS = 10_000;
	let rollingHistoryDirty = false;
	let rollingHistorySaveTimer: ReturnType<typeof setTimeout> | null = null;

	/** Mark rolling history as dirty and schedule a debounced save. */
	function scheduleRollingHistorySave(): void {
		rollingHistoryDirty = true;
		if (rollingHistorySaveTimer) {
			return;
		}
		rollingHistorySaveTimer = setTimeout(() => {
			rollingHistorySaveTimer = null;
			if (rollingHistoryDirty) {
				rollingHistoryDirty = false;
				saveRollingHistory();
			}
		}, PERSIST_DEBOUNCE_MS);
		rollingHistorySaveTimer.unref?.();
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

	function normalizeProviderRateLimits(value: unknown): ProviderRateLimits | null {
		if (!value || typeof value !== "object") {
			return null;
		}
		const candidate = value as Partial<ProviderRateLimits> & { windows?: unknown };
		if (
			!(
				candidate.provider === "anthropic" ||
				candidate.provider === "openai" ||
				candidate.provider === "google" ||
				candidate.provider === "ollama"
			)
		) {
			return null;
		}
		const windows = Array.isArray(candidate.windows)
			? candidate.windows
					.map((window) => {
						if (!window || typeof window !== "object") {
							return null;
						}
						const item = window as {
							label?: unknown;
							percentLeft?: unknown;
							resetDescription?: unknown;
							windowMinutes?: unknown;
						};
						if (typeof item.label !== "string") {
							return null;
						}
						const percentLeft = Number(item.percentLeft);
						if (!Number.isFinite(percentLeft)) {
							return null;
						}
						const windowMinutes = item.windowMinutes == null ? null : Number(item.windowMinutes);
						return {
							label: item.label,
							percentLeft: clampPercent(percentLeft),
							resetDescription: typeof item.resetDescription === "string" ? item.resetDescription : null,
							windowMinutes: Number.isFinite(windowMinutes) ? windowMinutes : null,
						};
					})
					.filter((window): window is NonNullable<typeof window> => window !== null)
			: [];
		const probedAt = Number(candidate.probedAt);
		return {
			provider: candidate.provider,
			windows,
			credits: typeof candidate.credits === "number" && Number.isFinite(candidate.credits) ? candidate.credits : null,
			account: typeof candidate.account === "string" ? candidate.account : null,
			plan: typeof candidate.plan === "string" ? candidate.plan : null,
			note: typeof candidate.note === "string" ? candidate.note : null,
			probedAt: Number.isFinite(probedAt) ? probedAt : Date.now(),
			error: typeof candidate.error === "string" ? candidate.error : null,
		};
	}

	async function loadRateLimitCache(): Promise<void> {
		try {
			const raw = JSON.parse(await fsp.readFile(rateLimitCachePath, "utf-8")) as { providers?: unknown };
			if (!raw.providers || typeof raw.providers !== "object") {
				return;
			}
			for (const value of Object.values(raw.providers)) {
				const providerRateLimits = normalizeProviderRateLimits(value);
				if (!providerRateLimits) {
					continue;
				}
				const existing = rateLimits.get(providerRateLimits.provider);
				if (existing && shouldPreserveStaleWindows(providerRateLimits, existing)) {
					rateLimits.set(providerRateLimits.provider, {
						...existing,
						windows: providerRateLimits.windows.map((window) => ({ ...window })),
						note: existing.note
							? `${existing.note} Showing last known window values.`
							: "Showing last known window values.",
					});
					continue;
				}
				if (!existing || existing.probedAt <= providerRateLimits.probedAt) {
					rateLimits.set(providerRateLimits.provider, providerRateLimits);
				}
			}
		} catch {
			// Non-critical. The next live probe will repopulate provider data.
		}
	}

	let rateLimitCacheDirty = false;
	let rateLimitCacheSaveTimer: ReturnType<typeof setTimeout> | null = null;

	/** Mark rate limit cache as dirty and schedule a debounced save. */
	function scheduleRateLimitCacheSave(): void {
		rateLimitCacheDirty = true;
		if (rateLimitCacheSaveTimer) {
			return;
		}
		rateLimitCacheSaveTimer = setTimeout(() => {
			rateLimitCacheSaveTimer = null;
			if (rateLimitCacheDirty) {
				rateLimitCacheDirty = false;
				saveRateLimitCache();
			}
		}, PERSIST_DEBOUNCE_MS);
		rateLimitCacheSaveTimer.unref?.();
	}

	function saveRateLimitCache(): void {
		try {
			const dir = dirname(rateLimitCachePath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}
			const providers = Object.fromEntries(
				Array.from(rateLimits.entries()).map(([provider, value]) => [provider, value]),
			);
			writeFileSync(rateLimitCachePath, `${JSON.stringify({ version: 1, providers }, null, 2)}\n`, "utf-8");
		} catch {
			// Non-critical. We can still rely on in-memory provider data.
		}
	}

	const loadPersistedState = async (): Promise<void> => {
		if (persistedStateLoadPromise) {
			await persistedStateLoadPromise;
			return;
		}

		persistedStateLoadPromise = (async () => {
			await Promise.all([loadRollingHistory(), loadRateLimitCache()]);
			requestUsageWidgetRender();
			broadcastUsageData();
		})();

		await persistedStateLoadPromise;
	};

	const schedulePersistedStateLoad = () => {
		if (persistedStateLoadPromise || persistedStateLoadScheduled) {
			return;
		}

		persistedStateLoadScheduled = true;
		persistedStateLoadTimer = setTimeout(() => {
			persistedStateLoadScheduled = false;
			persistedStateLoadTimer = null;
			loadPersistedState().catch(() => undefined);
		}, PERSISTED_STATE_LOAD_DELAY_MS);
		persistedStateLoadTimer.unref?.();
	};

	const clearPersistedStateLoadTimer = () => {
		if (!persistedStateLoadTimer) {
			return;
		}
		clearTimeout(persistedStateLoadTimer);
		persistedStateLoadTimer = null;
		persistedStateLoadScheduled = false;
	};

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

	function normalizeProviderKey(value: unknown): ProviderKey | null {
		if (typeof value !== "string") {
			return null;
		}

		switch (value.trim().toLowerCase()) {
			case "anthropic":
			case "claude":
			case "sonnet":
			case "opus":
			case "haiku":
				return "anthropic";
			case "openai":
			case "chatgpt":
			case "codex":
			case "gpt":
			case "o1":
			case "o3":
			case "o4":
			case "openai-codex":
				return "openai";
			case "google":
			case "gemini":
			case "flash":
			case "pro-exp":
			case "antigravity":
			case "google-antigravity":
			case "google-gemini-cli":
				return "google";
			case "ollama":
			case "ollama-cloud":
				return "ollama";
			default:
				return null;
		}
	}

	const ANTHROPIC_MODEL_RE = /claude|sonnet|opus|haiku/;
	const OPENAI_MODEL_RE = /gpt|o1|o3|o4|codex/;
	const GOOGLE_MODEL_RE = /gemini|flash|pro-exp|antigravity/;
	const OLLAMA_MODEL_RE = /ollama/;

	function inferProviderFromModel(model: { id?: unknown; provider?: unknown } | null | undefined): ProviderKey | null {
		const explicitProvider = normalizeProviderKey(model?.provider);
		if (explicitProvider) {
			return explicitProvider;
		}

		const id = typeof model?.id === "string" ? model.id.toLowerCase() : "";
		if (!id) {
			return null;
		}

		if (ANTHROPIC_MODEL_RE.test(id)) {
			return "anthropic";
		}

		if (OPENAI_MODEL_RE.test(id)) {
			return "openai";
		}

		if (GOOGLE_MODEL_RE.test(id)) {
			return "google";
		}

		if (OLLAMA_MODEL_RE.test(id)) {
			return "ollama";
		}

		return null;
	}

	function hasOllamaModel(models: Map<string, ModelUsage>): boolean {
		for (const model of models.values()) {
			if (normalizeProviderKey(model.provider) === "ollama") {
				return true;
			}
		}
		return false;
	}

	function getActiveProvider(ctx: ExtensionContext | null | undefined = activeCtx): ProviderKey | null {
		return inferProviderFromModel(ctx?.model as { id?: unknown; provider?: unknown } | null | undefined);
	}

	function getCurrentModelId(ctx: ExtensionContext | null | undefined = activeCtx): string {
		return typeof ctx?.model?.id === "string" ? ctx.model.id : "no-model";
	}

	function getModelUsageEntries(provider: ProviderKey | null = null): ModelUsage[] {
		if (!provider) {
			return [...models.values()];
		}
		const result: ModelUsage[] = [];
		for (const entry of models.values()) {
			if (normalizeProviderKey(entry.provider) === provider) {
				result.push(entry);
			}
		}
		return result;
	}

	function getRateLimitEntries(provider: ProviderKey | null = null): ProviderRateLimits[] {
		if (!provider) {
			return [...rateLimits.values()];
		}
		const result: ProviderRateLimits[] = [];
		for (const entry of rateLimits.values()) {
			if (entry.provider === provider) {
				result.push(entry);
			}
		}
		return result;
	}

	function getTotals(provider: ProviderKey | null = null) {
		let input = 0;
		let output = 0;
		let cacheRead = 0;
		let cacheWrite = 0;
		let cost = 0;
		let turns = 0;
		for (const model of getModelUsageEntries(provider)) {
			input += model.input;
			output += model.output;
			cacheRead += model.cacheRead;
			cacheWrite += model.cacheWrite;
			cost += model.costTotal;
			turns += model.turns;
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

	function getSelectableProviders(preferredProvider: ProviderKey | null): ProviderKey[] {
		const ordered: ProviderKey[] = [];
		const seen = new Set<ProviderKey>();

		const add = (provider: ProviderKey | null) => {
			if (!(provider && !seen.has(provider))) {
				return;
			}
			seen.add(provider);
			ordered.push(provider);
		};

		add(preferredProvider);
		add(lastSelectedUsageProvider);

		for (const rateLimit of rateLimits.values()) {
			if (hasProviderDisplayData(rateLimit)) {
				add(rateLimit.provider);
			}
		}

		for (const model of models.values()) {
			add(normalizeProviderKey(model.provider));
		}

		return ordered;
	}

	function formatProviderOption(
		provider: ProviderKey,
		currentProvider: ProviderKey | null,
		ctx: ExtensionContext,
	): string {
		const totals = getTotals(provider);
		const details: string[] = [];

		if (provider === currentProvider) {
			details.push(`current model (${getCurrentModelId(ctx)})`);
		} else if (provider === lastSelectedUsageProvider) {
			details.push("recently viewed");
		}

		if (getRateLimitEntries(provider).some(hasProviderDisplayData)) {
			details.push("rate limits");
		}

		if (totals.turns > 0) {
			details.push(`${totals.turns} ${totals.turns === 1 ? "turn" : "turns"}`);
			details.push(fmtCost(totals.cost));
		} else {
			details.push("no session usage");
		}

		return [providerDisplayName(provider), ...details].join(" — ");
	}

	function resolveUsageProviderFromArgs(ctx: ExtensionContext, args: string): ProviderKey | null {
		const raw = args.trim();
		if (!raw) {
			return null;
		}

		if (raw.toLowerCase() === "current") {
			return getActiveProvider(ctx);
		}

		const direct = normalizeProviderKey(raw);
		if (direct) {
			return direct;
		}

		const lower = raw.toLowerCase();
		return (
			getSelectableProviders(getActiveProvider(ctx)).find((provider) => {
				return providerDisplayName(provider).toLowerCase().includes(lower);
			}) ?? null
		);
	}

	async function selectUsageProvider(ctx: ExtensionContext, args: string): Promise<ProviderKey | null> {
		const currentProvider = getActiveProvider(ctx);
		const requestedProvider = resolveUsageProviderFromArgs(ctx, args);
		if (requestedProvider) {
			return requestedProvider;
		}

		if (args.trim()) {
			ctx.ui.notify(`Unknown provider "${args.trim()}". Showing provider picker instead.`, "warning");
		}

		const providers = getSelectableProviders(currentProvider);
		if (providers.length === 0) {
			return currentProvider;
		}
		if (providers.length === 1 || typeof ctx.ui.select !== "function") {
			return providers[0] ?? currentProvider;
		}

		const options = providers.map((provider) => formatProviderOption(provider, currentProvider, ctx));
		const optionToProvider = new Map(options.map((option, index) => [option, providers[index]]));
		const selected = await ctx.ui.select(
			`Select usage provider\nCurrent model: ${getCurrentModelId(ctx)}\nType to search`,
			options,
		);
		if (!selected) {
			return null;
		}
		return optionToProvider.get(selected) ?? null;
	}

	async function openUsageOverlay(ctx: ExtensionContext, provider: ProviderKey | null): Promise<void> {
		lastSelectedUsageProvider = provider;

		await ctx.ui.custom(
			(_tui, theme, _keybindings, done) => {
				const lines = generateRichReport(ctx, theme, provider);
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
		const cutoff = now - 3_600_000;
		while (turnHistory.length > 0 && turnHistory[0].timestamp < cutoff) {
			turnHistory.shift();
		}

		if (options.persist !== false && Number.isFinite(cost) && cost >= 0) {
			rollingHistory.push({ timestamp: now, cost });
			pruneRollingHistory(now);
			scheduleRollingHistorySave();
		}

		requestUsageWidgetRender();
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
				ctx.ui.notify(`Session cost reached ${fmtCost(COST_THRESHOLDS[i])} (now ${fmtCost(cost)})`, "warning");
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
		// Flush any pending persisted state before clearing.
		if (rollingHistorySaveTimer) {
			clearTimeout(rollingHistorySaveTimer);
			rollingHistorySaveTimer = null;
		}
		if (rateLimitCacheSaveTimer) {
			clearTimeout(rateLimitCacheSaveTimer);
			rateLimitCacheSaveTimer = null;
		}
		rollingHistoryDirty = false;
		rateLimitCacheDirty = false;
	}

	function hydrateFromSessionEntries(entries: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>): void {
		reset();
		for (const entry of entries) {
			if (entry.type === "message" && entry.message.role === "assistant") {
				recordUsage(entry.message as AssistantMessage, { persist: false });
			}
		}
	}

	function clearStartupRefreshTimer(): void {
		if (!startupRefreshTimer) {
			return;
		}
		clearTimeout(startupRefreshTimer);
		startupRefreshTimer = null;
	}

	function refreshStartupState(ctx: ExtensionContext): void {
		clearStartupRefreshTimer();
		const entries = ctx.sessionManager.getBranch();
		const refresh = () => {
			hydrateFromSessionEntries(entries);
			requestUsageWidgetRender();
			triggerProbe(ctx);
			broadcastUsageData();
		};

		if (entries.length < STARTUP_DEFER_ENTRY_THRESHOLD) {
			refresh();
			return;
		}

		startupRefreshTimer = setTimeout(() => {
			startupRefreshTimer = null;
			refresh();
		}, STARTUP_REFRESH_DELAY_MS);
	}

	// ─── Rate limit probing ───────────────────────────────────────────────

	/**
	 * Probe a provider for rate limit data using pi-managed auth tokens.
	 * Reads credentials from `~/.pi/agent/auth.json` and calls the provider
	 * API directly — no external CLI tools required.
	 */
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: provider probe handles auth discovery, refresh, and stale window fallback semantics.
	async function probeProvider(provider: ProviderKey, force = false): Promise<void> {
		const now = Date.now();
		const last = lastProbeTime.get(provider) ?? 0;
		if ((!force && now - last < PROBE_COOLDOWN_MS) || probeInFlight.has(provider)) {
			return;
		}
		probeInFlight.add(provider);
		try {
			const auth = readPiAuth();
			if (provider === "ollama") {
				const ollamaEntry = auth["ollama-cloud"];
				const envToken = process.env.OLLAMA_API_KEY?.trim() || null;
				const fresh = envToken
					? { token: envToken, entry: ollamaEntry }
					: ollamaEntry?.access
						? await ensureFreshToken("ollama-cloud", ollamaEntry, auth)
						: null;
				const limits = await probeOllamaDirect(fresh?.token ?? null);
				rateLimits.set(provider, limits);
				scheduleRateLimitCacheSave();
				lastProbeTime.set(provider, Date.now());
				requestUsageWidgetRender();
				return;
			}

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
					note: `No pi auth configured for ${providerDisplayName(provider)} — run pi login.`,
					probedAt: now,
					error: null,
				});
				scheduleRateLimitCacheSave();
				lastProbeTime.set(provider, now);
				requestUsageWidgetRender();
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
					error: `${providerDisplayName(provider)} token refresh failed — re-authenticate with pi login.`,
				});
				scheduleRateLimitCacheSave();
				lastProbeTime.set(provider, now);
				requestUsageWidgetRender();
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
				case "ollama":
					limits = await probeOllamaDirect(fresh.token);
					break;
			}

			const previous = rateLimits.get(provider);
			if (shouldPreserveStaleWindows(previous, limits)) {
				limits.windows = previous?.windows.map((window) => ({ ...window })) ?? [];
				limits.note = limits.note
					? `${limits.note} Showing last known window values.`
					: "Showing last known window values.";
			}

			rateLimits.set(provider, limits);
			scheduleRateLimitCacheSave();
			lastProbeTime.set(provider, Date.now());
			requestUsageWidgetRender();
		} catch {
			// Probe failed — keep stale data if any
		} finally {
			probeInFlight.delete(provider);
		}
	}

	/**
	 * Determine which provider to probe based on the current model.
	 * Probes in the background (fire-and-forget) to not block the agent.
	 */
	function triggerProbe(ctx: ExtensionContext, force = false): void {
		const provider = getActiveProvider(ctx);
		if (!provider) {
			return;
		}

		probeProvider(provider, force);
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
		const activeProvider = getActiveProvider();
		const shouldProbeOllama =
			Boolean(
				process.env.OLLAMA_API_KEY?.trim() || process.env.OLLAMA_HOST?.trim() || process.env.OLLAMA_HOST_CLOUD?.trim(),
			) ||
			activeProvider === "ollama" ||
			hasOllamaModel(models);
		if (shouldProbeOllama && !seen.has("ollama")) {
			seen.add("ollama");
			probeProvider("ollama", force);
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
	function renderRateLimitsPlain(provider: ProviderKey | null = null): string {
		const lines: string[] = [];
		for (const rl of getRateLimitEntries(provider)) {
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
	function renderRateLimitsRich(
		theme: { fg: (c: string, t: string) => string },
		provider: ProviderKey | null = null,
	): string[] {
		const lines: string[] = [];

		for (const rl of getRateLimitEntries(provider)) {
			if (!hasProviderDisplayData(rl)) {
				continue;
			}

			const name = providerDisplayName(rl.provider);
			const windows = [...rl.windows].sort((a, b) => a.percentLeft - b.percentLeft);
			lines.push(`  ${theme.fg("accent", `▸ ${name} Rate Limits`)}`);
			if (rl.error) {
				lines.push(`    ${theme.fg("error", "Error:")} ${theme.fg("dim", rl.error)}`);
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
	function renderRateLimitsWidget(
		theme: { fg: (c: string, t: string) => string },
		provider: ProviderKey | null,
	): string {
		const parts: string[] = [];
		for (const rl of getRateLimitEntries(provider)) {
			if (rl.error || rl.windows.length === 0) {
				continue;
			}
			const name = providerDisplayName(rl.provider);
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
	function generatePlainReport(ctx: ExtensionContext, provider: ProviderKey | null = null): string {
		const totals = getTotals(provider);
		const elapsed = Date.now() - sessionStart;
		const pace = provider ? null : getPace();
		const ctxUsage = ctx.getContextUsage();
		const scopedModels = getModelUsageEntries(provider).sort((a, b) => b.costTotal - a.costTotal);
		const lines: string[] = [];
		const currentProvider = getActiveProvider(ctx);

		if (provider) {
			const selectedProvider = providerDisplayName(provider);
			lines.push(`=== ${selectedProvider} Usage ===`);
			lines.push(`Selected provider: ${selectedProvider}${provider === currentProvider ? " (current)" : ""}`);
			lines.push(`Current provider: ${currentProvider ? providerDisplayName(currentProvider) : "unknown"}`);
			lines.push(`Current model: ${getCurrentModelId(ctx)}`);
			lines.push("");
		}

		const rlText = renderRateLimitsPlain(provider);
		if (rlText.trim()) {
			lines.push("=== Provider Rate Limits ===");
			lines.push("");
			lines.push(rlText);
		} else {
			lines.push("=== Provider Rate Limits ===");
			lines.push("(No rate limit data yet — will probe after next turn)");
			lines.push("");
		}

		lines.push(`=== ${provider ? "Selected Provider Session" : "Session Usage"} ===`);
		lines.push("");
		lines.push(`Duration: ${fmtDuration(elapsed)} | Turns: ${totals.turns}`);
		lines.push(
			`Tokens: ${fmtTokens(totals.input)} in / ${fmtTokens(totals.output)} out (${fmtTokens(totals.totalTokens)} total)`,
		);
		lines.push(`Cost: ${fmtCost(totals.cost)}`);
		if (!provider) {
			lines.push(`30d total cost: ${fmtCost(totals.rolling30dCost)}`);
		}
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

		if (!provider) {
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
		}

		if (scopedModels.length > 0) {
			lines.push("");
			lines.push("--- Per-Model ---");
			for (const model of scopedModels) {
				const costShare = totals.cost > 0 ? (model.costTotal / totals.cost) * 100 : 0;
				const modelTokens = model.input + model.output;
				const avgTokens = model.turns > 0 ? modelTokens / model.turns : 0;
				lines.push(
					`  ${model.model} (${model.provider}): ${model.turns} turns, ${fmtTokens(model.input)} in / ${fmtTokens(model.output)} out, ${fmtCost(model.costTotal)} (${costShare.toFixed(0)}% of session), avg ${fmtTokens(Math.round(avgTokens))}/turn`,
				);
				if (model.cacheRead > 0 || model.cacheWrite > 0) {
					lines.push(`    cache: ${fmtTokens(model.cacheRead)} read / ${fmtTokens(model.cacheWrite)} write`);
				}
			}
		} else if (provider) {
			lines.push("");
			lines.push(`No session usage recorded yet for ${providerDisplayName(provider)}.`);
		}

		if (provider && rlText.trim().length === 0 && totals.turns === 0) {
			lines.push("");
			lines.push("No provider usage has been recorded yet. Run a turn first or use /usage-refresh.");
		}

		return lines.join("\n");
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: rich dashboard aggregates multiple optional sections and formatting branches.
	function generateRichReport(
		ctx: ExtensionContext,
		theme: { fg: (c: string, t: string) => string },
		provider: ProviderKey | null = null,
	): string[] {
		const totals = getTotals(provider);
		const elapsed = Date.now() - sessionStart;
		const pace = provider ? null : getPace();
		const ctxUsage = ctx.getContextUsage();
		const scopedModels = getModelUsageEntries(provider).sort((a, b) => b.costTotal - a.costTotal);
		const lines: string[] = [];
		const sep = theme.fg("dim", " │ ");
		const divider = theme.fg("dim", "─".repeat(60));
		const currentProvider = getActiveProvider(ctx);
		const rlLines = renderRateLimitsRich(theme, provider);

		lines.push(theme.fg("accent", "╭─ Usage Dashboard ──────────────────────────────────────╮"));
		lines.push("");

		if (provider) {
			const selectedProvider = providerDisplayName(provider);
			const selectionState =
				provider === currentProvider ? theme.fg("success", "current") : theme.fg("dim", "selected");
			lines.push(
				`  ${theme.fg("accent", "Selected")}${sep}${theme.fg("accent", selectedProvider)}${sep}${selectionState}`,
			);
			lines.push(
				`  ${theme.fg("accent", "Current ")}${sep}${theme.fg("dim", currentProvider ? providerDisplayName(currentProvider) : "unknown")}`,
			);
			lines.push(`  ${theme.fg("accent", "Model   ")}${sep}${theme.fg("dim", getCurrentModelId(ctx))}`);
			lines.push("");
		}

		if (rlLines.length > 0) {
			lines.push(...rlLines);
		} else {
			lines.push(`  ${theme.fg("dim", "No rate limit data yet — will probe after next turn")}`);
			lines.push("");
		}

		lines.push(`  ${divider}`);
		lines.push(
			`  ${theme.fg("accent", provider ? "Session*" : "Session")}${sep}${fmtDuration(elapsed)}${sep}${totals.turns} turns${sep}${theme.fg("warning", fmtCost(totals.cost))}`,
		);

		if (!provider) {
			lines.push(
				`  ${theme.fg("accent", "30d    ")}${sep}${theme.fg("warning", fmtCost(totals.rolling30dCost))} ${theme.fg("dim", "total cost")}`,
			);
		}

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
			const color = pctColor(100 - pct);
			lines.push(
				`  ${theme.fg("accent", "Context")}${sep}${theme.fg(color, progressBar(100 - pct, 20))} ${theme.fg(color, `${(100 - pct).toFixed(0)}% free`)} of ${fmtTokens(ctxUsage.contextWindow)}`,
			);
		}

		if (!provider) {
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
		}

		if (scopedModels.length > 0) {
			lines.push("");
			lines.push(`  ${divider}`);
			lines.push(`  ${theme.fg("accent", "Per-Model Breakdown")}`);
			lines.push("");

			const maxCost = scopedModels[0]?.costTotal ?? 1;

			for (const model of scopedModels) {
				const costPct = maxCost > 0 ? (model.costTotal / maxCost) * 100 : 0;
				const costShare = totals.cost > 0 ? (model.costTotal / totals.cost) * 100 : 0;
				const modelTokens = model.input + model.output;
				const avgTokens = model.turns > 0 ? modelTokens / model.turns : 0;
				const bar = progressBar(costPct, 12);
				lines.push(
					`  ${theme.fg("accent", "◆")} ${theme.fg("accent", model.model)} ${theme.fg("dim", `(${model.provider})`)}`,
				);
				lines.push(
					`    ${bar} ${theme.fg("warning", fmtCost(model.costTotal))}${sep}${model.turns} turns${sep}${fmtTokens(model.input)} in / ${fmtTokens(model.output)} out${sep}${theme.fg("dim", `${costShare.toFixed(0)}% of cost`)}`,
				);
				lines.push(`    ${theme.fg("dim", `avg ${fmtTokens(Math.round(avgTokens))} tok/turn`)}`);
				if (model.cacheRead > 0 || model.cacheWrite > 0) {
					lines.push(
						`    ${theme.fg("dim", `cache ${fmtTokens(model.cacheRead)} read / ${fmtTokens(model.cacheWrite)} write`)}`,
					);
				}
			}
		} else if (provider) {
			lines.push("");
			lines.push(`  ${theme.fg("dim", `No session usage recorded yet for ${providerDisplayName(provider)}.`)}`);
		}

		if (provider && rlLines.length === 0 && totals.turns === 0) {
			lines.push("");
			lines.push(
				`  ${theme.fg("dim", "No provider usage has been recorded yet. Run a turn first or use /usage-refresh.")}`,
			);
		}

		lines.push("");
		if (provider) {
			lines.push(theme.fg("dim", "  * Session metrics are scoped to the selected provider."));
			lines.push("");
		}
		lines.push(theme.fg("accent", "╰────────────────────────────────────────────────────────╯"));
		lines.push(theme.fg("dim", "  Press q/Esc/Space to close"));

		return lines;
	}

	// ─── Widget rendering ─────────────────────────────────────────────────

	function renderWidget(ctx: ExtensionContext, theme: { fg: (c: string, t: string) => string }): string[] {
		if (!widgetVisible || getSafeModeState().enabled) {
			return [];
		}

		const activeProvider = getActiveProvider(ctx);
		const totals = getTotals(activeProvider);
		const sep = theme.fg("dim", " │ ");
		const parts: string[] = [];

		const rlWidget = renderRateLimitsWidget(theme, activeProvider);
		if (rlWidget) {
			parts.push(rlWidget);
		}

		if (activeProvider && totals.turns > 0) {
			parts.push(theme.fg("warning", fmtCost(totals.cost)));
			parts.push(`${theme.fg("success", fmtTokens(totals.input))}/${theme.fg("warning", fmtTokens(totals.output))}`);
		}

		if (parts.length === 0) {
			return [];
		}

		return [parts.join(sep)];
	}

	const mountWidget = (ctx: ExtensionContext) => {
		ctx.ui.setWidget("usage-tracker", (tui, theme) => {
			const componentRequestRender = () => tui.requestRender();
			requestWidgetRender = componentRequestRender;
			lastWidgetSignature = getUsageWidgetSignature(activeCtx ?? ctx);
			const unsubSafeMode = subscribeSafeMode(() => requestUsageWidgetRender(activeCtx ?? ctx));
			return {
				dispose() {
					if (requestWidgetRender === componentRequestRender) {
						requestWidgetRender = null;
						lastWidgetSignature = null;
					}
					unsubSafeMode();
				},
				// biome-ignore lint/suspicious/noEmptyBlockStatements: required by Component interface
				invalidate() {},
				render(width: number) {
					return renderWidget(activeCtx ?? ctx, theme).map((line) => truncateAnsi(line, width));
				},
			};
		});
	};

	// ─── Event handlers ───────────────────────────────────────────────────

	pi.on("session_start", (_event, ctx) => {
		activeCtx = ctx;
		schedulePersistedStateLoad();
		refreshStartupState(ctx);
		mountWidget(ctx);
	});

	pi.on("session_switch", (_event, ctx) => {
		activeCtx = ctx;
		schedulePersistedStateLoad();
		refreshStartupState(ctx);
		requestUsageWidgetRender();
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
		requestUsageWidgetRender();
		triggerProbe(ctx); // Probe the new provider
	});

	pi.on("session_shutdown", () => {
		clearPersistedStateLoadTimer();
		clearStartupRefreshTimer();
	});

	// ─── /usage command ───────────────────────────────────────────────────

	pi.registerCommand("usage", {
		description: "Pick a provider and show its usage dashboard",
		async handler(args, ctx) {
			await loadPersistedState();
			triggerProbeAll(true);
			await new Promise((resolve) => setTimeout(resolve, 500));

			const provider = await selectUsageProvider(ctx, args);
			if (!provider) {
				ctx.ui.notify("No provider usage has been recorded yet. Run a turn first or use /usage-refresh.", "info");
				return;
			}

			await openUsageOverlay(ctx, provider);
		},
	});

	// ─── /usage-toggle command ────────────────────────────────────────────

	pi.registerCommand("usage-toggle", {
		description: "Toggle the usage tracker widget visibility",
		async handler(_args, ctx) {
			widgetVisible = !widgetVisible;
			if (widgetVisible) {
				mountWidget(ctx);
				ctx.ui.notify("Usage widget shown.", "info");
			} else {
				lastWidgetSignature = null;
				ctx.ui.setWidget("usage-tracker", undefined);
				ctx.ui.notify("Usage widget hidden. Run /usage-toggle to show.", "info");
			}
		},
	});

	// ─── /usage-refresh command ──────────────────────────────────────────

	pi.registerCommand("usage-refresh", {
		description: "Force refresh rate limit data from provider APIs",
		async handler(_args, ctx) {
			await loadPersistedState();
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
			"Generate a rate limit status and token usage report. Shows provider rate limits (Anthropic, OpenAI, Google) and best-effort Ollama status, plus per-model costs. Use when the user asks about spending, rate limits, quotas, or remaining usage.",
		promptSnippet: "Show provider rate limits (% remaining, reset time) and session usage/cost report.",
		parameters: Type.Object({
			format: Type.Optional(
				Type.Union([Type.Literal("summary"), Type.Literal("detailed")], {
					description: "'summary' for rate limits only, 'detailed' for full breakdown. Default: detailed.",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			await loadPersistedState();
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
		description: "Show usage dashboard with current-provider rate limits and costs",
		async handler(ctx) {
			await loadPersistedState();
			triggerProbeAll(true);
			await new Promise((resolve) => setTimeout(resolve, 500));

			const provider = getActiveProvider(ctx);
			if (!provider) {
				ctx.ui.notify("No active provider selected yet.", "info");
				return;
			}

			await openUsageOverlay(ctx, provider);
		},
	});

	// Wire up test-only flush function
	flushPendingWritesFn = () => {
		if (rollingHistorySaveTimer) {
			clearTimeout(rollingHistorySaveTimer);
			rollingHistorySaveTimer = null;
		}
		if (rollingHistoryDirty) {
			rollingHistoryDirty = false;
			saveRollingHistory();
		}
		if (rateLimitCacheSaveTimer) {
			clearTimeout(rateLimitCacheSaveTimer);
			rateLimitCacheSaveTimer = null;
		}
		if (rateLimitCacheDirty) {
			rateLimitCacheDirty = false;
			saveRateLimitCache();
		}
	};
}

// Module-level flush function — set by usageTracker() for test access.
let flushPendingWritesFn: (() => void) | null = null;

/** Flush any pending debounced writes to disk. For use in tests only. */
export function flushPendingWrites(): void {
	if (flushPendingWritesFn) {
		flushPendingWritesFn();
	}
}
