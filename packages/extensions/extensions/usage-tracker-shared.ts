export interface ModelUsage {
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

export interface TurnSnapshot {
	timestamp: number;
	tokens: number;
	cost: number;
}

export interface UsageSample {
	source: string;
	model: string;
	provider: string;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	costTotal: number;
}

export interface SourceUsage {
	source: string;
	turns: number;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	costTotal: number;
}

export interface HistoricalCostPoint {
	timestamp: number;
	cost: number;
}

export interface RateWindow {
	label: string;
	percentLeft: number;
	resetDescription: string | null;
	windowMinutes: number | null;
}

export interface WindowPace {
	label: string;
	deltaPercent: number;
	expectedUsedPercent: number;
	actualUsedPercent: number;
	etaToExhaustionMs: number | null;
	willLastToReset: boolean;
}

export type ProviderKey = "anthropic" | "openai" | "google";

export interface ProviderRateLimits {
	provider: ProviderKey;
	windows: RateWindow[];
	credits: number | null;
	account: string | null;
	plan: string | null;
	note: string | null;
	probedAt: number;
	error: string | null;
}

export interface PiAuthEntry {
	type: string;
	access: string;
	refresh: string;
	expires: number;
	accountId?: string;
	projectId?: string;
	email?: string;
}

export const COST_THRESHOLDS = [0.5, 1, 2, 5, 10, 25, 50];
export const PROBE_COOLDOWN_MS = 30_000;
export const PROBE_TIMEOUT_MS = 15_000;
export const ROLLING_COST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const ROLLING_HISTORY_MAX_POINTS = 20_000;
export const PACE_MIN_EXPECTED_USED_PCT = 3;
