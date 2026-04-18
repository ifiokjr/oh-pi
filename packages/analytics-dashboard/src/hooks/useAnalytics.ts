/* c8 ignore file */
/**
 * Analytics Hooks
 *
 * TanStack Query hooks for fetching analytics data with caching and refetching.
 */

import { useQuery, useQueries } from "@tanstack/react-query";
import { analyticsApi } from "@/api/analytics";
import type { TimeRange, AggregationLevel } from "@/types";
import { useTimeRange } from "@/stores/dashboard";

// Query keys factory for consistent caching
const analyticsKeys = {
  all: ["analytics"] as const,
  summary: (range: TimeRange) => [...analyticsKeys.all, "summary", range] as const,
  timeline: (range: TimeRange, agg: AggregationLevel) =>
    [...analyticsKeys.all, "timeline", range, agg] as const,
  models: (range: TimeRange) => [...analyticsKeys.all, "models", range] as const,
  topModels: (range: TimeRange) => [...analyticsKeys.all, "top-models", range] as const,
  providers: (range: TimeRange) => [...analyticsKeys.all, "providers", range] as const,
  codebases: (range: TimeRange) => [...analyticsKeys.all, "codebases", range] as const,
  topCodebases: (range: TimeRange) =>
    [...analyticsKeys.all, "top-codebases", range] as const,
  heatmap: () => [...analyticsKeys.all, "heatmap"] as const,
  insights: (range: TimeRange) => [...analyticsKeys.all, "insights", range] as const,
  costBreakdown: (range: TimeRange) =>
    [...analyticsKeys.all, "cost-breakdown", range] as const,
  rateLimits: (provider?: string) =>
    [...analyticsKeys.all, "rate-limits", provider ?? "all"] as const,
};

/**
 * Hook for summary statistics
 */
export function useSummaryStats(timeRange: TimeRange) {
  return useQuery({
    queryKey: analyticsKeys.summary(timeRange),
    queryFn: () => analyticsApi.getSummaryForRange(timeRange),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook for timeline/chart data
 */
export function useTimelineData(
  timeRange: TimeRange,
  aggregation: AggregationLevel = "day"
) {
  return useQuery({
    queryKey: analyticsKeys.timeline(timeRange, aggregation),
    queryFn: () => analyticsApi.getTimelineData(timeRange, aggregation),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook for model usage data
 */
export function useModelUsage(timeRange: TimeRange) {
  return useQuery({
    queryKey: analyticsKeys.models(timeRange),
    queryFn: () => analyticsApi.getModelUsage(timeRange),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for top models
 */
export function useTopModels(timeRange: TimeRange, limit = 5) {
  return useQuery({
    queryKey: analyticsKeys.topModels(timeRange),
    queryFn: () => analyticsApi.getTopModels(timeRange, limit),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for provider comparison
 */
export function useProviderComparison(timeRange: TimeRange) {
  return useQuery({
    queryKey: analyticsKeys.providers(timeRange),
    queryFn: () => analyticsApi.getProviderComparison(timeRange),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for codebase contributions
 */
export function useCodebaseContributions(timeRange: TimeRange) {
  return useQuery({
    queryKey: analyticsKeys.codebases(timeRange),
    queryFn: () => analyticsApi.getCodebaseContributions(timeRange),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for top codebases
 */
export function useTopCodebases(timeRange: TimeRange, limit = 5) {
  return useQuery({
    queryKey: analyticsKeys.topCodebases(timeRange),
    queryFn: () => analyticsApi.getTopCodebases(timeRange, limit),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for activity heatmap
 */
export function useActivityHeatmap() {
  return useQuery({
    queryKey: analyticsKeys.heatmap(),
    queryFn: () => analyticsApi.getActivityHeatmap(),
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

/**
 * Hook for cost breakdown
 */
export function useCostBreakdown(timeRange: TimeRange) {
  return useQuery({
    queryKey: analyticsKeys.costBreakdown(timeRange),
    queryFn: () => analyticsApi.getCostBreakdown(timeRange),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for usage insights
 */
export function useInsights(timeRange: TimeRange) {
  return useQuery({
    queryKey: analyticsKeys.insights(timeRange),
    queryFn: () => analyticsApi.getInsights(timeRange),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Hook for rate limit trends
 */
export function useRateLimitTrends(provider?: string) {
  return useQuery({
    queryKey: analyticsKeys.rateLimits(provider),
    queryFn: () => analyticsApi.getRateLimitTrend(provider),
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // Auto-refresh every minute
  });
}

/**
 * Combined hook for dashboard overview data
 * Fetches all data needed for the overview in parallel
 */
export function useDashboardOverview() {
  const timeRange = useTimeRange();

  const [
    summary,
    timeline,
    topModels,
    topCodebases,
    costBreakdown,
    insights,
  ] = useQueries({
    queries: [
      {
        queryKey: analyticsKeys.summary(timeRange),
        queryFn: () => analyticsApi.getSummaryForRange(timeRange),
        staleTime: 5 * 60 * 1000,
      },
      {
        queryKey: analyticsKeys.timeline(timeRange, "day"),
        queryFn: () => analyticsApi.getTimelineData(timeRange, "day"),
        staleTime: 2 * 60 * 1000,
      },
      {
        queryKey: analyticsKeys.topModels(timeRange),
        queryFn: () => analyticsApi.getTopModels(timeRange, 5),
        staleTime: 5 * 60 * 1000,
      },
      {
        queryKey: analyticsKeys.topCodebases(timeRange),
        queryFn: () => analyticsApi.getTopCodebases(timeRange, 5),
        staleTime: 5 * 60 * 1000,
      },
      {
        queryKey: analyticsKeys.costBreakdown(timeRange),
        queryFn: () => analyticsApi.getCostBreakdown(timeRange),
        staleTime: 5 * 60 * 1000,
      },
      {
        queryKey: analyticsKeys.insights(timeRange),
        queryFn: () => analyticsApi.getInsights(timeRange),
        staleTime: 30 * 60 * 1000,
      },
    ],
  });

  return {
    summary: summary.data,
    summaryStatus: summary.status,
    timeline: timeline.data,
    timelineStatus: timeline.status,
    topModels: topModels.data,
    topModelsStatus: topModels.status,
    topCodebases: topCodebases.data,
    topCodebasesStatus: topCodebases.status,
    costBreakdown: costBreakdown.data,
    costBreakdownStatus: costBreakdown.status,
    insights: insights.data,
    insightsStatus: insights.status,
    isLoading:
      summary.isLoading ||
      timeline.isLoading ||
      topModels.isLoading ||
      topCodebases.isLoading ||
      costBreakdown.isLoading ||
      insights.isLoading,
    error:
      summary.error ||
      timeline.error ||
      topModels.error ||
      topCodebases.error ||
      costBreakdown.error ||
      insights.error,
  };
}


