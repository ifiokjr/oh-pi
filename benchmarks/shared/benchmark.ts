import * as fs from "node:fs/promises";
import * as path from "node:path";
import { performance } from "node:perf_hooks";

export type BenchmarkBudget = {
	medianMs?: number;
	p95Ms?: number;
};

export type BenchmarkDefinition = {
	id: string;
	label: string;
	group: string;
	iterations: number;
	warmupIterations?: number;
	note?: string;
	budget?: BenchmarkBudget;
	minSampleTimeMs?: number;
	maxSampleLoops?: number;
	run: () => Promise<void> | void;
};

export type BenchmarkResult = {
	id: string;
	label: string;
	group: string;
	iterations: number;
	warmupIterations: number;
	note?: string;
	budget?: BenchmarkBudget;
	minSampleTimeMs: number;
	avgLoopsPerSample: number;
	samplesMs: number[];
	minMs: number;
	maxMs: number;
	meanMs: number;
	medianMs: number;
	p95Ms: number;
	budgetFailures: string[];
};

export type BenchmarkSuiteReport = {
	suite: string;
	generatedAt: string;
	environment: {
		node: string;
		platform: NodeJS.Platform;
		arch: string;
		ci: boolean;
		sha: string | null;
	};
	results: BenchmarkResult[];
};

function round(value: number): number {
	return Number(value.toFixed(3));
}

function mean(values: readonly number[]): number {
	if (values.length === 0) {
		return 0;
	}

	let total = 0;
	for (const value of values) {
		total += value;
	}
	return total / values.length;
}

function percentile(sortedValues: readonly number[], percentileValue: number): number {
	if (sortedValues.length === 0) {
		return 0;
	}

	const position = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1));
	return sortedValues[position] ?? 0;
}

function evaluateBudget(result: { medianMs: number; p95Ms: number; budget?: BenchmarkBudget }): string[] {
	if (!result.budget) {
		return [];
	}

	const failures: string[] = [];

	if (result.budget.medianMs !== undefined && result.medianMs > result.budget.medianMs) {
		failures.push(`median ${result.medianMs.toFixed(2)}ms > ${result.budget.medianMs.toFixed(2)}ms`);
	}

	if (result.budget.p95Ms !== undefined && result.p95Ms > result.budget.p95Ms) {
		failures.push(`p95 ${result.p95Ms.toFixed(2)}ms > ${result.budget.p95Ms.toFixed(2)}ms`);
	}

	return failures;
}

async function runSample(definition: BenchmarkDefinition): Promise<{ sampleMs: number; loopCount: number }> {
	const minSampleTimeMs = Math.max(0, definition.minSampleTimeMs ?? 0);
	const maxSampleLoops = Math.max(1, definition.maxSampleLoops ?? 1_000);
	let loopCount = 0;
	const startedAt = performance.now();

	while (true) {
		await definition.run();
		loopCount += 1;

		const elapsedMs = performance.now() - startedAt;
		if (elapsedMs >= minSampleTimeMs || loopCount >= maxSampleLoops) {
			return {
				sampleMs: elapsedMs / loopCount,
				loopCount,
			};
		}
	}
}

export async function runBenchmark(definition: BenchmarkDefinition): Promise<BenchmarkResult> {
	const warmupIterations = Math.max(0, definition.warmupIterations ?? 1);
	for (let index = 0; index < warmupIterations; index++) {
		await runSample(definition);
	}

	const samplesMs: number[] = [];
	const sampleLoopCounts: number[] = [];
	for (let index = 0; index < definition.iterations; index++) {
		const sample = await runSample(definition);
		samplesMs.push(sample.sampleMs);
		sampleLoopCounts.push(sample.loopCount);
	}

	const sortedSamples = [...samplesMs].sort((left, right) => left - right);
	const minMs = round(sortedSamples[0] ?? 0);
	const maxMs = round(sortedSamples.at(-1) ?? 0);
	const meanMs = round(mean(samplesMs));
	const medianMs = round(percentile(sortedSamples, 0.5));
	const p95Ms = round(percentile(sortedSamples, 0.95));
	const budgetFailures = evaluateBudget({ medianMs, p95Ms, budget: definition.budget });

	return {
		id: definition.id,
		label: definition.label,
		group: definition.group,
		iterations: definition.iterations,
		warmupIterations,
		note: definition.note,
		budget: definition.budget,
		minSampleTimeMs: Math.max(0, definition.minSampleTimeMs ?? 0),
		avgLoopsPerSample: round(mean(sampleLoopCounts)),
		samplesMs: sortedSamples.map((value) => round(value)),
		minMs,
		maxMs,
		meanMs,
		medianMs,
		p95Ms,
		budgetFailures,
	};
}

function toMarkdown(report: BenchmarkSuiteReport): string {
	const lines = [
		`# ${report.suite} benchmark report`,
		"",
		`- Generated: ${report.generatedAt}`,
		`- Node: ${report.environment.node}`,
		`- Platform: ${report.environment.platform}/${report.environment.arch}`,
		`- CI: ${report.environment.ci ? "yes" : "no"}`,
		`- SHA: ${report.environment.sha ?? "unknown"}`,
		"",
		"| Benchmark | Group | Median | p95 | Mean | Sample Floor | Budget | Status |",
		"| --- | --- | ---: | ---: | ---: | --- | --- | --- |",
	];

	for (const result of report.results) {
		const budget = result.budget
			? [
					result.budget.medianMs === undefined ? null : `median≤${result.budget.medianMs.toFixed(2)}ms`,
					result.budget.p95Ms === undefined ? null : `p95≤${result.budget.p95Ms.toFixed(2)}ms`,
				]
					.filter(Boolean)
					.join(" · ")
			: "—";
		const status = result.budgetFailures.length === 0 ? "✅ pass" : `❌ ${result.budgetFailures.join("; ")}`;
		const sampleFloor =
			result.minSampleTimeMs > 0
				? `${result.minSampleTimeMs.toFixed(0)}ms floor · ${result.avgLoopsPerSample.toFixed(1)} loops/sample`
				: "—";
		lines.push(
			`| ${result.label} | ${result.group} | ${result.medianMs.toFixed(2)}ms | ${result.p95Ms.toFixed(2)}ms | ${result.meanMs.toFixed(2)}ms | ${sampleFloor} | ${budget} | ${status} |`,
		);

		if (result.note) {
			lines.push(`| ↳ note |  |  |  |  |  | ${result.note} |`);
		}
	}

	return `${lines.join("\n")}\n`;
}

export async function writeBenchmarkReport(
	report: BenchmarkSuiteReport,
	outputDir: string,
): Promise<{
	jsonPath: string;
	markdownPath: string;
}> {
	await fs.mkdir(outputDir, { recursive: true });
	const jsonPath = path.join(outputDir, `${report.suite}.json`);
	const markdownPath = path.join(outputDir, `${report.suite}.md`);
	await fs.writeFile(jsonPath, `${JSON.stringify(report, null, "\t")}\n`, "utf-8");
	await fs.writeFile(markdownPath, toMarkdown(report), "utf-8");
	return { jsonPath, markdownPath };
}

export function createSuiteReport(suite: string, results: BenchmarkResult[]): BenchmarkSuiteReport {
	return {
		suite,
		generatedAt: new Date().toISOString(),
		environment: {
			node: process.version,
			platform: process.platform,
			arch: process.arch,
			ci: process.env.CI === "true",
			sha: process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
		},
		results,
	};
}
