/* c8 ignore file -- tested via Playwright E2E and separate vitest suite */
/**
 * Models Page
 *
 * Detailed view of model usage and performance.
 */

import { useModelUsage } from "@/hooks/useAnalytics";
import { BarChart } from "@/components/charts/BarChart";
import { PieChart } from "@/components/charts/PieChart";
import { useTimeRange, useDashboardStore } from "@/stores/dashboard";
import { stringToColor, formatCurrency, cn } from "@/lib/utils";
import {
  Cpu,
  TrendingUp,
  DollarSign,
  Clock,
  Database,
} from "lucide-react";

export function Models() {
  const timeRange = useTimeRange();
  const { data: models, isLoading } = useModelUsage(timeRange);
  const selectedModel = useDashboardStore((s) => s.selectedModel);
  const setSelectedModel = useDashboardStore((s) => s.setSelectedModel);

  if (isLoading) {
    return <ModelsSkeleton />;
  }

  if (!models || models.length === 0) {
    return <div className="p-8 text-center text-zinc-500">No model data available</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Cpu className="h-6 w-6 text-primary-400" />
            Model Analytics
          </h1>
          <p className="text-zinc-400">Breakdown by model and provider performance</p>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          title="Total Models"
          value={models.length}
          icon={Database}
        />
        <StatCard
          title="Total Tokens"
          value={models.reduce((sum, m) => sum + m.tokens, 0)}
          formatter={(v) => `${(v / 1000000).toFixed(1)}M`}
          icon={TrendingUp}
        />
        <StatCard
          title="Total Cost"
          value={models.reduce((sum, m) => sum + m.cost, 0)}
          formatter={(v) => formatCurrency(v, "USD", true)}
          icon={DollarSign}
        />
        <StatCard
          title="Avg Response"
          value={2.3}
          formatter={(v) => `${v}s`}
          icon={Clock}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Token Usage by Model */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Token Usage by Model</h2>
          <BarChart
            data={models.slice(0, 10).map((m) => ({
              id: m.modelId,
              name: m.modelName,
              value: m.tokens,
              color: stringToColor(m.modelId),
              displayValue: `${(m.tokens / 1000).toFixed(1)}k`,
            }))}
            height={350}
            onBarClick={setSelectedModel}
          />
        </div>

        {/* Cost Distribution */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Cost Distribution</h2>
          <PieChart
            data={models.slice(0, 8).map((m) => ({
              id: m.modelId,
              name: m.modelName,
              value: m.cost,
              color: stringToColor(m.modelId),
            }))}
            height={300}
            onSliceClick={setSelectedModel}
          />
        </div>
      </div>

      {/* Model List Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
        <div className="border-b border-zinc-800 p-6">
          <h2 className="text-lg font-semibold text-white">All Models</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400">Model</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400">Provider</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-zinc-400">Turns</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-zinc-400">Tokens</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-zinc-400">Cost</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-zinc-400">% of Usage</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => {
                const totalTokens = models.reduce((s, m) => s + m.tokens, 0);
                const percent = (model.tokens / totalTokens) * 100;
                return (
                  <tr
                    key={model.modelId}
                    className={cn(
                      "border-b border-zinc-800/50 transition-colors cursor-pointer",
                      selectedModel === model.modelId
                        ? "bg-primary-500/10"
                        : "hover:bg-zinc-800/30"
                    )}
                    onClick={() => setSelectedModel(model.modelId)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: model.color }}
                        />
                        <span className="font-medium text-zinc-200">{model.modelName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-zinc-400">
                      {model.providerName}
                    </td>
                    <td className="px-6 py-4 text-right text-zinc-300">
                      {model.turns.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right text-zinc-300">
                      {(model.tokens / 1000).toFixed(1)}k
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-zinc-200">
                      {formatCurrency(model.cost, "USD", true)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-zinc-400">{percent.toFixed(1)}%</span>
                        <div className="h-1.5 w-16 rounded-full bg-zinc-800">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${percent}%`,
                              backgroundColor: model.color,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
  icon: typeof Cpu;
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

function ModelsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-64 animate-pulse rounded bg-zinc-800" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-800" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-96 animate-pulse rounded-xl bg-zinc-800" />
        <div className="h-96 animate-pulse rounded-xl bg-zinc-800" />
      </div>
    </div>
  );
}