/* C8 ignore file */
/**
 * Analytics Hooks
 *
 * TanStack Query hooks for fetching analytics data with caching and refetching.
 */

import { useQueries, useQuery } from "@tanstack/react-query";
import { analyticsApi } from "@/api/analytics";
import type { AggregationLevel, TimeRange } from "@/types";
import { useTimeRange } from "@/stores/dashboard";

// Query keys factory for consistent caching
const analyticsKeys = {
	all: ["analytics"] as const,
	codebases: (range: TimeRange) => [...analyticsKeys.all, "codebases", range] as const,
	costBreakdown: (range: TimeRange) => [...analyticsKeys.all, "cost-breakdown", range] as const,
	heatmap: () => [...analyticsKeys.all, "heatmap"] as const,
	insights: (range: TimeRange) => [...analyticsKeys.all, "insights", range] as const,
	models: (range: TimeRange) => [...analyticsKeys.all, "models", range] as const,
	providers: (range: TimeRange) => [...analyticsKeys.all, "providers", range] as const,
	rateLimits: (provider?: string) => [...analyticsKeys.all, "rate-limits", provider ?? "all"] as const,
	summary: (range: TimeRange) => [...analyticsKeys.all, "summary", range] as const,
	timeline: (range: TimeRange, agg: AggregationLevel) => [...analyticsKeys.all, "timeline", range, agg] as const,
	topCodebases: (range: TimeRange) => [...analyticsKeys.all, "top-codebases", range] as const,
	topModels: (range: TimeRange) => [...analyticsKeys.all, "top-models", range] as const,
};

/**
 * Hook for summary statistics
 */
export function useSummaryStats(timeRange: TimeRange) {
	return useQuery({
		queryFn: () => analyticsApi.getSummaryForRange(timeRange),
		queryKey: analyticsKeys.summary(timeRange),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

/**
 * Hook for timeline/chart data
 */
export function useTimelineData(timeRange: TimeRange, aggregation: AggregationLevel = "day") {
	return useQuery({
		queryFn: () => analyticsApi.getTimelineData(timeRange, aggregation),
		queryKey: analyticsKeys.timeline(timeRange, aggregation),
		staleTime: 2 * 60 * 1000, // 2 minutes
	});
}

/**
 * Hook for model usage data
 */
export function useModelUsage(timeRange: TimeRange) {
	return useQuery({
		queryFn: () => analyticsApi.getModelUsage(timeRange),
		queryKey: analyticsKeys.models(timeRange),
		staleTime: 5 * 60 * 1000,
	});
}

/**
 * Hook for top models
 */
export function useTopModels(timeRange: TimeRange, limit = 5) {
	return useQuery({
		queryFn: () => analyticsApi.getTopModels(timeRange, limit),
		queryKey: analyticsKeys.topModels(timeRange),
		staleTime: 5 * 60 * 1000,
	});
}

/**
 * Hook for provider comparison
 */
export function useProviderComparison(timeRange: TimeRange) {
	return useQuery({
		queryFn: () => analyticsApi.getProviderComparison(timeRange),
		queryKey: analyticsKeys.providers(timeRange),
		staleTime: 5 * 60 * 1000,
	});
}

/**
 * Hook for codebase contributions
 */
export function useCodebaseContributions(timeRange: TimeRange) {
	return useQuery({
		queryFn: () => analyticsApi.getCodebaseContributions(timeRange),
		queryKey: analyticsKeys.codebases(timeRange),
		staleTime: 5 * 60 * 1000,
	});
}

/**
 * Hook for top codebases
 */
export function useTopCodebases(timeRange: TimeRange, limit = 5) {
	return useQuery({
		queryFn: () => analyticsApi.getTopCodebases(timeRange, limit),
		queryKey: analyticsKeys.topCodebases(timeRange),
		staleTime: 5 * 60 * 1000,
	});
}

/**
 * Hook for activity heatmap
 */
export function useActivityHeatmap() {
	return useQuery({
		queryFn: () => analyticsApi.getActivityHeatmap(),
		queryKey: analyticsKeys.heatmap(),
		staleTime: 60 * 60 * 1000, // 1 hour
	});
}

/**
 * Hook for cost breakdown
 */
export function useCostBreakdown(timeRange: TimeRange) {
	return useQuery({
		queryFn: () => analyticsApi.getCostBreakdown(timeRange),
		queryKey: analyticsKeys.costBreakdown(timeRange),
		staleTime: 5 * 60 * 1000,
	});
}

/**
 * Hook for usage insights
 */
export function useInsights(timeRange: TimeRange) {
	return useQuery({
		queryFn: () => analyticsApi.getInsights(timeRange),
		queryKey: analyticsKeys.insights(timeRange),
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

	const [summary, timeline, topModels, topCodebases, costBreakdown, insights] = useQueries({
		queries: [
			{
				queryFn: () => analyticsApi.getSummaryForRange(timeRange),
				queryKey: analyticsKeys.summary(timeRange),
				staleTime: 5 * 60 * 1000,
			},
			{
				queryFn: () => analyticsApi.getTimelineData(timeRange, "day"),
				queryKey: analyticsKeys.timeline(timeRange, "day"),
				staleTime: 2 * 60 * 1000,
			},
			{
				queryFn: () => analyticsApi.getTopModels(timeRange, 5),
				queryKey: analyticsKeys.topModels(timeRange),
				staleTime: 5 * 60 * 1000,
			},
			{
				queryFn: () => analyticsApi.getTopCodebases(timeRange, 5),
				queryKey: analyticsKeys.topCodebases(timeRange),
				staleTime: 5 * 60 * 1000,
			},
			{
				queryFn: () => analyticsApi.getCostBreakdown(timeRange),
				queryKey: analyticsKeys.costBreakdown(timeRange),
				staleTime: 5 * 60 * 1000,
			},
			{
				queryFn: () => analyticsApi.getInsights(timeRange),
				queryKey: analyticsKeys.insights(timeRange),
				staleTime: 30 * 60 * 1000,
			},
		],
	});

	return {
		costBreakdown: costBreakdown.data,
		costBreakdownStatus: costBreakdown.status,
		error:
			summary.error || timeline.error || topModels.error || topCodebases.error || costBreakdown.error || insights.error,
		insights: insights.data,
		insightsStatus: insights.status,
		isLoading:
			summary.isLoading ||
			timeline.isLoading ||
			topModels.isLoading ||
			topCodebases.isLoading ||
			costBreakdown.isLoading ||
			insights.isLoading,
		summary: summary.data,
		summaryStatus: summary.status,
		timeline: timeline.data,
		timelineStatus: timeline.status,
		topCodebases: topCodebases.data,
		topCodebasesStatus: topCodebases.status,
		topModels: topModels.data,
		topModelsStatus: topModels.status,
	};
}
