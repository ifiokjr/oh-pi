import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createSuiteReport, runBenchmark, writeBenchmarkReport } from "../shared/benchmark";
import { createStartupBenchmarkSuite } from "./suite";

const benchmarkIt = process.env.OH_PI_RUN_BENCHMARKS === "1" ? it : it.skip;

describe("startup benchmark suite", () => {
	benchmarkIt(
		"stays within the committed startup performance budgets",
		async () => {
			const suite = await createStartupBenchmarkSuite();
			try {
				const results = [];
				for (const definition of suite.definitions) {
					results.push(await runBenchmark(definition));
				}

				const report = createSuiteReport("startup-benchmarks", results);
				const outputDir = path.resolve(
					process.cwd(),
					process.env.OH_PI_BENCH_OUTPUT_DIR ?? "coverage/benchmarks/startup",
				);
				await writeBenchmarkReport(report, outputDir);

				const failures = results.filter((result) => result.budgetFailures.length > 0);
				expect(failures.map((result) => `${result.label}: ${result.budgetFailures.join(", ")}`)).toEqual([]);
			} finally {
				await suite.cleanup();
			}
		},
		60_000,
	);
});
