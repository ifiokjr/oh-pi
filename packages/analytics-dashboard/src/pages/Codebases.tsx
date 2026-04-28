/* C8 ignore file */
/**
 * Codebases Page
 *
 * Project/workspace usage analytics.
 */

import { BarChart } from "@/components/charts/BarChart";
import { useCodebaseContributions } from "@/hooks/useAnalytics";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useDashboardStore, useTimeRange } from "@/stores/dashboard";
import { Clock, DollarSign, FolderCode, GitBranch } from "lucide-react";

export function Codebases() {
	const timeRange = useTimeRange();
	const { data: codebases, isLoading } = useCodebaseContributions(timeRange);
	const selectedCodebase = useDashboardStore((s) => s.selectedCodebase);
	const setSelectedCodebase = useDashboardStore((s) => s.setSelectedCodebase);

	if (isLoading) {
		return <CodebasesSkeleton />;
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold text-white flex items-center gap-2">
						<FolderCode className="h-6 w-6 text-emerald-400" />
						Codebase Analytics
					</h1>
					<p className="text-zinc-400">Usage across your projects</p>
				</div>
			</div>

			{/* Total Stats */}
			{codebases && codebases.length > 0 && (
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
					<StatCard title="Projects" value={codebases.length} icon={FolderCode} />
					<StatCard
						title="Total Tokens"
						value={codebases.reduce((sum, c) => sum + c.tokens, 0)}
						formatter={(v) => `${(v / 1_000_000).toFixed(1)}M`}
						icon={Clock}
					/>
					<StatCard
						title="Total Cost"
						value={codebases.reduce((sum, c) => sum + c.cost, 0)}
						formatter={(v) => formatCurrency(v, "USD", true)}
						icon={DollarSign}
					/>
					<StatCard title="Active Projects" value={codebases.filter((c) => c.cost > 0).length} icon={GitBranch} />
				</div>
			)}

			{/* Charts */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
					<h2 className="mb-4 text-lg font-semibold text-white">Cost by Codebase</h2>
					{codebases && (
						<BarChart
							data={codebases.map((c) => ({
								displayValue: formatCurrency(c.cost, "USD", true),
								id: c.codebaseId,
								name: c.codebaseName,
								value: c.cost,
							}))}
							height={350}
							color="#10b981"
							onBarClick={setSelectedCodebase}
						/>
					)}
				</div>

				<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
					<h2 className="mb-4 text-lg font-semibold text-white">Tokens by Codebase</h2>
					{codebases && (
						<BarChart
							data={codebases.map((c) => ({
								displayValue: `${(c.tokens / 1000).toFixed(1)}k`,
								id: c.codebaseId,
								name: c.codebaseName,
								value: c.tokens,
							}))}
							height={350}
							color="#06b6d4"
							onBarClick={setSelectedCodebase}
						/>
					)}
				</div>
			</div>

			{/* Codebase List */}
			<div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
				<div className="border-b border-zinc-800 p-6">
					<h2 className="text-lg font-semibold text-white">All Codebases</h2>
				</div>
				<div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
					{codebases?.map((cb) => (
						<div
							key={cb.codebaseId}
							className={cn(
								"cursor-pointer rounded-lg border bg-zinc-950 p-4 transition-colors",
								selectedCodebase === cb.codebaseId
									? "border-emerald-500/50 bg-emerald-900/20"
									: "border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900",
							)}
							onClick={() => setSelectedCodebase(cb.codebaseId)}
						>
							<div className="flex items-start justify-between">
								<div>
									<div className="flex items-center gap-2">
										<FolderCode className="h-4 w-4 text-emerald-400" />
										<h3 className="font-medium text-zinc-200">{cb.codebaseName}</h3>
									</div>
									<p className="mt-1 text-xs text-zinc-500 truncate">{cb.path}</p>
								</div>
								<span className="text-emerald-400 font-medium">{formatCurrency(cb.cost, "USD", true)}</span>
							</div>

							<div className="mt-3 flex items-center gap-4 text-xs text-zinc-400">
								<span>{(cb.tokens / 1000).toFixed(1)}k tokens</span>
								<span>{cb.turns} turns</span>
								<span className="ml-auto">Active {formatDate(cb.lastActivity)}</span>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function StatCard({
	title,
	value,
	formatter = (v) => v.toLocaleString(),
	icon: Icon,
}: {
	title: string;
	value: number;
	formatter?: (v: number) => string;
	icon: typeof FolderCode;
}) {
	return (
		<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
			<div className="flex items-center gap-3">
				<div className="rounded-lg bg-zinc-800/50 p-2">
					<Icon className="h-5 w-5 text-zinc-400" />
				</div>
				<div>
					<p className="text-xs text-zinc-500">{title}</p>
					<p className="text-xl font-bold text-white">{formatter(value)}</p>
				</div>
			</div>
		</div>
	);
}

function CodebasesSkeleton() {
	return (
		<div className="space-y-6">
			<div className="h-8 w-72 animate-pulse rounded bg-zinc-800" />
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
				{[...Array(4)].map((_, i) => (
					<div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-800" />
				))}
			</div>
			<div className="h-96 animate-pulse rounded-xl bg-zinc-800" />
		</div>
	);
}
