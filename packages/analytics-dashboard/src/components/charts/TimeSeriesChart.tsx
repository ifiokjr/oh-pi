/* C8 ignore file */
/**
 * Time Series Chart Component
 *
 * A line/area chart for displaying usage over time.
 */
import { cn, formatNumber } from "@/lib/utils";
import type { TimelineData } from "@/types";
import { format, parseISO } from "date-fns";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface TimeSeriesChartProps {
	data: TimelineData[];
	metric: "tokens" | "cost" | "turns" | "sessions";
	showArea?: boolean;
	className?: string;
	height?: number;
}

const metricConfig = {
	cost: {
		color: "#10b981",
		gradientFrom: "#10b981",
		gradientTo: "rgba(16, 185, 129, 0.1)",
		label: "Cost ($)",
	},
	sessions: {
		color: "#8b5cf6",
		gradientFrom: "#8b5cf6",
		gradientTo: "rgba(139, 92, 246, 0.1)",
		label: "Sessions",
	},
	tokens: {
		color: "#6366f1",
		gradientFrom: "#6366f1",
		gradientTo: "rgba(99, 102, 241, 0.1)",
		label: "Tokens",
	},
	turns: {
		color: "#f59e0b",
		gradientFrom: "#f59e0b",
		gradientTo: "rgba(245, 158, 11, 0.1)",
		label: "Turns",
	},
};

export function TimeSeriesChart({ data, metric, showArea = true, className, height = 300 }: TimeSeriesChartProps) {
	const config = metricConfig[metric];

	// Custom tooltip
	const CustomTooltip = ({
		active,
		payload,
		label,
	}: {
		active?: boolean;
		payload?: { value: number; color: string }[];
		label?: string;
	}) => {
		if (active && payload && payload.length > 0) {
			const { value } = payload[0];
			const date = label ? parseISO(label) : new Date();

			return (
				<div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 shadow-xl">
					<p className="text-xs text-zinc-400">{format(date, "MMM d, yyyy")}</p>
					<p className="mt-1 text-lg font-bold" style={{ color: config.color }}>
						{metric === "cost" ? `$${value.toFixed(2)}` : formatNumber(value)}
					</p>
					<p className="text-xs text-zinc-500">{config.label}</p>
				</div>
			);
		}
		return null;
	};

	// Format X axis date
	const formatXAxis = (tickItem: string) => {
		const date = parseISO(tickItem);
		return format(date, "MMM d");
	};

	// Format Y axis value
	const formatYAxis = (value: number) => {
		if (value === 0) return "0";
		if (value >= 1_000_000) return `${(value / 1000000).toFixed(1)}M`;
		if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
		return value.toString();
	};

	return (
		<div className={cn("w-full", className)}>
			<ResponsiveContainer width="100%" height={height}>
				<AreaChart data={data} margin={{ bottom: 0, left: 0, right: 10, top: 10 }}>
					<defs>
						<linearGradient id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor={config.gradientFrom} stopOpacity={0.3} />
							<stop offset="95%" stopColor={config.gradientTo} stopOpacity={0} />
						</linearGradient>
					</defs>
					<CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
					<XAxis
						dataKey="date"
						tickFormatter={formatXAxis}
						tick={{ fill: "#71717a", fontSize: 12 }}
						tickLine={{ stroke: "#27272a" }}
						axisLine={{ stroke: "#27272a" }}
						interval="preserveStartEnd"
						minTickGap={30}
					/>
					<YAxis
						tickFormatter={formatYAxis}
						tick={{ fill: "#71717a", fontSize: 12 }}
						tickLine={false}
						axisLine={false}
						width={50}
					/>
					<Tooltip content={<CustomTooltip />} cursor={{ stroke: config.color, strokeWidth: 1 }} />
					{showArea ? (
						<Area
							type="monotone"
							dataKey={metric}
							stroke={config.color}
							strokeWidth={2}
							fill={`url(#gradient-${metric})`}
							animationDuration={500}
						/>
					) : (
						<Area
							type="monotone"
							dataKey={metric}
							stroke={config.color}
							strokeWidth={2}
							fill="transparent"
							animationDuration={500}
						/>
					)}
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
}
