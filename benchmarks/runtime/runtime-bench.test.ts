import { describe, expect, it, vi } from "vitest";
import { createRuntimeBenchmarkSuite } from "./suite";

const benchmarkIt = process.env.OH_PI_RUN_BENCHMARKS === "1" ? it : it.skip;

describe("runtime churn benchmark suite", () => {
	benchmarkIt(
		"captures mounted idle UI churn for the active extension set",
		async () => {
			vi.useFakeTimers();
			const suite = await createRuntimeBenchmarkSuite();
			try {
				expect(suite.report.results.length).toBeGreaterThan(0);
			} finally {
				await suite.cleanup();
				vi.useRealTimers();
			}
		},
		60_000,
	);
});
