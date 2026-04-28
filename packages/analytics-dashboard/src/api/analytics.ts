/**
 * Analytics API
 *
 * Client-side API for fetching analytics data.
 * Supports two modes:
 * - "mock": Uses generated data (default, for development/testing)
 * - "api": Fetches from the Express server at /api/*
 *
 * Mode is controlled by VITE_API_MODE env var:
 * - "mock" or unset → mock data
 * - "api" → real data from the server
 */

import { stringToColor } from "@/lib/utils";
import type {
	AggregationLevel,
	CodebaseContribution,
	CostBreakdown,
	HeatmapDataPoint,
	ModelUsageData,
	ProviderComparisonData,
	RateLimitTrend,
	TimelineData,
	TimeRange,
	TopModelStat,
	UsageInsight,
} from "@/types";

// ─── API Mode ─────────────────────────────────────────────────────────────────

/* C8 ignore start -- environment wiring is exercised indirectly by mode selection tests */
const API_MODE = import.meta.env.VITE_API_MODE ?? "mock";
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:31415";
/* C8 ignore stop */

/* C8 ignore start -- fetchApi requires running Express server, tested via Playwright E2E */
async function fetchApi<T>(path: string, params?: Record<string, string>): Promise<T> {
	const url = new URL(path, API_BASE);
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			url.searchParams.set(k, v);
		}
	}
	const res = await fetch(url.toString());
	if (!res.ok) {
		throw new Error(`API error: ${res.status} ${res.statusText}`);
	}
	return res.json();
}
/* C8 ignore stop */

const MOCK_DATA = {
	codebases: [
		{ id: "cb1", name: "oh-pi", path: "/dev/projects/oh-pi", totalCost: 45.32 },
		{
			id: "cb2",
			name: "e-com",
			path: "/dev/projects/e-commerce",
			totalCost: 23.15,
		},
		{
			id: "cb3",
			name: "api",
			path: "/dev/projects/api-service",
			totalCost: 12.89,
		},
		{ id: "cb4", name: "docs", path: "/dev/projects/docs", totalCost: 5.44 },
	],
	models: [
		{ id: "claude-sonnet-4", provider: "anthropic", name: "Claude Sonnet 4" },
		{ id: "claude-opus-4", provider: "anthropic", name: "Claude Opus 4" },
		{ id: "claude-haiku-4", provider: "anthropic", name: "Claude Haiku 4" },
		{ id: "gpt-4.1", provider: "openai", name: "GPT-4.1" },
		{ id: "gpt-4o", provider: "openai", name: "GPT-4o" },
		{ id: "o3", provider: "openai", name: "o3" },
		{ id: "gemini-2.5-pro", provider: "google", name: "Gemini 2.5 Pro" },
		{ id: "gemini-2.5-flash", provider: "google", name: "Gemini 2.5 Flash" },
	],
};

