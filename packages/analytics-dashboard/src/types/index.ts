/**
 * Dashboard Types
 *
 * Type definitions for the Pi Analytics Dashboard.
 * These are self-contained to avoid importing Node.js packages in the browser.
 */

export type TimeRange = "7d" | "30d" | "90d" | "1y" | "all";

export type AggregationLevel = "hour" | "day" | "week" | "month";

export interface DashboardFilters {
  timeRange: TimeRange;
  providers: string[];
  models: string[];
  codebases: string[];
  sources: string[];
}

export interface MetricCardData {
  title: string;
  value: string;
  change?: {
    value: number;
    isPositive: boolean;
  };
  icon: string;
  trend?: number[];
}

export interface ChartDataPoint {
  date: string;
  label: string;
  value: number;
  [key: string]: string | number;
}

export interface ModelUsageData {
  modelId: string;
  modelName: string;
  providerId: string;
  providerName: string;
  tokens: number;
  cost: number;
  turns: number;
  color: string;
}

export interface ProviderComparisonData {
  providerId: string;
  providerName: string;
  tokens: number;
  cost: number;
  turns: number;
  avgResponseTime: number;
  color: string;
}

export interface TimelineData {
  date: string;
  tokens: number;
  cost: number;
  turns: number;
  sessions: number;
}

export interface CodebaseContribution {
  codebaseId: string;
  codebaseName: string;
  path: string;
  tokens: number;
  cost: number;
  turns: number;
  lastActivity: Date;
}

export interface TopModelStat {
  modelId: string;
  modelName: string;
  tokens: number;
  cost: number;
  percentage: number;
}

export interface HeatmapDataPoint {
  day: number;
  hour: number;
  value: number;
}

export interface UsageInsight {
  type: "trend" | "anomaly" | "comparison";
  title: string;
  description: string;
  severity: "info" | "warning" | "success";
}

export interface RateLimitTrend {
  provider: string;
  windowLabel: string;
  history: {
    timestamp: Date;
    percentRemaining: number;
  }[];
}

export interface CostBreakdown {
  category: string;
  cost: number;
  percentage: number;
  color: string;
}

export type ViewType = "overview" | "models" | "codebases" | "providers" | "timeline" | "settings";

export interface UserPreferences {
  defaultTimeRange: TimeRange;
  defaultView: ViewType;
  compactMode: boolean;
  showTrends: boolean;
  currency: "USD" | "EUR" | "GBP";
}

export interface ExportOptions {
  format: "json" | "csv" | "png";
  timeRange: TimeRange;
  includeRawData: boolean;
}