/* c8 ignore file -- tested via Playwright E2E and separate vitest suite */
/**
 * Activity Heatmap Component
 *
 * GitHub-style contribution heatmap showing activity over time.
 */
import { cn } from "@/lib/utils";
import type { HeatmapDataPoint } from "@/types";

interface ActivityHeatmapProps {
  data: HeatmapDataPoint[];
  className?: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getColorClass(value: number): string {
  if (value === 0) return "bg-zinc-900";
  if (value < 0.2) return "bg-zinc-800";
  if (value < 0.4) return "bg-indigo-900/80";
  if (value < 0.6) return "bg-indigo-700";
  if (value < 0.8) return "bg-indigo-500";
  return "bg-indigo-400";
}

export function ActivityHeatmap({ data, className }: ActivityHeatmapProps) {
  // Group data by day (0-6, where 0 is Sunday)
  const byDay = Array.from({ length: 7 }, (_, day) =>
    data.filter((d) => d.day === day).sort((a, b) => a.hour - b.hour)
  );

  return (
    <div className={cn("w-full", className)}>
      <div className="flex gap-1">
        <div className="flex flex-col gap-1 pr-2 pt-6">
          {DAYS.map((day) => (
            <div key={day} className="h-3 text-[10px] text-zinc-500">
              {day}
            </div>
          ))}
        </div>

        <div className="flex-1">
          {/* Hour labels */}
          <div className="mb-1 flex justify-between px-1">
            {[0, 6, 12, 18, 23].map((h) => (
              <span key={h} className="text-[10px] text-zinc-500">
                {h === 0 ? "12am" : h === 12 ? "12pm" : h > 12 ? `${h - 12}pm` : `${h}am`}
              </span>
            ))}
          </div>

          {/* Heatmap grid */}
          <div className="flex gap-1 overflow-x-auto pb-2">
            {byDay.map((dayData, dayIndex) => (
              <div key={dayIndex} className="flex flex-col gap-1">
                {dayData.map((point, hourIndex) => (
                  <div
                    key={hourIndex}
                    className={cn(
                      "h-3 w-3 rounded-sm transition-colors hover:ring-1 hover:ring-white/50",
                      getColorClass(point.value)
                    )}
                    title={`${DAYS[point.day]} ${point.hour}:00 - ${Math.round(point.value * 100)}% activity`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-end gap-2 text-[10px] text-zinc-500">
        <span>Less</span>
        {["bg-zinc-900", "bg-zinc-800", "bg-indigo-900/80", "bg-indigo-700", "bg-indigo-500", "bg-indigo-400"].map(
          (bg, i) => (
            <div key={i} className={cn("h-3 w-3 rounded-sm", bg)} />
          )
        )}
        <span>More</span>
      </div>
    </div>
  );
}
