import fs from "node:fs";
import os from "node:os";
import path from "node:path";


const childProcessMocks = vi.hoisted(() => ({
	execFileSync: vi.fn(),
}));

vi.mock<typeof import('node:child_process')>(import('node:child_process'), () => ({
	execFileSync: childProcessMocks.execFileSync,
}));

import {
	calculatePatchCoverage,
	formatPatchCoverageReport,
	getGitDiff,
	main,
	normalizeCoveragePath,
	shouldIgnoreFileForPatchCoverage,
	parseChangedLinesFromDiff,
	parseLcovByFile,
	parsePatchCoverageArgs,
	runPatchCoverageCheck,
} from "./check-patch-coverage.ts";

const tempDirs: string[] = [];

function createTempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-pi-patch-coverage-"));
	tempDirs.push(dir);
	return dir;
}

describe("check-patch-coverage", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		childProcessMocks.execFileSync.mockReset();
	});

	afterEach(() => {
		for (const dir of tempDirs) {
			fs.rmSync(dir, { force: true, recursive: true });
		}
		tempDirs.length = 0;
	});

	it("parses cli arguments with defaults and overrides", () => {
		expect(parsePatchCoverageArgs([])).toMatchObject({ lcovPath: "coverage/lcov.info", threshold: 100 });
		expect(
			parsePatchCoverageArgs(["--threshold", "97.5", "--lcov", "tmp/lcov.info", "--base", "abc", "--head", "def"]),
		).toStrictEqual({
			base: "abc",
			head: "def",
			lcovPath: "tmp/lcov.info",
			threshold: 97.5,
		});
	});

	it("parses changed lines across additions, context, deletions, and removes empty file entries", () => {
		const changed = parseChangedLinesFromDiff(
			[
				"diff --git a/packages/demo.ts b/packages/demo.ts",
				"+++ b/packages/demo.ts",
				"@@ -10,1 +10,3 @@",
				" context line",
				"+const a = 1;",
				"-const removed = 1;",
				"+const b = 2;",
				"diff --git a/packages/empty.ts b/packages/empty.ts",
				"+++ b/packages/empty.ts",
			].join("\n"),
		);

		expect(changed).toStrictEqual(new Map([["packages/demo.ts", new Set([11, 12])]]));
	});

	it("throws on malformed diff hunks", () => {
		expect(() => parseChangedLinesFromDiff("+++ b/packages/demo.ts\n@@ malformed @@\n+const a = 1;\n")).toThrow(
			"Unable to parse diff hunk",
		);
	});

	it("maps covered and uncovered changed executable lines from diff hunks", () => {
		const coverage = parseLcovByFile(`TN:\nSF:packages/demo.ts\nDA:10,2\nDA:11,0\nDA:12,1\nend_of_record\n`);
		const changed = parseChangedLinesFromDiff(
			`diff --git a/packages/demo.ts b/packages/demo.ts\n+++ b/packages/demo.ts\n@@ -10,0 +10,3 @@\n+const a = 1;\n+const b = 2;\n+const c = 3;\n`,
		);
		const summary = calculatePatchCoverage(changed, coverage);

		expect(summary).toMatchObject({ covered: 2, pct: 66.66666666666666, total: 3 });
		expect(summary.perFile).toStrictEqual([
			{
				covered: 2,
				file: "packages/demo.ts",
				pct: 66.66666666666666,
				total: 3,
				uncoveredLines: [11],
			},
		]);
	});

	it("ignores missing coverage files and non-executable changed lines", () => {
		const changed = new Map([
			["packages/missing.ts", new Set([1])],
			["packages/demo.ts", new Set([19, 20, 21])],
		]);
		const coverage = parseLcovByFile(`TN:\nSF:packages/demo.ts\nDA:20,1\nend_of_record\n`);
		const summary = calculatePatchCoverage(changed, coverage);

		expect(summary).toMatchObject({ covered: 1, pct: 100, total: 1 });
		expect(summary.perFile).toStrictEqual([
			{
				covered: 1,
				file: "packages/demo.ts",
				pct: 100,
				total: 1,
				uncoveredLines: [],
			},
		]);
	});

	it("sorts uncovered files ahead of fully covered files", () => {
		const changed = new Map([
			["packages/b.ts", new Set([1, 2])],
			["packages/a.ts", new Set([1])],
		]);
		const coverage = parseLcovByFile(
			`TN:\nSF:packages/a.ts\nDA:1,1\nend_of_record\nTN:\nSF:packages/b.ts\nDA:1,1\nDA:2,0\nend_of_record\n`,
		);
		const summary = calculatePatchCoverage(changed, coverage);

		expect(summary.perFile.map((entry) => entry.file)).toStrictEqual(["packages/b.ts", "packages/a.ts"]);
	});

	it("formats readable reports with and without uncovered files", () => {
		const failingReport = formatPatchCoverageReport(
			{
				covered: 19,
				pct: 95,
				perFile: [
					{
						file: "packages/demo.ts",
						covered: 9,
						total: 10,
						pct: 90,
						uncoveredLines: [42],
					},
				],
				total: 20,
			},
			100,
		);
		expect(failingReport).toContain("Patch coverage: 95.00% (19/20 changed executable lines covered)");
		expect(failingReport).toContain("Required threshold: 100.00%");
		expect(failingReport).toContain("packages/demo.ts: 42");

		const passingReport = formatPatchCoverageReport(
			{
				covered: 3,
				pct: 100,
				perFile: [{ file: "packages/demo.ts", covered: 3, total: 3, pct: 100, uncoveredLines: [] }],
				total: 3,
			},
			100,
		);
		expect(passingReport).not.toContain("Uncovered changed lines:");
	});

	it("detects file-level coverage ignore directives", () => {
		const dir = createTempDir();
		const ignored = path.join(dir, "ignored.ts");
		const included = path.join(dir, "included.ts");
		fs.writeFileSync(ignored, "/* c8 ignore file */\nexport const ignored = true;\n", "utf8");
		fs.writeFileSync(included, "export const included = true;\n", "utf8");

		expect(shouldIgnoreFileForPatchCoverage(ignored)).toBeTruthy();
		expect(shouldIgnoreFileForPatchCoverage(included)).toBeFalsy();
		expect(shouldIgnoreFileForPatchCoverage(path.join(dir, "missing.ts"))).toBeFalsy();
	});

	it("normalizes coverage paths and delegates git diff lookup", () => {
		expect(normalizeCoveragePath(`./packages${path.sep}demo.ts`)).toBe("packages/demo.ts");

		childProcessMocks.execFileSync.mockReturnValueOnce("diff output");
		expect(getGitDiff("base", "head")).toBe("diff output");
		expect(childProcessMocks.execFileSync).toHaveBeenCalledWith(
			"git",
			["diff", "--unified=0", "--no-color", "base...head"],
			expect.objectContaining({ encoding: "utf8" }),
		);
	});

	it("skips patch coverage checks when base or head is missing", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		expect(runPatchCoverageCheck({ base: "", head: "head", lcovPath: "coverage/lcov.info", threshold: 100 })).toStrictEqual({
			covered: 0,
			pct: 100,
			perFile: [],
			skipped: true,
			total: 0,
		});
		expect(logSpy).toHaveBeenCalledWith("Skipping patch coverage check because BASE_SHA or HEAD_SHA is missing.");
	});

	it("skips files marked with file-level ignore directives when computing patch coverage", () => {
		const dir = createTempDir();
		const lcovPath = path.join(dir, "lcov.info");
		const ignoredFile = path.join(dir, "ignored.ts");
		fs.writeFileSync(ignoredFile, "/* c8 ignore file */\nexport const ignored = true;\n", "utf8");
		fs.writeFileSync(lcovPath, `TN:\nSF:${normalizeCoveragePath(ignoredFile)}\nDA:2,0\nend_of_record\n`, "utf8");
		childProcessMocks.execFileSync.mockReturnValueOnce(
			`diff --git a/${normalizeCoveragePath(ignoredFile)} b/${normalizeCoveragePath(ignoredFile)}\n+++ b/${normalizeCoveragePath(ignoredFile)}\n@@ -1,0 +1,2 @@\n+/* c8 ignore file */\n+export const ignored = true;\n`,
		);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const summary = runPatchCoverageCheck({ base: "base", head: "head", lcovPath, threshold: 100 });

		expect(summary).toMatchObject({ covered: 0, pct: 100, total: 0 });
		expect(logSpy).toHaveBeenCalledWith("Patch coverage: 100.00% (no changed executable lines found)");
	});

	it("reports 100% when no changed executable lines are found", () => {
		const dir = createTempDir();
		const lcovPath = path.join(dir, "lcov.info");
		fs.writeFileSync(lcovPath, `TN:\nSF:packages/demo.ts\nDA:20,1\nend_of_record\n`, "utf8");
		childProcessMocks.execFileSync.mockReturnValueOnce(
			"diff --git a/packages/demo.ts b/packages/demo.ts\n+++ b/packages/demo.ts\n@@ -1,0 +1,1 @@\n+// comment\n",
		);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const summary = runPatchCoverageCheck({ base: "base", head: "head", lcovPath, threshold: 100 });

		expect(summary).toMatchObject({ covered: 0, pct: 100, total: 0 });
		expect(logSpy).toHaveBeenCalledWith("Patch coverage: 100.00% (no changed executable lines found)");
	});

	it("prints reports and throws when patch coverage is below the threshold", () => {
		const dir = createTempDir();
		const lcovPath = path.join(dir, "lcov.info");
		fs.writeFileSync(lcovPath, `TN:\nSF:packages/demo.ts\nDA:10,1\nDA:11,0\nend_of_record\n`, "utf8");
		childProcessMocks.execFileSync.mockReturnValueOnce(
			"diff --git a/packages/demo.ts b/packages/demo.ts\n+++ b/packages/demo.ts\n@@ -10,0 +10,2 @@\n+const covered = true;\n+const uncovered = false;\n",
		);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		expect(() => runPatchCoverageCheck({ base: "base", head: "head", lcovPath, threshold: 100 })).toThrow(
			"Patch coverage 50.00% is below the required 100.00% threshold.",
		);
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Required threshold: 100.00%"));
	});

	it("validates threshold parsing through the exported main entry point", () => {
		expect(() => main(["--threshold", "NaN"])).toThrow("Invalid --threshold value: NaN");
	});

	it("returns the summary when patch coverage meets the threshold", () => {
		const dir = createTempDir();
		const lcovPath = path.join(dir, "lcov.info");
		fs.writeFileSync(lcovPath, `TN:\nSF:packages/demo.ts\nDA:10,1\nend_of_record\n`, "utf8");
		childProcessMocks.execFileSync
			.mockReturnValueOnce(
				"diff --git a/packages/demo.ts b/packages/demo.ts\n+++ b/packages/demo.ts\n@@ -10,0 +10,1 @@\n+const covered = true;\n",
			)
			.mockReturnValueOnce(
				"diff --git a/packages/demo.ts b/packages/demo.ts\n+++ b/packages/demo.ts\n@@ -10,0 +10,1 @@\n+const covered = true;\n",
			);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const summary = runPatchCoverageCheck({ base: "base", head: "head", lcovPath, threshold: 100 });

		expect(summary).toMatchObject({ covered: 1, pct: 100, total: 1 });
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining("Patch coverage: 100.00% (1/1 changed executable lines covered)"),
		);
		expect(main(["--base", "base", "--head", "head", "--threshold", "100", "--lcov", lcovPath])).toMatchObject({
			covered: 1,
			pct: 100,
			total: 1,
		});
	});

	it("excludes lines marked with // patch-coverage-ignore from uncovered counts", () => {
		const dir = createTempDir();
		const lcovPath = path.join(dir, "lcov.info");
		const srcFile = path.join(dir, "example.ts");
		// Write a source file with // patch-coverage-ignore on some lines
		fs.writeFileSync(srcFile, "const a = 1;\nconst b = 2; // patch-coverage-ignore\nconst c = 3;\n", "utf8");
		fs.writeFileSync(lcovPath, `TN:\nSF:${srcFile}\nDA:1,1\nDA:2,0\nDA:3,0\nend_of_record\n`, "utf8");
		childProcessMocks.execFileSync.mockReturnValueOnce(
			`diff --git a/${srcFile} b/${srcFile}\n+++ b/${srcFile}\n@@ -1,0 +1,3 @@\n+const a = 1;\n+const b = 2;\n+const c = 3;\n`,
		);

		const summary = runPatchCoverageCheck({ base: "base", head: "head", lcovPath, threshold: 100 });

		// Line 2 (0 coverage) should be excluded due to // patch-coverage-ignore
		expect(summary.perFile[0]?.uncoveredLines).not.toContain(2);
		expect(summary.pct).toBe(100);
	});
});
