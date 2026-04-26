import { computeBenchmarkTargets } from "./select-targets";

describe("startup benchmark target selection", () => {
	it("targets worktree-focused hotspots and the worktree extension for worktree changes", async () => {
		const report = await computeBenchmarkTargets(["packages/extensions/extensions/worktree-shared.ts"]);

		expect(report.mode).toBe("selected");
		expect(report.selectedExtensions).toContain("worktree");
		expect(report.selectedFocusedBenchmarkIds).toStrictEqual([
			"custom-footer-first-render",
			"worktree-context-temp-repo",
			"worktree-snapshot-temp-repo",
		]);
	});

	it("targets scheduler-focused hotspots for scheduler changes", async () => {
		const report = await computeBenchmarkTargets(["packages/extensions/extensions/scheduler-registration.ts"]);

		expect(report.mode).toBe("selected");
		expect(report.selectedExtensions).toContain("scheduler");
		expect(report.selectedFocusedBenchmarkIds).toStrictEqual(["scheduler-runtime-context-with-store"]);
	});

	it("falls back to all benchmark targets for shared benchmark infrastructure changes", async () => {
		const report = await computeBenchmarkTargets(["benchmarks/startup/suite.ts"]);

		expect(report.mode).toBe("all");
		expect(report.selectedExtensions.length).toBeGreaterThan(5);
		expect(report.selectedFocusedBenchmarkIds).toStrictEqual([
			"scheduler-runtime-context-with-store",
			"custom-footer-usage-scan-large-history",
			"usage-tracker-session-start-near-threshold",
			"worktree-context-temp-repo",
			"worktree-snapshot-temp-repo",
			"custom-footer-first-render",
		]);
	});
});
