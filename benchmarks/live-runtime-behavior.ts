#!/usr/bin/env node
import { performance } from "node:perf_hooks";
import { buildCommandCatalog } from "../packages/extensions/extensions/compact-header.ts";

function time(label, fn, iterations) {
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		fn();
	}
	const totalMs = performance.now() - start;
	return {
		avgMs: totalMs / iterations,
		iterations,
		label,
		totalMs,
	};
}

function makeCommands(count) {
	const commands = [];
	for (let index = 0; index < count; index++) {
		commands.push({
			name: `command-${index}`,
			source: index % 6 === 0 ? "prompt" : index % 5 === 0 ? "skill" : "command",
		});
	}
	return commands;
}

function renderHeaderFromCatalog(catalog) {
	return `${catalog.prompts}\n${catalog.skills}`;
}

function makeJobs(count) {
	return Array.from({ length: count }, (_, index) => ({
		activity: "recent activity",
		agent: `agent-${index}`,
		elapsed: `${index + 1}ms`,
		id: `job-${index}`,
		status: index % 3 === 0 ? "running" : "complete",
		stepText: `step ${index % 4}/4`,
		tail: ["line a", "line b", "line c"],
		tokens: `${(index + 1) * 10}`,
	}));
}

function renderSubagentWidget(jobs, maxJobs = Number.POSITIVE_INFINITY) {
	const lines = ["Async subagents"];
	for (const job of jobs.slice(0, maxJobs)) {
		lines.push(`- ${job.id} ${job.agent} ${job.status} ${job.stepText} ${job.elapsed} ${job.tokens} ${job.activity}`);
		if (job.status === "running") {
			for (const line of job.tail) {
				lines.push(`  > ${line}`);
			}
		}
	}
	return lines;
}

function renderRecentSamples(samples) {
	return samples
		.slice(-8)
		.toReversed()
		.map(
			(sample) =>
				`${sample.age} · cpu ${sample.cpu}% · rss ${sample.rss}MB · p99 ${sample.p99}ms · max ${sample.max}ms`,
		);
}

function makeSamples(count) {
	return Array.from({ length: count }, (_, index) => ({
		age: `${index}s ago`,
		cpu: 20 + (index % 50),
		max: 20 + (index % 80),
		p99: 10 + (index % 40),
		rss: 300 + index,
	}));
}

const iterations = 500;

console.log("Compact-header command catalog rebuild vs cached render data\n");
console.log("commands\trebuild avg\tcached avg\tspeedup");
for (const size of [10, 100, 1000, 10_000]) {
	const commands = makeCommands(size);
	const catalog = buildCommandCatalog(commands);
	const rebuild = time("rebuild", () => buildCommandCatalog(commands), iterations);
	const cached = time("cached", () => renderHeaderFromCatalog(catalog), iterations);
	const speedup = cached.totalMs > 0 ? rebuild.totalMs / cached.totalMs : Number.POSITIVE_INFINITY;
	console.log(`${size}\t${rebuild.avgMs.toFixed(4)}ms\t${cached.avgMs.toFixed(4)}ms\t${speedup.toFixed(1)}x`);
}

console.log("\nSubagent widget scaling with and without the display cap (MAX_WIDGET_JOBS=4)\n");
console.log("jobs\tuncapped avg\tcapped avg\tspeedup");
for (const size of [1, 4, 16, 64]) {
	const jobs = makeJobs(size);
	const uncapped = time("uncapped", () => renderSubagentWidget(jobs), iterations);
	const capped = time("capped", () => renderSubagentWidget(jobs, 4), iterations);
	const speedup = capped.totalMs > 0 ? uncapped.totalMs / capped.totalMs : Number.POSITIVE_INFINITY;
	console.log(`${size}\t${uncapped.avgMs.toFixed(4)}ms\t${capped.avgMs.toFixed(4)}ms\t${speedup.toFixed(1)}x`);
}

console.log("\nWatchdog overlay history rendering with a fixed recent-sample window (8 rows)\n");
console.log("history\toverlay avg");
for (const size of [10, 100, 1000, 10_000]) {
	const samples = makeSamples(size);
	const result = time("overlay", () => renderRecentSamples(samples), iterations);
	console.log(`${size}\t${result.avgMs.toFixed(4)}ms`);
}

console.log("\nMitigations reflected here:");
console.log("- cap always-on widgets to a small visible set");
console.log("- render only recent history in overlays");
console.log("- push heavy detail into on-demand dashboards instead of hot-path UI");
