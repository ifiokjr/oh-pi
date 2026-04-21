import { describe, expect, it } from "vitest";
import { runBenchmark } from "./shared/benchmark";

const benchmarkIt = process.env.OH_PI_RUN_BENCHMARKS === "1" ? it : it.skip;

/**
 * Micro-benchmarks for low-level hot-path utilities that extensions depend on.
 * These isolate algorithmic regressions from architectural changes.
 */

describe("hot path micro benchmarks", () => {
	benchmarkIt(
		"bounded-array push (amortized O(1))",
		async () => {
			const result = await runBenchmark({
				id: "bounded-push",
				label: "bounded array push (amortized)",
				group: "micro",
				iterations: 50,
				warmupIterations: 2,
				minSampleTimeMs: 20,
				budget: { medianMs: 1, p95Ms: 5 },
				run() {
					const arr: number[] = [];
					const limit = 60;
					for (let i = 0; i < 10_000; i++) {
						arr.push(i);
						if (arr.length > limit * 2) {
							arr.copyWithin(0, arr.length - limit);
							arr.length = limit;
						}
					}
				},
			});
			expect(result.budgetFailures).toEqual([]);
		},
		30_000,
	);

	benchmarkIt(
		"timestamp array prune (copyWithin vs splice)",
		async () => {
			const result = await runBenchmark({
				id: "timestamp-prune",
				label: "timestamp array prune (copyWithin)",
				group: "micro",
				iterations: 50,
				warmupIterations: 2,
				minSampleTimeMs: 20,
				budget: { medianMs: 1, p95Ms: 5 },
				run() {
					const items: number[] = [];
					const now = Date.now();
					const cutoff = now - 120_000;
					for (let i = 0; i < 1000; i++) {
						items.push(now - Math.floor(Math.random() * 180_000));
					}
					let firstValid = 0;
					while (firstValid < items.length && items[firstValid] < cutoff) {
						firstValid += 1;
					}
					if (firstValid > 0) {
						if (firstValid <= 4) {
							items.splice(0, firstValid);
						} else {
							items.copyWithin(0, firstValid);
							items.length = items.length - firstValid;
						}
					}
				},
			});
			expect(result.budgetFailures).toEqual([]);
		},
		30_000,
	);

	benchmarkIt(
		"pheromone decay prune (write-pointer in-place)",
		async () => {
			const result = await runBenchmark({
				id: "pheromone-prune",
				label: "pheromone decay prune (write-pointer)",
				group: "micro",
				iterations: 50,
				warmupIterations: 2,
				minSampleTimeMs: 20,
				budget: { medianMs: 1, p95Ms: 5 },
				run() {
					const cache: { strength: number; createdAt: number }[] = [];
					const now = Date.now();
					for (let i = 0; i < 500; i++) {
						cache.push({ strength: 1.0, createdAt: now - Math.floor(Math.random() * 600_000) });
					}
					let write = 0;
					for (let read = 0; read < cache.length; read++) {
						const p = cache[read];
						p.strength = 0.5 ** ((now - p.createdAt) / (10 * 60 * 1000));
						if (p.strength > 0.05) {
							cache[write++] = p;
						}
					}
					cache.length = write;
				},
			});
			expect(result.budgetFailures).toEqual([]);
		},
		30_000,
	);

	benchmarkIt(
		"regex compilation (hoisted vs inline)",
		async () => {
			const HOISTED_RE = /(\d+(?:\.\d+)?)\s*(weeks?|w|days?|d|hours?|hrs?|hr|h|minutes?|mins?|min|m)\b/g;
			const text = "Resets in 2hours 30 minutes";
			const result = await runBenchmark({
				id: "regex-hoisted",
				label: "regex compilation (hoisted vs inline)",
				group: "micro",
				iterations: 100,
				warmupIterations: 5,
				minSampleTimeMs: 20,
				budget: { medianMs: 1, p95Ms: 5 },
				run() {
					for (let i = 0; i < 1000; i++) {
						HOISTED_RE.lastIndex = 0;
						// biome-ignore lint/correctness/noUnusedVariables: benchmark side effect
						const _ = [...text.matchAll(HOISTED_RE)];
					}
				},
			});
			expect(result.budgetFailures).toEqual([]);
		},
		30_000,
	);

	benchmarkIt(
		"single-pass map filter vs chained filter+map",
		async () => {
			const result = await runBenchmark({
				id: "single-pass-filter-map",
				label: "single-pass filter+map vs chained",
				group: "micro",
				iterations: 50,
				warmupIterations: 2,
				minSampleTimeMs: 20,
				budget: { medianMs: 1, p95Ms: 5 },
				run() {
					const arr: number[] = [];
					for (let i = 0; i < 1000; i++) {
						arr.push(i);
					}
					// Single-pass filter+map
					const out: string[] = [];
					for (const n of arr) {
						if (n % 3 === 0) {
							out.push(String(n * 2));
						}
					}
					// biome-ignore lint/correctness/noUnusedVariables: benchmark side effect
					const _sum = out.reduce((a, b) => a + Number(b), 0);
				},
			});
			expect(result.budgetFailures).toEqual([]);
		},
		30_000,
	);

	benchmarkIt(
		"map-to-array without intermediate copy",
		async () => {
			const result = await runBenchmark({
				id: "map-values-no-copy",
				label: "map values iteration without Array.from copy",
				group: "micro",
				iterations: 50,
				warmupIterations: 2,
				minSampleTimeMs: 20,
				budget: { medianMs: 1, p95Ms: 5 },
				run() {
					const map = new Map<string, number>();
					for (let i = 0; i < 500; i++) {
						map.set(`key-${i}`, i);
					}
					// Direct iteration without Array.from(map.values())
					let sum = 0;
					for (const v of map.values()) {
						sum += v;
					}
					// biome-ignore lint/correctness/noUnusedVariables: benchmark side effect
					const _ = sum;
				},
			});
			expect(result.budgetFailures).toEqual([]);
		},
		30_000,
	);
});
