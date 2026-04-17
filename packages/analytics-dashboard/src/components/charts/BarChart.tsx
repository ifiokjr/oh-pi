/**
 * Horizontal Bar Chart Component
 *
 * For ranking lists like top models or codebases.
 */
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";

interface BarDataItem {
  name: string;
  value: number;
  id: string;
  color?: string;
  displayValue?: string;
}

interface BarChartProps {
  data: BarDataItem[];
  title?: string;
  className?: string;
  height?: number;
  color?: string;
  maxBars?: number;
  onBarClick?: (id: string) => void;
}

export function BarChart({
  data,
  title,
  className,
  height = 300,
  color = "#6366f1",
  maxBars = 10,
  onBarClick,
}: BarChartProps) {
  // Limit data and sort
  const sortedData = data
    .slice(0, maxBars)
    .sort((a, b) => a.value - b.value);

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ value: number; payload: BarDataItem }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 shadow-xl">
          <p className="font-medium text-zinc-200">{label}</p>
          <p className="mt-1 text-lg font-bold text-primary-400">
            {item.displayValue ?? item.value}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={cn("w-full", className)}>
      {title && (
        <h3 className="mb-4 text-lg font-semibold text-zinc-200">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 0, right: 30, left: 80, bottom: 0 }}
        >
          <XAxis
            type="number"
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickFormatter={(val) =>
              val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toString()
            }
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "#a1a1aa", fontSize: 11 }}
            width={75}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(99, 102, 241, 0.1)" }} />
          <Bar
            dataKey="value"
            fill={color}
            radius={[0, 4, 4, 0]}
            onClick={(_e, payload) => {
              if (onBarClick && payload?.id) onBarClick(payload.id);
            }}
            cursor={onBarClick ? "pointer" : "default"}
          >
            {sortedData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color ?? color}
                opacity={0.6 + (index / sortedData.length) * 0.4}
              />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
