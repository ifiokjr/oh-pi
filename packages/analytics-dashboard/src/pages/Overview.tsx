/* C8 ignore file */
/**
 * Overview Page
 *
 * Main dashboard view with summary metrics, charts, and insights.
 */

import { useActivityHeatmap, useDashboardOverview } from "@/hooks/useAnalytics";
import { MetricCard } from "@/components/MetricCard";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { PieChart } from "@/components/charts/PieChart";
import { BarChart } from "@/components/charts/BarChart";
import { ActivityHeatmap } from "@/components/charts/ActivityHeatmap";
import { useTimeRange } from "@/stores/dashboard";
import {
	AlertCircle,
	CheckCircle2,
	Clock,
	DollarSign,
	FolderOpen,
	Hash,
	MessageSquare,
	TrendingUp,
	Zap,
} from "lucide-react";
import { cn, stringToColor } from "@/lib/utils";

export function Overview() {
	const timeRange = useTimeRange();
	const { summary, timeline, topModels, topCodebases, costBreakdown, insights, isLoading } = useDashboardOverview();

	const { data: heatmapData } = useActivityHeatmap();

	if (isLoading) {
		return <OverviewSkeleton />;
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold text-white">Dashboard</h1>
					<p className="text-zinc-400">Your Pi usage analytics for the last {timeRange}</p>
				</div>
			</div>

			{/* Overview Cards */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<MetricCard
					title="Total Turns"
					value={summary?.turns ?? 0}
					previousValue={summary?.turns ? Math.round(summary.turns * 0.88) : undefined}
					formatter="number"
					icon={MessageSquare}
					trendData={[100, 120, 115, 140, 135, 160, 155, 180, 175, 200]}
				/>
				<MetricCard
					title="Total Cost"
					value={summary?.cost ?? 0}
					previousValue={summary?.cost ? Math.round(summary.cost * 0.92 * 100) / 100 : undefined}
					formatter="currency"
					icon={DollarSign}
				/>
				<MetricCard title="Total Tokens" value={summary?.tokens ?? 0} formatter="tokens" icon={Hash} />
				<MetricCard title="Sessions" value={summary?.sessions ?? 0} formatter="number" icon={Clock} />
			</div>

			{/* Charts Row */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
				{/* Usage Over Time */}
				<div className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
					<h2 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
						<TrendingUp className="h-5 w-5 text-primary-400" />
						Usage Over Time
					</h2>
					{timeline && <TimeSeriesChart data={timeline} metric="tokens" showArea height={300} />}
				</div>

				{/* Cost Breakdown */}
				<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
					{costBreakdown && (
						<PieChart
							data={costBreakdown.map((item) => ({
								color: item.color,
								id: item.category,
								name: item.category,
								value: item.cost,
							}))}
							title="Cost Breakdown"
							height={250}
						/>
					)}
				</div>
			</div>

			{/* Second Row */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				{/* Top Models */}
				<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
					<h2 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
						<Zap className="h-5 w-5 text-amber-400" />
						Top Models
					</h2>
					{topModels && (
						<BarChart
							data={topModels.map((m) => ({
								color: stringToColor(m.modelId),
								displayValue: `${(m.tokens / 1000).toFixed(1)}k`,
								id: m.modelId,
								name: m.modelName,
								value: m.tokens,
							}))}
							height={250}
							color="#6366f1"
						/>
					)}
				</div>

				{/* Top Codebases */}
				<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
					<h2 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
						<FolderOpen className="h-5 w-5 text-emerald-400" />
						Top Codebases
					</h2>
					{topCodebases && (
						<BarChart
							data={topCodebases.map((cb) => ({
								displayValue: `$${cb.cost.toFixed(2)}`,
								id: cb.codebaseId,
								name: cb.codebaseName,
								value: cb.tokens,
							}))}
							height={250}
							color="#10b981"
						/>
					)}
				</div>
			</div>

			{/* Heatmap & Insights */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				{/* Activity Heatmap */}
				<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
					<h2 className="mb-4 text-lg font-semibold text-white">Activity Pattern</h2>
					{heatmapData && <ActivityHeatmap data={heatmapData} />}
				</div>

				{/* Insights */}
				<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
					<h2 className="mb-4 text-lg font-semibold text-white">Insights</h2>
					<div className="space-y-3">
						{insights?.map((insight, i) => (
							<div
								key={i}
								className={cn(
									"flex items-start gap-3 rounded-lg border p-4",
									insight.severity === "success" && "border-emerald-800/50 bg-emerald-900/20",
									insight.severity === "warning" && "border-amber-800/50 bg-amber-900/20",
									insight.severity === "info" && "border-zinc-700/50 bg-zinc-800/30",
								)}
							>
								{insight.severity === "success" && <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />}
								{insight.severity === "warning" && <AlertCircle className="mt-0.5 h-5 w-5 text-amber-400" />}
								{insight.severity === "info" && <Zap className="mt-0.5 h-5 w-5 text-primary-400" />}
								<div>
									<h3 className="font-medium text-zinc-200">{insight.title}</h3>
									<p className="mt-0.5 text-sm text-zinc-400">{insight.description}</p>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function OverviewSkeleton() {
	return (
		<div className="space-y-6">
			<div className="h-8 w-48 animate-pulse rounded bg-zinc-800" />
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{[...Array(4)].map((_, i) => (
					<div key={i} className="h-32 animate-pulse rounded-xl bg-zinc-800" />
				))}
			</div>
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
				<div className="h-80 animate-pulse rounded-xl bg-zinc-800 lg:col-span-2" />
				<div className="h-80 animate-pulse rounded-xl bg-zinc-800" />
			</div>
		</div>
	);
}
