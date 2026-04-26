import { describe, expect, it, vi } from "vitest";
import { runBenchmark } from "./benchmark";

describe("benchmark helper", () => {
	it("batches fast samples until the sample floor is reached", async () => {
		vi.useFakeTimers();
		try {
			const run = vi.fn(async () => {
				await vi.advanceTimersByTimeAsync(1);
			});

			const result = await runBenchmark({
				id: "batched-fast-sample",
				label: "batched fast sample",
				group: "unit",
				iterations: 4,
				warmupIterations: 0,
				minSampleTimeMs: 5,
				run,
			});

			expect(result.minSampleTimeMs).toBe(5);
			expect(result.avgLoopsPerSample).toBeGreaterThanOrEqual(5);
			expect(run.mock.calls.length).toBeGreaterThanOrEqual(20);
		} finally {
			vi.useRealTimers();
		}
	});
});
