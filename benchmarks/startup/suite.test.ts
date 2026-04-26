
import { parseBenchmarkEnvList } from "./suite";

describe("startup benchmark env parsing", () => {
	it("treats an unset filter as all benchmarks", () => {
		expect(parseBenchmarkEnvList()).toBeNull();
		expect(parseBenchmarkEnvList("all")).toBeNull();
	});

	it("treats an explicitly empty filter as no focused benchmarks", () => {
		expect(parseBenchmarkEnvList("")).toStrictEqual(new Set());
		expect(parseBenchmarkEnvList("   ")).toStrictEqual(new Set());
	});

	it("parses comma-separated benchmark ids", () => {
		expect(parseBenchmarkEnvList("scheduler-runtime-context-with-store, worktree-snapshot-temp-repo")).toStrictEqual(
			new Set(["scheduler-runtime-context-with-store", "worktree-snapshot-temp-repo"]),
		);
	});
});
