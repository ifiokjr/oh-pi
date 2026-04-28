/* C8 ignore file */
import { analyticsApi } from "@/api/analytics";
import type { TimeRange } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, MessageSquare, Smile, SpellCheck, TrendingUp } from "lucide-react";
import { useState } from "react";

export function Insights({ timeRange }: { timeRange: TimeRange }) {
	const [_selectedModel, _setSelectedModel] = useState<string>("all");

	const insights = useQuery({
		queryFn: () => analyticsApi.getInsights(timeRange),
		queryKey: ["insights", timeRange],
	});

	const wordData = useQuery({
		queryFn: () => analyticsApi.getTopWords(selectedModel === "all" ? undefined : selectedModel, timeRange),
		queryKey: ["words", timeRange, selectedModel],
	});

	const misspellings = useQuery({
		queryFn: () => analyticsApi.getMisspellings(timeRange),
		queryKey: ["misspellings", timeRange],
	});

	const emotional = useQuery({
		queryFn: () => analyticsApi.getEmotionalSummary(timeRange),
		queryKey: ["emotional", timeRange],
	});

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold text-white">Insights & Fun Stats</h1>
			</div>

			{/* Emotional Analysis Card */}
			<div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
				<div className="mb-4 flex items-center gap-2">
					<Smile className="h-5 w-5 text-purple-400" />
					<h2 className="text-lg font-semibold text-white">Emotional Tone</h2>
				</div>
				{emotional.isLoading ? (
					<div className="animate-pulse space-y-3">
						{[1, 2, 3].map((i) => (
							<div key={i} className="h-8 rounded bg-gray-800" />
						))}
					</div>
				) : (
					<div className="space-y-4">
						{/* Sentiment Distribution */}
						<div>
							<p className="mb-2 text-sm text-gray-400">Message Sentiment Distribution</p>
							<div className="flex gap-2">
								<EmotionBar label="Positive" value={emotional.data?.positive ?? 45} color="bg-green-500" />
								<EmotionBar label="Neutral" value={emotional.data?.neutral ?? 40} color="bg-gray-400" />
								<EmotionBar label="Frustrated" value={emotional.data?.frustrated ?? 15} color="bg-red-400" />
							</div>
						</div>

						{/* Top Emotion Labels */}
						<div>
							<p className="mb-2 text-sm text-gray-400">Most Common Emotions In Your Prompts</p>
							<div className="flex flex-wrap gap-2">
								{(
									emotional.data?.topLabels ??
									[
										"curious",
										"focused",
										"debugging",
										"refactoring",
										"learning",
										"frustrated",
										"satisfied",
										"exploratory",
										"urgent",
										"collaborative",
									].slice(0, 8)
								).map((label, i) => (
									<span key={i} className="rounded-full bg-purple-500/20 px-3 py-1 text-sm text-purple-300">
										{label}
									</span>
								))}
							</div>
						</div>

						{/* Emotion Over Time */}
						<div>
							<p className="mb-2 text-sm text-gray-400">Sentiment Trend</p>
							<div className="flex items-end gap-1 h-16">
								{(emotional.data?.trend ?? [0.3, 0.7, 0.5, 0.8, 0.6, 0.9, 0.4, 0.7, 0.8, 0.5, 0.6, 0.7, 0.9, 0.3]).map(
									(score: number, i: number) => (
										<div
											key={i}
											className="flex-1 rounded-t transition-all hover:opacity-80"
											style={{
												backgroundColor: score > 0.6 ? "#22c55e" : score > 0.3 ? "#a1a1aa" : "#f87171",
												height: `${Math.max(8, score * 100)}%`,
											}}
										/>
									),
								)}
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Word Frequency Card */}
			<div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
				<div className="mb-4 flex items-center gap-2">
					<MessageSquare className="h-5 w-5 text-blue-400" />
					<h2 className="text-lg font-semibold text-white">Most Common Words</h2>
				</div>
				<p className="mb-4 text-sm text-gray-400">The words that appear most often in your prompts.</p>
				{wordData.isLoading ? (
					<div className="animate-pulse grid grid-cols-4 gap-3">
						{Array.from({ length: 12 }).map((_, i) => (
							<div key={i} className="h-10 rounded bg-gray-800" />
						))}
					</div>
				) : (
					<div className="flex flex-wrap gap-2">
						{(wordData.data ?? mockWordCloud()).map((w, i) => (
							<span
								key={i}
								className="inline-block rounded-lg bg-blue-500/15 px-3 py-1 font-mono text-blue-300 transition-transform hover:scale-110"
								style={{
									fontSize: `${Math.max(0.7, Math.min(1.8, 0.7 + (w.count / 100) * 1.1))}rem`,
									opacity: Math.max(0.5, Math.min(1, 0.5 + (w.count / 50) * 0.5)),
								}}
							>
								{w.word}
								<span className="ml-1 text-xs text-blue-400/60">
									{w.count > 999 ? `${(w.count / 1000).toFixed(1)}k` : w.count}
								</span>
							</span>
						))}
					</div>
				)}
			</div>

			{/* Misspellings Card */}
			<div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
				<div className="mb-4 flex items-center gap-2">
					<SpellCheck className="h-5 w-5 text-amber-400" />
					<h2 className="text-lg font-semibold text-white">Most Common Misspellings</h2>
				</div>
				<p className="mb-4 text-sm text-gray-400">Words you misspell most often, with their corrections.</p>
				{misspellings.isLoading ? (
					<div className="animate-pulse space-y-2">
						{[1, 2, 3, 4, 5].map((i) => (
							<div key={i} className="h-10 rounded bg-gray-800" />
						))}
					</div>
				) : (
					<div className="space-y-2">
						{(misspellings.data ?? mockMisspellings()).map((m, i) => (
							<div key={i} className="flex items-center gap-4 rounded-lg bg-gray-900/50 px-4 py-2">
								<div className="flex items-center gap-2">
									<span className="font-mono text-red-400 line-through">{m.misspelled}</span>
									<span className="text-gray-500">→</span>
									<span className="font-mono text-green-400">{m.corrected}</span>
								</div>
								<div className="ml-auto flex items-center gap-2 text-sm text-gray-400">
									<span>{m.count}×</span>
									<div className="h-2 w-24 overflow-hidden rounded-full bg-gray-800">
										<div
											className="h-full rounded-full bg-amber-500/60"
											style={{
												width: `${Math.min(
													100,
													(m.count / maxMisspellingCount(misspellings.data ?? mockMisspellings())) * 100,
												)}%`,
											}}
										/>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Usage Insights Card */}
			<div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
				<div className="mb-4 flex items-center gap-2">
					<TrendingUp className="h-5 w-5 text-green-400" />
					<h2 className="text-lg font-semibold text-white">Usage Insights</h2>
				</div>
				{insights.isLoading ? (
					<div className="animate-pulse space-y-3">
						{[1, 2, 3].map((i) => (
							<div key={i} className="h-16 rounded bg-gray-800" />
						))}
					</div>
				) : (
					<div className="space-y-3">
						{(insights.data ?? []).map((insight, i) => (
							<div key={i} className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900/30 p-4">
								<InsightIcon type={insight.type} severity={insight.severity} />
								<div>
									<p className="font-medium text-white">{insight.title}</p>
									<p className="text-sm text-gray-400">{insight.description}</p>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function EmotionBar({ label, value, color }: { label: string; value: number; color: string }) {
	return (
		<div className="flex-1">
			<div className="mb-1 flex justify-between text-xs text-gray-400">
				<span>{label}</span>
				<span>{value}%</span>
			</div>
			<div className="h-3 overflow-hidden rounded-full bg-gray-800">
				<div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
			</div>
		</div>
	);
}

function InsightIcon({ type, severity }: { type: string; severity: string }) {
	if (severity === "warning") {
		return <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />;
	}
	if (type === "trend") {
		return <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />;
	}
	return <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />;
}

function maxMisspellingCount(items: { count: number }[]): number {
	return items.reduce((max, m) => Math.max(max, m.count), 1);
}

// Mock data for development
interface WordItem {
	word: string;
	count: number;
}
interface MisspellingItem {
	misspelled: string;
	corrected: string;
	count: number;
}

function mockWordCloud(): WordItem[] {
	return [
		{ count: 342, word: "function" },
		{ count: 289, word: "class" },
		{ count: 256, word: "interface" },
		{ count: 234, word: "component" },
		{ count: 198, word: "async" },
		{ count: 187, word: "type" },
		{ count: 176, word: "error" },
		{ count: 165, word: "test" },
		{ count: 154, word: "import" },
		{ count: 143, word: "return" },
		{ count: 132, word: "const" },
		{ count: 121, word: "export" },
		{ count: 98, word: "implement" },
		{ count: 87, word: "refactor" },
		{ count: 76, word: "config" },
		{ count: 65, word: "deploy" },
		{ count: 54, word: "database" },
		{ count: 43, word: "schema" },
	];
}

function mockMisspellings(): MisspellingItem[] {
	return [
		{ corrected: "reference", count: 23, misspelled: "refrence" },
		{ corrected: "default", count: 18, misspelled: "defualt" },
		{ corrected: "component", count: 15, misspelled: "compontent" },
		{ corrected: "handler", count: 12, misspelled: "handeler" },
		{ corrected: "interface", count: 10, misspelled: "interace" },
		{ corrected: "database", count: 8, misspelled: "databse" },
		{ corrected: "receive", count: 7, misspelled: "recieve" },
		{ corrected: "separate", count: 5, misspelled: "seperate" },
	];
}
