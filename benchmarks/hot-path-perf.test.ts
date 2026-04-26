
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
				budget: { medianMs: 1, p95Ms: 5 },
				group: "micro",
				id: "bounded-push",
				iterations: 50,
				label: "bounded array push (amortized)",
				minSampleTimeMs: 20,
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
				warmupIterations: 2,
			});
			expect(result.budgetFailures).toStrictEqual([]);
		},
		30_000,
	);

	benchmarkIt(
		"timestamp array prune (copyWithin vs splice)",
		async () => {
			const result = await runBenchmark({
				budget: { medianMs: 1, p95Ms: 5 },
				group: "micro",
				id: "timestamp-prune",
				iterations: 50,
				label: "timestamp array prune (copyWithin)",
				minSampleTimeMs: 20,
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
							items.length -= firstValid;
						}
					}
				},
				warmupIterations: 2,
			});
			expect(result.budgetFailures).toStrictEqual([]);
		},
		30_000,
	);

	benchmarkIt(
		"pheromone decay prune (write-pointer in-place)",
		async () => {
			const result = await runBenchmark({
				budget: { medianMs: 1, p95Ms: 5 },
				group: "micro",
				id: "pheromone-prune",
				iterations: 50,
				label: "pheromone decay prune (write-pointer)",
				minSampleTimeMs: 20,
				run() {
					const cache: { strength: number; createdAt: number }[] = [];
					const now = Date.now();
					for (let i = 0; i < 500; i++) {
						cache.push({ strength: 1.0, createdAt: now - Math.floor(Math.random() * 600_000) });
					}
					let write = 0;
					for (const p of cache) {
						p.strength = 0.5 ** ((now - p.createdAt) / (10 * 60 * 1000));
						if (p.strength > 0.05) {
							cache[write++] = p;
						}
					}
					cache.length = write;
				},
				warmupIterations: 2,
			});
			expect(result.budgetFailures).toStrictEqual([]);
		},
		30_000,
	);

	benchmarkIt(
		"regex compilation (hoisted vs inline)",
		async () => {
			const HOISTED_RE = /(\d+(?:\.\d+)?)\s*(weeks?|w|days?|d|hours?|hrs?|hr|h|minutes?|mins?|min|m)\b/g;
			const text = "Resets in 2hours 30 minutes";
			const result = await runBenchmark({
				budget: { medianMs: 1, p95Ms: 5 },
				group: "micro",
				id: "regex-hoisted",
				iterations: 100,
				label: "regex compilation (hoisted vs inline)",
				minSampleTimeMs: 20,
				run() {
					for (let i = 0; i < 1000; i++) {
						HOISTED_RE.lastIndex = 0;
						const _m = [...text.matchAll(HOISTED_RE)];
					}
				},
				warmupIterations: 5,
			});
			expect(result.budgetFailures).toStrictEqual([]);
		},
		30_000,
	);

	benchmarkIt(
		"single-pass map filter vs chained filter+map",
		async () => {
			const result = await runBenchmark({
				budget: { medianMs: 1, p95Ms: 5 },
				group: "micro",
				id: "single-pass-filter-map",
				iterations: 50,
				label: "single-pass filter+map vs chained",
				minSampleTimeMs: 20,
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
					const _sum = out.reduce((a, b) => a + Number(b), 0);
				},
				warmupIterations: 2,
			});
			expect(result.budgetFailures).toStrictEqual([]);
		},
		30_000,
	);

	benchmarkIt(
		"map-to-array without intermediate copy",
		async () => {
			const result = await runBenchmark({
				budget: { medianMs: 1, p95Ms: 5 },
				group: "micro",
				id: "map-values-no-copy",
				iterations: 50,
				label: "map values iteration without Array.from copy",
				minSampleTimeMs: 20,
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
					const _sum = sum;
				},
				warmupIterations: 2,
			});
			expect(result.budgetFailures).toStrictEqual([]);
		},
		30_000,
	);
});
