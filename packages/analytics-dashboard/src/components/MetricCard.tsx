/* C8 ignore file */
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
	title: string;
	value: number;
	formatter?: "number" | "currency" | "tokens" | "duration";
	previousValue?: number;
	icon: LucideIcon;
	trendData?: number[];
	className?: string;
}

export function MetricCard({
	title,
	value,
	formatter = "number",
	previousValue,
	icon: Icon,
	trendData,
	className,
}: MetricCardProps) {
	const percentChange = previousValue && previousValue > 0 ? ((value - previousValue) / previousValue) * 100 : 0;
	const isPositive = percentChange >= 0;
	const shouldShowChange = previousValue != null && previousValue > 0;

	const format = (val: number) => {
		switch (formatter) {
			case "currency": {
				return formatCurrency(val, "USD", true);
			}
			case "tokens": {
				return formatNumber(val);
			}
			case "duration": {
				return `${Math.floor(val / 60)}h`;
			}
			default: {
				return formatNumber(val);
			}
		}
	};

	// Simple sparkline
	const Sparkline = ({ data, positive }: { data: number[]; positive: boolean }) => {
		if (data.length < 2) return null;

		const min = Math.min(...data);
		const max = Math.max(...data);
		const range = max - min || 1;
		const points = data
			.map((v, i) => {
				const x = (i / (data.length - 1)) * 100;
				const y = 100 - ((v - min) / range) * 100;
				return `${x},${y}`;
			})
			.join(" ");

		return (
			<svg
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
				className="absolute bottom-0 left-0 right-0 h-16 opacity-20"
			>
				<polyline fill="none" stroke={positive ? "#10b981" : "#ef4444"} strokeWidth="3" points={points} />
			</svg>
		);
	};

	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 card-hover",
				className,
			)}
		>
			<div className="relative z-10 flex items-start justify-between">
				<div>
					<p className="text-sm font-medium text-zinc-400">{title}</p>
					<p className="mt-2 text-3xl font-bold tracking-tight text-white">{format(value)}</p>
					{shouldShowChange && (
						<div className="mt-2 flex items-center gap-1">
							{isPositive ? (
								<TrendingUp className="h-4 w-4 text-emerald-400" />
							) : (
								<TrendingDown className="h-4 w-4 text-rose-400" />
							)}
							<span className={cn("text-sm font-medium", isPositive ? "text-emerald-400" : "text-rose-400")}>
								{Math.abs(percentChange).toFixed(1)}%
							</span>
							<span className="text-sm text-zinc-500">vs last period</span>
						</div>
					)}
				</div>
				<div className="rounded-lg bg-zinc-800/50 p-3">
					<Icon className="h-6 w-6 text-zinc-300" />
				</div>
			</div>
			{trendData && <Sparkline data={trendData} positive={isPositive} />}
		</div>
	);
}
