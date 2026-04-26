/**
 * Analytics API Tests
 *
 * Comprehensive unit tests for the analytics API layer.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { analyticsApi } from "../api/analytics";
import type { TimeRange } from "../types";

const originalApiMode = process.env.VITE_API_MODE;
const originalApiBase = process.env.VITE_API_BASE;
const originalFetch = globalThis.fetch;

afterEach(() => {
	if (originalApiMode === undefined) {
		delete process.env.VITE_API_MODE;
	} else {
		process.env.VITE_API_MODE = originalApiMode;
	}

	if (originalApiBase === undefined) {
		delete process.env.VITE_API_BASE;
	} else {
		process.env.VITE_API_BASE = originalApiBase;
	}

	globalThis.fetch = originalFetch;
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("analyticsApi", () => {
	describe("getSummaryStats", () => {
		it("should return summary statistics", async () => {
			const stats = await analyticsApi.getSummaryStats();

			expect(stats).toHaveProperty("totalTurns");
			expect(stats).toHaveProperty("totalCost");
			expect(stats).toHaveProperty("totalTokens");
			expect(stats).toHaveProperty("totalSessions");
			expect(stats).toHaveProperty("uniqueModels");
			expect(stats).toHaveProperty("uniqueCodebases");
			expect(stats).toHaveProperty("avgTokensPerTurn");
			expect(stats).toHaveProperty("avgCostPerTurn");
		});

		it("should return positive values", async () => {
			const stats = await analyticsApi.getSummaryStats();

			expect(stats.totalTurns).toBeGreaterThanOrEqual(0);
			expect(stats.totalCost).toBeGreaterThanOrEqual(0);
			expect(stats.totalTokens).toBeGreaterThanOrEqual(0);
		});
	});

	describe("getSummaryForRange", () => {
		const ranges: TimeRange[] = ["7d", "30d", "90d", "1y", "all"];

		ranges.forEach((range) => {
			it(`should return stats for ${range} range`, async () => {
				const stats = await analyticsApi.getSummaryForRange(range);

				expect(stats).toHaveProperty("turns");
				expect(stats).toHaveProperty("cost");
				expect(stats).toHaveProperty("tokens");
				expect(stats).toHaveProperty("sessions");
				expect(stats).toHaveProperty("changeFromPrevious");
			});
		});

		it("should scale data appropriately for each range", async () => {
			const sevenDays = await analyticsApi.getSummaryForRange("7d");
			const thirtyDays = await analyticsApi.getSummaryForRange("30d");

			expect(thirtyDays.turns).toBeGreaterThanOrEqual(sevenDays.turns);
		});
	});

	describe("getTimelineData", () => {
		it("should return daily data points", async () => {
			const data = await analyticsApi.getTimelineData("7d", "day");

			expect(data).toHaveLength(7);
			expect(data[0]).toHaveProperty("date");
			expect(data[0]).toHaveProperty("tokens");
			expect(data[0]).toHaveProperty("cost");
			expect(data[0]).toHaveProperty("turns");
			expect(data[0]).toHaveProperty("sessions");
		});

		it("should format dates correctly", async () => {
			const data = await analyticsApi.getTimelineData("30d", "day");

			data.forEach((point) => {
				expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			});
		});
	});

	describe("getModelUsage", () => {
		it("should return model usage statistics", async () => {
			const models = await analyticsApi.getModelUsage("30d");

			expect(models.length).toBeGreaterThan(0);
			models.forEach((model) => {
				expect(model).toHaveProperty("modelId");
				expect(model).toHaveProperty("modelName");
				expect(model).toHaveProperty("providerId");
				expect(model).toHaveProperty("tokens");
				expect(model).toHaveProperty("cost");
				expect(model).toHaveProperty("turns");
				expect(model).toHaveProperty("color");
			});
		});

		it("should return models ordered by usage share", async () => {
			const models = await analyticsApi.getModelUsage("30d");

			// Mock data is ordered: first model has highest share
			expect(models[0].tokens).toBeGreaterThanOrEqual(models[models.length - 1].tokens);
		});
	});

	describe("getTopModels", () => {
		it("should respect the limit parameter", async () => {
			const top3 = await analyticsApi.getTopModels("30d", 3);
			const top5 = await analyticsApi.getTopModels("30d", 5);

			expect(top3).toHaveLength(3);
			expect(top5).toHaveLength(5);
		});

		it("should include percentage", async () => {
			const models = await analyticsApi.getTopModels("30d", 5);

			models.forEach((model) => {
				expect(model).toHaveProperty("percentage");
				expect(model.percentage).toBeGreaterThanOrEqual(0);
				expect(model.percentage).toBeLessThanOrEqual(100);
			});
		});
	});

	describe("getProviderComparison", () => {
		it("should return provider data", async () => {
			const providers = await analyticsApi.getProviderComparison("30d");

			expect(providers.length).toBeGreaterThan(0);
			providers.forEach((provider) => {
				expect(provider).toHaveProperty("providerId");
				expect(provider).toHaveProperty("providerName");
				expect(provider).toHaveProperty("tokens");
				expect(provider).toHaveProperty("cost");
				expect(provider).toHaveProperty("turns");
				expect(provider).toHaveProperty("avgResponseTime");
				expect(provider).toHaveProperty("color");
			});
		});

		it("should have valid provider names", async () => {
			const providers = await analyticsApi.getProviderComparison("30d");
			const validProviders = ["Anthropic", "OpenAI", "Google", "Ollama"];

			providers.forEach((p) => {
				expect(validProviders).toContain(p.providerName);
			});
		});
	});

	describe("getCodebaseContributions", () => {
		it("should return codebase data", async () => {
			const codebases = await analyticsApi.getCodebaseContributions("30d");

			codebases.forEach((cb) => {
				expect(cb).toHaveProperty("codebaseId");
				expect(cb).toHaveProperty("codebaseName");
				expect(cb).toHaveProperty("path");
				expect(cb).toHaveProperty("tokens");
				expect(cb).toHaveProperty("cost");
				expect(cb).toHaveProperty("turns");
				expect(cb).toHaveProperty("lastActivity");
				expect(cb.lastActivity).toBeInstanceOf(Date);
			});
		});
	});

	describe("getActivityHeatmap", () => {
		it("should return 7 days x 24 hours of data", async () => {
			const data = await analyticsApi.getActivityHeatmap();

			expect(data).toHaveLength(7 * 24);
		});

		it("should have values between 0 and 1", async () => {
			const data = await analyticsApi.getActivityHeatmap();

			data.forEach((point) => {
				expect(point.value).toBeGreaterThanOrEqual(0);
				expect(point.value).toBeLessThanOrEqual(1);
			});
		});
	});

	describe("getCostBreakdown", () => {
		it("should return cost categories", async () => {
			const breakdown = await analyticsApi.getCostBreakdown("30d");

			expect(breakdown.length).toBeGreaterThan(0);
			breakdown.forEach((item) => {
				expect(item).toHaveProperty("category");
				expect(item).toHaveProperty("cost");
				expect(item).toHaveProperty("percentage");
				expect(item).toHaveProperty("color");
				expect(item.percentage).toBeGreaterThanOrEqual(0);
			});
		});
	});

	describe("getInsights", () => {
		it("should return insights", async () => {
			const insights = await analyticsApi.getInsights("30d");

			expect(insights.length).toBeGreaterThan(0);
			insights.forEach((insight) => {
				expect(insight).toHaveProperty("type");
				expect(insight).toHaveProperty("title");
				expect(insight).toHaveProperty("description");
				expect(insight).toHaveProperty("severity");
				expect(["trend", "anomaly", "comparison"]).toContain(insight.type);
				expect(["info", "warning", "success"]).toContain(insight.severity);
			});
		});
	});

	describe("exportData", () => {
		it("should return a string for JSON export", async () => {
			const result = await analyticsApi.exportData("json", "30d");

			expect(typeof result).toBe("string");
			expect(result).toContain("blob:");
		});

		it("should return a string for CSV export", async () => {
			const result = await analyticsApi.exportData("csv", "30d");

			expect(typeof result).toBe("string");
			expect(result).toContain("blob:");
		});
	});

	describe("getTopCodebases", () => {
		it("should return top codebases by cost", async () => {
			const top3 = await analyticsApi.getTopCodebases("30d", 3);
			expect(top3).toHaveLength(3);
			top3.forEach((cb) => {
				expect(cb).toHaveProperty("codebaseId");
				expect(cb).toHaveProperty("codebaseName");
				expect(cb).toHaveProperty("cost");
			});
		});

		it("should respect the limit parameter", async () => {
			const top5 = await analyticsApi.getTopCodebases("30d", 5);
			expect(top5.length).toBeLessThanOrEqual(5);
		});
	});

	describe("getRateLimitTrends", () => {
		it("should return rate limit data", async () => {
			const trends = await analyticsApi.getRateLimitTrend();
			expect(Array.isArray(trends)).toBe(true);
			expect(trends.length).toBeGreaterThan(0);
			trends.forEach((t) => {
				expect(t).toHaveProperty("provider");
				expect(t).toHaveProperty("history");
			});
		});

		it("should return data for specific provider", async () => {
			const anthropicTrends = await analyticsApi.getRateLimitTrend("anthropic");
			expect(Array.isArray(anthropicTrends)).toBe(true);
			expect(anthropicTrends).toHaveLength(1);
			expect(anthropicTrends[0].provider).toBe("anthropic");
		});
	});

	describe("getTopWords", () => {
		it("should return word frequency data", async () => {
			const words = await analyticsApi.getTopWords(undefined, "30d");
			expect(Array.isArray(words)).toBe(true);
			expect(words.length).toBeGreaterThan(0);
			words.forEach((w) => {
				expect(w).toHaveProperty("word");
				expect(w).toHaveProperty("count");
			});
		});
	});

	describe("getMisspellings", () => {
		it("should return misspelling corrections", async () => {
			const misspells = await analyticsApi.getMisspellings("30d");
			expect(Array.isArray(misspells)).toBe(true);
			expect(misspells.length).toBeGreaterThan(0);
			misspells.forEach((m) => {
				expect(m).toHaveProperty("misspelled");
				expect(m).toHaveProperty("corrected");
				expect(m).toHaveProperty("count");
			});
		});
	});

	describe("getEmotionalSummary", () => {
		it("should return emotional summary data", async () => {
			const summary = await analyticsApi.getEmotionalSummary("30d");
			expect(summary).toHaveProperty("positive");
			expect(summary).toHaveProperty("neutral");
			expect(summary).toHaveProperty("frustrated");
			expect(summary).toHaveProperty("topLabels");
			expect(summary).toHaveProperty("trend");
		});
	});

	describe("API mode selection", () => {
		it("should default to the mock API when VITE_API_MODE is unset", async () => {
			delete process.env.VITE_API_MODE;
			delete process.env.VITE_API_BASE;

			const fetchMock = vi.fn();
			globalThis.fetch = fetchMock as typeof fetch;

			const { api } = await import("../api/analytics");
			const insights = await api.getInsights("30d");

			expect(insights).toHaveLength(3);
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("should use the real API when VITE_API_MODE is api", async () => {
			process.env.VITE_API_MODE = "api";
			process.env.VITE_API_BASE = "http://localhost:4010";

			const fetchMock = vi.fn(async () => ({
				ok: true,
				status: 200,
				statusText: "OK",
				json: async () => [
					{
						provider: "anthropic",
						windowLabel: "1 hour",
						history: [],
					},
				],
			}));
			globalThis.fetch = fetchMock as typeof fetch;

			const { api } = await import("../api/analytics");
			const trends = await api.getRateLimitTrend("anthropic");

			expect(fetchMock).toHaveBeenCalledWith("http://localhost:4010/api/rate-limits?provider=anthropic");
			expect(trends).toEqual([
				{
					provider: "anthropic",
					windowLabel: "1 hour",
					history: [],
				},
			]);
		});
	});
});
