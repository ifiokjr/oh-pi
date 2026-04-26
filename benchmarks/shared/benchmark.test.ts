
import { runBenchmark } from "./benchmark";

describe("benchmark helper", () => {
	it("batches fast samples until the sample floor is reached", async () => {
		vi.useFakeTimers();
		try {
			const run = vi.fn(async () => {
				await vi.advanceTimersByTimeAsync(1);
			});

			const result = await runBenchmark({
				group: "unit",
				id: "batched-fast-sample",
				iterations: 4,
				label: "batched fast sample",
				minSampleTimeMs: 5,
				run,
				warmupIterations: 0,
			});

			expect(result.minSampleTimeMs).toBe(5);
			expect(result.avgLoopsPerSample).toBeGreaterThanOrEqual(5);
			expect(run.mock.calls.length).toBeGreaterThanOrEqual(20);
		} finally {
			vi.useRealTimers();
		}
	});
});
