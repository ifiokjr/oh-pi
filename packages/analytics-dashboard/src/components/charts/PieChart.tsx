/* C8 ignore file */
/**
 * Pie/Donut Chart Component
 *
 * For displaying breakdowns like cost by model or提供商.
 */
import { useState } from "react";
import { Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Sector } from "recharts";
import { cn } from "@/lib/utils";

interface PieDataItem {
	name: string;
	value: number;
	color: string;
	id: string;
}

interface PieChartProps {
	data: PieDataItem[];
	title?: string;
	className?: string;
	height?: number;
	innerRadius?: number;
	outerRadius?: number;
	onSliceClick?: (id: string) => void;
}

// Active slice render for hover effect
const renderActiveShape = (props: {
	cx: number;
	cy: number;
	innerRadius: number;
	outerRadius: number;
	startAngle: number;
	endAngle: number;
	fill: string;
}) => {
	const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
	return (
		<g>
			<Sector
				cx={cx}
				cy={cy}
				innerRadius={innerRadius}
				outerRadius={outerRadius + 4}
				startAngle={startAngle}
				endAngle={endAngle}
				fill={fill}
				stroke="#18181b"
				strokeWidth={2}
			/>
		</g>
	);
};

export function PieChart({
	data,
	title,
	className,
	height = 280,
	innerRadius = 60,
	outerRadius = 80,
	onSliceClick,
}: PieChartProps) {
	const [activeIndex, setActiveIndex] = useState<number | null>(null);

	const onPieEnter = (_: unknown, index: number) => {
		setActiveIndex(index);
	};

	const onPieLeave = () => {
		setActiveIndex(null);
	};

	const handleClick = (_: unknown, index: number) => {
		if (onSliceClick) {
			onSliceClick(data[index].id);
		}
	};

	const total = data.reduce((sum, item) => sum + item.value, 0);

	return (
		<div className={cn("w-full", className)}>
			{title && <h3 className="mb-4 text-lg font-semibold text-zinc-200">{title}</h3>}
			<ResponsiveContainer width="100%" height={height}>
				<RechartsPieChart>
					<Pie
						activeIndex={activeIndex ?? undefined}
						activeShape={renderActiveShape}
						data={data}
						cx="50%"
						cy="50%"
						innerRadius={innerRadius}
						outerRadius={outerRadius}
						paddingAngle={2}
						dataKey="value"
						onMouseEnter={onPieEnter}
						onMouseLeave={onPieLeave}
						onClick={handleClick}
					>
						{data.map((entry, index) => (
							<Cell
								key={`cell-${index}`}
								fill={entry.color}
								stroke="#18181b"
								strokeWidth={2}
								cursor={onSliceClick ? "pointer" : "default"}
							/>
						))}
					</Pie>
				</RechartsPieChart>
			</ResponsiveContainer>

			{/* Legend */}
			<div className="mt-4 grid grid-cols-2 gap-2">
				{data.map((item) => (
					<div
						key={item.id}
						className="flex items-center gap-2 text-sm"
						onClick={() => onSliceClick?.(item.id)}
						role={onSliceClick ? "button" : undefined}
					>
						<div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
						<span className="truncate text-zinc-300">{item.name}</span>
						<span className="ml-auto text-zinc-500">{((item.value / total) * 100).toFixed(0)}%</span>
					</div>
				))}
			</div>
		</div>
	);
}