async function simulateNetworkDelay(ms = 100) {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

const mockApi = {
	// ═══ Summary Stats ═══
	async getSummaryStats() {
		await simulateNetworkDelay(50);
		return {
			avgCostPerTurn: 0.0307,
			avgTokensPerTurn: 5508,
			totalCost: 87.42,
			totalSessions: 143,
			totalTokens: 15672903,
			totalTurns: 2847,
			uniqueCodebases: 4,
			uniqueModels: 8,
		};
	},

	async getSummaryForRange(timeRange: TimeRange): Promise<{
		turns: number;
		cost: number;
		tokens: number;
		sessions: number;
		changeFromPrevious: {
			turns: number;
			cost: number;
			tokens: number;
		};
	}> {
		await simulateNetworkDelay(100);

		const multiplier = {
			"1y": 52,
			"30d": 4.3,
			"7d": 1,
			"90d": 12.9,
			all: 100,
		}[timeRange];

		return {
			changeFromPrevious: {
				cost: 8.3,
				tokens: 15.2,
				turns: 12.5,
			},
			cost: Math.floor(8742 * multiplier) / 100,
			sessions: Math.floor(143 * multiplier),
			tokens: Math.floor(15672903 * multiplier),
			turns: Math.floor(2847 * multiplier),
		};
	},

	// ═══ Timeline Data ═══
	async getTimelineData(timeRange: TimeRange, _aggregation: AggregationLevel = "day"): Promise<TimelineData[]> {
		await simulateNetworkDelay(200);

		const days = {
			"1y": 365,
			"30d": 30,
			"7d": 7,
			"90d": 90,
			all: 365,
		}[timeRange];

		const data: TimelineData[] = [];
		const today = new Date();

		for (let i = days - 1; i >= 0; i--) {
			const date = new Date(today);
			date.setDate(date.getDate() - i);

			// Generate realistic-looking data with some variance
			const baseTokens = Math.random() * 50_000 + 30_000;
			const baseTurns = Math.floor(Math.random() * 20 + 10);
			const weekendFactor = date.getDay() === 0 || date.getDay() === 6 ? 0.3 : 1;

			data.push({
				cost: Math.floor(baseTokens * 0.000005 * weekendFactor * 100) / 100,
				date: date.toISOString().split("T")[0],
				sessions: Math.floor((baseTurns / 5) * weekendFactor) || 1,
				tokens: Math.floor(baseTokens * weekendFactor),
				turns: Math.floor(baseTurns * weekendFactor),
			});
		}

		return data;
	},

	// ═══ Model Analytics ═══
	async getModelUsage(_timeRange: TimeRange): Promise<ModelUsageData[]> {
		await simulateNetworkDelay(150);

		return MOCK_DATA.models.map((model, i) => {
			const baseUsage = [0.35, 0.25, 0.2, 0.1, 0.05, 0.03, 0.015, 0.005][i] || 0.01;
			return {
				color: stringToColor(model.id, i),
				cost: Math.floor(8742 * baseUsage) / 100,
				modelId: model.id,
				modelName: model.name,
				providerId: model.provider,
				providerName: model.provider,
				tokens: Math.floor(15672903 * baseUsage),
				turns: Math.floor(2847 * baseUsage),
			};
		});
	},

	async getTopModels(timeRange: TimeRange, limit = 5): Promise<TopModelStat[]> {
		const models = await this.getModelUsage(timeRange);
		const totalTokens = models.reduce((sum, m) => sum + m.tokens, 0);

		return models.slice(0, limit).map((m) => ({
			cost: m.cost,
			modelId: m.modelId,
			modelName: m.modelName,
			percentage: Math.round((m.tokens / totalTokens) * 100),
			tokens: m.tokens,
		}));
	},

	// ═══ Provider Analytics ═══
	async getProviderComparison(_timeRange: TimeRange): Promise<ProviderComparisonData[]> {
		await simulateNetworkDelay(150);

		const providers = [
			{ id: "anthropic", name: "Anthropic", share: 0.65 },
			{ id: "openai", name: "OpenAI", share: 0.25 },
			{ id: "google", name: "Google", share: 0.1 },
		];

		return providers.map((p) => ({
			avgResponseTime: Math.random() * 5000 + 2000,
			color: stringToColor(p.id),
			cost: Math.floor(8742 * p.share) / 100,
			providerId: p.id,
			providerName: p.name,
			tokens: Math.floor(15672903 * p.share),
			turns: Math.floor(2847 * p.share),
		}));
	},

	// ═══ Codebase Analytics ═══
	async getCodebaseContributions(_timeRange: TimeRange): Promise<CodebaseContribution[]> {
		await simulateNetworkDelay(150);

		return MOCK_DATA.codebases.map((cb) => ({
			codebaseId: cb.id,
			codebaseName: cb.name,
			cost: cb.totalCost,
			lastActivity: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
			path: cb.path,
			tokens: Math.floor(cb.totalCost * 180000),
			turns: Math.floor(cb.totalCost * 32.5),
		}));
	},

	async getTopCodebases(timeRange: TimeRange, limit = 5): Promise<CodebaseContribution[]> {
		const codebases = await this.getCodebaseContributions(timeRange);
		return codebases.toSorted((a, b) => b.cost - a.cost).slice(0, limit);
	},

	// ═══ Activity Heatmap ═══
	async getActivityHeatmap(_days = 90): Promise<HeatmapDataPoint[]> {
		await simulateNetworkDelay(100);

		const data: HeatmapDataPoint[] = [];

		for (let d = 0; d < 7; d++) {
			// Weekday
			for (let h = 0; h < 24; h++) {
				const isWorkday = d < 5;
				const isWorkHour = h >= 9 && h <= 17;
				const baseActivity = isWorkday && isWorkHour ? 0.8 : 0.2;
				const variance = Math.random() * 0.4 - 0.2;

				data.push({
					day: d,
					hour: h,
					value: Math.max(0, Math.min(1, baseActivity + variance)),
				});
			}
		}

		return data;
	},

	// ═══ Cost Breakdown ═══
	async getCostBreakdown(_timeRange: TimeRange): Promise<CostBreakdown[]> {
		await simulateNetworkDelay(100);

		const categories = [
			{ name: "Input Tokens", share: 0.35 },
			{ name: "Output Tokens", share: 0.45 },
			{ name: "Cache Read", share: 0.12 },
			{ name: "Cache Write", share: 0.08 },
		];

		const total = 87.42;

		return categories.map((c, i) => ({
			category: c.name,
			color: stringToColor(c.name, i),
			cost: Math.floor(total * c.share * 100) / 100,
			percentage: Math.round(c.share * 100),
		}));
	},

	// ═══ Rate Limits ═══
	async getRateLimitTrend(provider?: string): Promise<RateLimitTrend[]> {
		await simulateNetworkDelay(100);

		const providers = provider ? [provider] : ["anthropic", "openai", "google"];

		const results: RateLimitTrend[] = [];

		for (const p of providers) {
			const history: { timestamp: Date; percentRemaining: number }[] = [];
			const now = Date.now();

			for (let i = 24; i >= 0; i--) {
				history.push({
					percentRemaining: Math.random() * 40 + 50,
					timestamp: new Date(now - i * 60 * 60 * 1000),
				});
			}

			results.push({
				history,
				provider: p,
				windowLabel: "1 hour",
			});
		}

		return results;
	},

	// ═══ Insights ═══
	async getInsights(_timeRange: TimeRange): Promise<UsageInsight[]> {
		await simulateNetworkDelay(100);

		return [
			{
				description: "Your token usage has increased by 23% compared to the previous period.",
				severity: "info",
				title: "Usage Up 23%",
				type: "trend",
			},
			{
				description: "Claude Sonnet 4 accounts for 35% of your total token usage.",
				severity: "success",
				title: "Claude Sonnet Your Most Used Model",
				type: "comparison",
			},
			{
				description: "Yesterday's session cost 3x more than average due to large context usage.",
				severity: "warning",
				title: "High Cost Yesterday",
				type: "anomaly",
			},
		];
	},

	// ═══ Words ═══
	async getTopWords(_modelId: string | undefined, _timeRange: TimeRange) {
		await simulateNetworkDelay(100);
		return [
			{ count: 342, word: "function" },
			{ count: 289, word: "class" },
			{ count: 256, word: "interface" },
			{ count: 234, word: "component" },
			{ count: 198, word: "async" },
			{ count: 187, word: "type" },
			{ count: 176, word: "error" },
			{ count: 165, word: "test" },
			{ count: 154, word: "import" },
			{ count: 143, word: "return" },
			{ count: 132, word: "const" },
			{ count: 121, word: "export" },
			{ count: 98, word: "implement" },
			{ count: 87, word: "refactor" },
			{ count: 76, word: "config" },
			{ count: 65, word: "deploy" },
			{ count: 54, word: "database" },
			{ count: 43, word: "schema" },
		];
	},

	// ═══ Misspellings ═══
	async getMisspellings(_timeRange: TimeRange) {
		await simulateNetworkDelay(100);
		return [
			{ corrected: "reference", count: 23, misspelled: "refrence" },
			{ corrected: "default", count: 18, misspelled: "defualt" },
			{ corrected: "component", count: 15, misspelled: "compontent" },
			{ corrected: "handler", count: 12, misspelled: "handeler" },
			{ corrected: "interface", count: 10, misspelled: "interace" },
			{ corrected: "database", count: 8, misspelled: "databse" },
			{ corrected: "receive", count: 7, misspelled: "recieve" },
			{ corrected: "separate", count: 5, misspelled: "seperate" },
		];
	},

	// ═══ Emotional Summary ═══
	async getEmotionalSummary(_timeRange: TimeRange) {
		await simulateNetworkDelay(100);
		return {
			frustrated: 15,
			neutral: 40,
			positive: 45,
			topLabels: [
				"curious",
				"focused",
				"debugging",
				"refactoring",
				"learning",
				"satisfied",
				"exploratory",
				"collaborative",
			],
			trend: [0.3, 0.7, 0.5, 0.8, 0.6, 0.9, 0.4, 0.7, 0.8, 0.5, 0.6, 0.7, 0.9, 0.3],
		};
	},

	// ═══ Export ═══
	async exportData(format: "json" | "csv", timeRange: TimeRange) {
		const data = await this.getTimelineData(timeRange);

		if (format === "json") {
			const blob = new Blob([JSON.stringify(data, null, 2)], {
				type: "application/json",
			});
			return URL.createObjectURL(blob);
		}

		// CSV
		const headers = "Date,Tokens,Cost,Turns,Sessions\n";
		const rows = data.map((d) => `${d.date},${d.tokens},${d.cost},${d.turns},${d.sessions}`).join("\n");
		const blob = new Blob([headers + rows], { type: "text/csv" });
		return URL.createObjectURL(blob);
	},
};

// ─── Real API (fetches from Express server) ─────────────────────────────────────
/* C8 ignore start -- Real API requires running Express server, tested via Playwright E2E */

const realApi = {
	async exportData(format: "json" | "csv", timeRange: TimeRange) {
		const days = {
			"7d": "7",
			"30d": "30",
			"90d": "90",
			"1y": "365",
			all: "365",
		}[timeRange];
		const data = await fetchApi("/api/overview", { days });

		if (format === "json") {
			const blob = new Blob([JSON.stringify(data, null, 2)], {
				type: "application/json",
			});
			return URL.createObjectURL(blob);
		}

		const headers = "Date,Tokens,Cost,Turns,Sessions\n";
		const rows = (data.dailyStats ?? [])
			.map(
				(d: { dayBucket: string; totalTokens: number; totalCost: number; totalTurns: number; sessionCount: number }) =>
					`${d.dayBucket},${d.totalTokens},${d.totalCost},${d.totalTurns},${d.sessionCount}`,
			)
			.join("\n");
		const blob = new Blob([headers + rows], { type: "text/csv" });
		return URL.createObjectURL(blob);
	},

	async getActivityHeatmap(_days = 90): Promise<HeatmapDataPoint[]> {
		// Real heatmap data isn't available yet, fall back to mock
		return mockApi.getActivityHeatmap(_days);
	},

	async getCodebaseContributions(timeRange: TimeRange): Promise<CodebaseContribution[]> {
		const days = {
			"7d": "7",
			"30d": "30",
			"90d": "90",
			"1y": "365",
			all: "365",
		}[timeRange];
		const data = await fetchApi<{
			codebases: Array<{
				id: string;
				name: string;
				absolutePath: string;
				totalTurns: number;
				totalCost: number;
				lastSeenAt: string;
			}>;
		}>("/api/codebases", { days });
		return data.codebases.map((cb) => ({
			codebaseId: cb.id,
			codebaseName: cb.name,
			path: cb.absolutePath,
			tokens: Math.floor(cb.totalCost * 180000),
			cost: cb.totalCost,
			turns: cb.totalTurns,
			lastActivity: new Date(cb.lastSeenAt),
		}));
	},

	async getCostBreakdown(_timeRange: TimeRange): Promise<CostBreakdown[]> {
		// Cost breakdown by token type isn't in the API yet
		const data = await fetchApi<{ totalCost: number; totalInputTokens: number; totalOutputTokens: number }>(
			"/api/overview",
		);
		const total = data.totalCost || 1;
		const categories = [
			{
				name: "Input Tokens",
				share:
					((data.totalInputTokens ?? 0) / ((data.totalInputTokens ?? 0) + (data.totalOutputTokens ?? 0) || 1)) * 0.7,
			},
			{
				name: "Output Tokens",
				share:
					((data.totalOutputTokens ?? 0) / ((data.totalInputTokens ?? 0) + (data.totalOutputTokens ?? 0) || 1)) * 0.3,
			},
			{ name: "Cache Read", share: 0.12 },
			{ name: "Cache Write", share: 0.08 },
		];
		return categories.map((c, i) => ({
			category: c.name,
			cost: Math.round(total * c.share * 100) / 100,
			percentage: Math.round(c.share * 100),
			color: stringToColor(c.name, i),
		}));
	},

	async getEmotionalSummary(timeRange: TimeRange) {
		// Emotional data not yet in the API
		return mockApi.getEmotionalSummary(timeRange);
	},

	async getInsights(_timeRange: TimeRange): Promise<UsageInsight[]> {
		// Insights are computed client-side for now
		return mockApi.getInsights(_timeRange);
	},

	async getMisspellings(timeRange: TimeRange) {
		const days = {
			"7d": "7",
			"30d": "30",
			"90d": "90",
			"1y": "365",
			all: "365",
		}[timeRange];
		const data = await fetchApi<{
			misspellings: Array<{
				misspelledWord: string;
				correctedWord: string;
				occurrenceCount: number;
			}>;
		}>("/api/misspellings", { days });
		return (data.misspellings ?? []).map((m) => ({
			misspelled: m.misspelledWord,
			corrected: m.correctedWord,
			count: m.occurrenceCount,
		}));
	},

	async getModelUsage(timeRange: TimeRange): Promise<ModelUsageData[]> {
		const days = {
			"7d": "7",
			"30d": "30",
			"90d": "90",
			"1y": "365",
			all: "365",
		}[timeRange];
		const data = await fetchApi<{
			models: Array<{
				id: string;
				displayName: string | null;
				totalTurns: number;
				totalCost: number;
				totalInputTokens: number;
				totalOutputTokens: number;
			}>;
		}>("/api/models", { days });
		const _totalTokens = data.models.reduce((s, m) => s + m.totalInputTokens + m.totalOutputTokens, 0) || 1;
		return data.models.map((m, i) => ({
			modelId: m.id,
			modelName: m.displayName ?? m.id,
			providerId: m.id.split("-")[0] ?? "unknown",
			providerName: m.id.includes("claude")
				? "Anthropic"
				: m.id.includes("gpt") || m.id.includes("o3")
					? "OpenAI"
					: m.id.includes("gemini")
						? "Google"
						: "Other",
			tokens: m.totalInputTokens + m.totalOutputTokens,
			cost: m.totalCost,
			turns: m.totalTurns,
			color: stringToColor(m.id, i),
		}));
	},

	async getProviderComparison(timeRange: TimeRange): Promise<ProviderComparisonData[]> {
		const models = await realApi.getModelUsage(timeRange);
		const byProvider = new Map<string, { tokens: number; cost: number; turns: number; avgTime: number }>();
		for (const m of models) {
			const existing = byProvider.get(m.providerId) ?? { tokens: 0, cost: 0, turns: 0, avgTime: 0 };
			byProvider.set(m.providerId, {
				tokens: existing.tokens + m.tokens,
				cost: existing.cost + m.cost,
				turns: existing.turns + m.turns,
				avgTime: existing.avgTime + 3000, // placeholder
			});
		}
		return Array.from(byProvider.entries()).map(([id, data], i) => ({
			providerId: id,
			providerName: id === "anthropic" ? "Anthropic" : id === "openai" ? "OpenAI" : id === "google" ? "Google" : id,
			tokens: data.tokens,
			cost: data.cost,
			turns: data.turns,
			avgResponseTime: data.avgTime,
			color: stringToColor(id, i),
		}));
	},

	async getRateLimitTrend(provider?: string): Promise<RateLimitTrend[]> {
		// Rate limit data from API
		const params: Record<string, string> = {};
		if (provider) params.provider = provider;
		return fetchApi<RateLimitTrend[]>("/api/rate-limits", params);
	},

	async getSummaryForRange(timeRange: TimeRange) {
		const days = {
			"7d": "7",
			"30d": "30",
			"90d": "90",
			"1y": "365",
			all: "365",
		}[timeRange];
		return fetchApi("/api/overview", { days });
	},

	async getSummaryStats() {
		return fetchApi<{
			totalTurns: number;
			totalCost: number;
			totalSessions: number;
			uniqueModels: number;
			uniqueCodebases: number;
		}>("/api/overview");
	},

	async getTimelineData(timeRange: TimeRange, _aggregation: AggregationLevel = "day") {
		const days = {
			"7d": "7",
			"30d": "30",
			"90d": "90",
			"1y": "365",
			all: "365",
		}[timeRange];
		const data = await fetchApi<{
			dailyStats: Array<{
				dayBucket: string;
				totalTokens: number;
				totalCost: number;
				totalTurns: number;
				sessionCount: number;
			}>;
		}>("/api/overview", { days });
		return (data.dailyStats ?? []).map((d) => ({
			date: d.dayBucket,
			tokens: d.totalTokens,
			cost: d.totalCost,
			turns: d.totalTurns,
			sessions: d.sessionCount,
		}));
	},

	async getTopCodebases(timeRange: TimeRange, limit = 5): Promise<CodebaseContribution[]> {
		const codebases = await realApi.getCodebaseContributions(timeRange);
		return codebases.sort((a, b) => b.cost - a.cost).slice(0, limit);
	},

	async getTopModels(timeRange: TimeRange, limit = 5): Promise<TopModelStat[]> {
		const models = await realApi.getModelUsage(timeRange);
		const totalTokens = models.reduce((s, m) => s + m.tokens, 0) || 1;
		return models.slice(0, limit).map((m) => ({
			modelId: m.modelId,
			modelName: m.modelName,
			tokens: m.tokens,
			cost: m.cost,
			percentage: Math.round((m.tokens / totalTokens) * 100),
		}));
	},

	async getTopWords(modelId: string | undefined, timeRange: TimeRange) {
		const days = {
			"7d": "7",
			"30d": "30",
			"90d": "90",
			"1y": "365",
			all: "365",
		}[timeRange];
		const params: Record<string, string> = { days };
		if (modelId) params.model_id = modelId;
		const data = await fetchApi<{ words: Array<{ word: string; count: number }> }>("/api/words", params);
		return data.words ?? [];
	},
};

// ─── Export: Choose API mode ───────────────────────────────────────────────────

export const api = API_MODE === "api" ? realApi : mockApi;
// Re-export as analyticsApi for backward compatibility with existing hooks
export const analyticsApi = api;
/* C8 ignore stop */
