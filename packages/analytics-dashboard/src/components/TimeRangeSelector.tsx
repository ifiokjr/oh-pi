/* c8 ignore file -- tested via Playwright E2E and separate vitest suite */
import { cn } from "@/lib/utils";
import type { TimeRange } from "@/types";

const timeRanges: { value: TimeRange; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
];

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
  className?: string;
}

export function TimeRangeSelector({
  value,
  onChange,
  className,
}: TimeRangeSelectorProps) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-zinc-800 bg-zinc-900/50 p-1",
        className
      )}
    >
      {timeRanges.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          className={cn(
            "px-3 py-1.5 text-sm font-medium transition-colors rounded-md",
            value === range.value
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
          )}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}
