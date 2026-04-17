/**
 * Analytics API
 *
 * Client-side API for fetching analytics data from the database layer.
 * This communicates with the main process via IPC in a real Electron app,
 * but for the web dashboard we'll use a mock API that can be swapped.
 */

import type {
  TimeRange,
  AggregationLevel,
  ModelUsageData,
  ProviderComparisonData,
  TimelineData,
  CodebaseContribution,
  TopModelStat,
  HeatmapDataPoint,
  UsageInsight,
  RateLimitTrend,
  CostBreakdown,
} from "@/types";
import { stringToColor } from "@/lib/utils";

// In a real implementation, this would be an IPC bridge to the main process
// For now, we'll create a mock API that simulates the database queries

const MOCK_DATA = {
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
  codebases: [
    { id: "cb1", name: "oh-pi", path: "/dev/projects/oh-pi", totalCost: 45.32 },
    { id: "cb2", name: "e-com", path: "/dev/projects/e-commerce", totalCost: 23.15 },
    { id: "cb3", name: "api", path: "/dev/projects/api-service", totalCost: 12.89 },
    { id: "cb4", name: "docs", path: "/dev/projects/docs", totalCost: 5.44 },
  ],
};

async function simulateNetworkDelay(ms = 100) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export const analyticsApi = {
  // ═══ Summary Stats ═══
  async getSummaryStats() {
    await simulateNetworkDelay(50);
    return {
      totalTurns: 2847,
      totalCost: 87.42,
      totalTokens: 15672903,
      totalSessions: 143,
      uniqueModels: 8,
      uniqueCodebases: 4,
      avgTokensPerTurn: 5508,
      avgCostPerTurn: 0.0307,
    };
  },

  async getSummaryForRange(
    timeRange: TimeRange
  ): Promise<{
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
      "7d": 1,
      "30d": 4.3,
      "90d": 12.9,
      "1y": 52,
      all: 100,
    }[timeRange];

    return {
      turns: Math.floor(2847 * multiplier),
      cost: Math.floor(8742 * multiplier) / 100,
      tokens: Math.floor(15672903 * multiplier),
      sessions: Math.floor(143 * multiplier),
      changeFromPrevious: {
        turns: 12.5,
        cost: 8.3,
        tokens: 15.2,
      },
    };
  },

  // ═══ Timeline Data ═══
  async getTimelineData(
    timeRange: TimeRange,
    _aggregation: AggregationLevel = "day"
  ): Promise<TimelineData[]> {
    await simulateNetworkDelay(200);

    const days = {
      "7d": 7,
      "30d": 30,
      "90d": 90,
      "1y": 365,
      all: 365,
    }[timeRange];

    const data: TimelineData[] = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      // Generate realistic-looking data with some variance
      const baseTokens = Math.random() * 50000 + 30000;
      const baseTurns = Math.floor(Math.random() * 20 + 10);
      const weekendFactor = date.getDay() === 0 || date.getDay() === 6 ? 0.3 : 1;

      data.push({
        date: date.toISOString().split("T")[0],
        tokens: Math.floor(baseTokens * weekendFactor),
        cost: Math.floor((baseTokens * 0.000005) * weekendFactor * 100) / 100,
        turns: Math.floor(baseTurns * weekendFactor),
        sessions: Math.floor((baseTurns / 5) * weekendFactor) || 1,
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
        modelId: model.id,
        modelName: model.name,
        providerId: model.provider,
        providerName: model.provider,
        tokens: Math.floor(15672903 * baseUsage),
        cost: Math.floor(8742 * baseUsage) / 100,
        turns: Math.floor(2847 * baseUsage),
        color: stringToColor(model.id, i),
      };
    });
  },

  async getTopModels(
    timeRange: TimeRange,
    limit = 5
  ): Promise<TopModelStat[]> {
    const models = await this.getModelUsage(timeRange);
    const totalTokens = models.reduce((sum, m) => sum + m.tokens, 0);

    return models
      .slice(0, limit)
      .map((m) => ({
        modelId: m.modelId,
        modelName: m.modelName,
        tokens: m.tokens,
        cost: m.cost,
        percentage: Math.round((m.tokens / totalTokens) * 100),
      }));
  },

  // ═══ Provider Analytics ═══
  async getProviderComparison(
    _timeRange: TimeRange
  ): Promise<ProviderComparisonData[]> {
    await simulateNetworkDelay(150);

    const providers = [
      { id: "anthropic", name: "Anthropic", share: 0.65 },
      { id: "openai", name: "OpenAI", share: 0.25 },
      { id: "google", name: "Google", share: 0.1 },
    ];

    return providers.map((p) => ({
      providerId: p.id,
      providerName: p.name,
      tokens: Math.floor(15672903 * p.share),
      cost: Math.floor(8742 * p.share) / 100,
      turns: Math.floor(2847 * p.share),
      avgResponseTime: Math.random() * 5000 + 2000,
      color: stringToColor(p.id),
    }));
  },

  // ═══ Codebase Analytics ═══
  async getCodebaseContributions(
    _timeRange: TimeRange
  ): Promise<CodebaseContribution[]> {
    await simulateNetworkDelay(150);

    return MOCK_DATA.codebases.map((cb) => ({
      codebaseId: cb.id,
      codebaseName: cb.name,
      path: cb.path,
      tokens: Math.floor(cb.totalCost * 180000),
      cost: cb.totalCost,
      turns: Math.floor(cb.totalCost * 32.5),
      lastActivity: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
    }));
  },

  async getTopCodebases(
    timeRange: TimeRange,
    limit = 5
  ): Promise<CodebaseContribution[]> {
    const codebases = await this.getCodebaseContributions(timeRange);
    return codebases
      .sort((a, b) => b.cost - a.cost)
      .slice(0, limit);
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
  async getCostBreakdown(
    _timeRange: TimeRange
  ): Promise<CostBreakdown[]> {
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
      cost: Math.floor(total * c.share * 100) / 100,
      percentage: Math.round(c.share * 100),
      color: stringToColor(c.name, i),
    }));
  },

  // ═══ Rate Limits ═══
  async getRateLimitTrend(provider?: string): Promise<RateLimitTrend[]> {
    await simulateNetworkDelay(100);

    const providers = provider
      ? [provider]
      : ["anthropic", "openai", "google"];

    const results: RateLimitTrend[] = [];

    for (const p of providers) {
      const history: { timestamp: Date; percentRemaining: number }[] = [];
      const now = Date.now();

      for (let i = 24; i >= 0; i--) {
        history.push({
          timestamp: new Date(now - i * 60 * 60 * 1000),
          percentRemaining: Math.random() * 40 + 50,
        });
      }

      results.push({
        provider: p,
        windowLabel: "1 hour",
        history,
      });
    }

    return results;
  },

  // ═══ Insights ═══
  async getInsights(_timeRange: TimeRange): Promise<UsageInsight[]> {
    await simulateNetworkDelay(100);

    return [
      {
        type: "trend",
        title: "Usage Up 23%",
        description: "Your token usage has increased by 23% compared to the previous period.",
        severity: "info",
      },
      {
        type: "comparison",
        title: "Claude Sonnet Your Most Used Model",
        description: "Claude Sonnet 4 accounts for 35% of your total token usage.",
        severity: "success",
      },
      {
        type: "anomaly",
        title: "High Cost Yesterday",
        description: "Yesterday's session cost 3x more than average due to large context usage.",
        severity: "warning",
      },
    ];
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
    const rows = data
      .map((d) => `${d.date},${d.tokens},${d.cost},${d.turns},${d.sessions}`)
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    return URL.createObjectURL(blob);
  },
};
