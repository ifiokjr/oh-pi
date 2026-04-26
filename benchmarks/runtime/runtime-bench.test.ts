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

				const schedulerIdle = suite.report.results.find((result) => result.id === "extension-runtime-idle-scheduler");
				if (schedulerIdle) {
					expect(schedulerIdle).toMatchObject({
						footerRenderRequests: 0,
						notifications: 0,
						statusUpdates: 0,
						widgetRenderRequests: 0,
					});
				}

				const fullStackIdle = suite.report.results.find((result) => result.id === "full-stack-idle-ui");
				expect(fullStackIdle).toBeDefined();
			} finally {
				await suite.cleanup();
				vi.useRealTimers();
			}
		},
		60_000,
	);
});
