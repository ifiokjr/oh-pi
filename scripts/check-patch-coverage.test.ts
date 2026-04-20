import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
	execFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	execFileSync: childProcessMocks.execFileSync,
}));

import {
	calculatePatchCoverage,
	formatPatchCoverageReport,
	getGitDiff,
	getIgnoredLinesForFile,
	isIgnoredLine,
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
			fs.rmSync(dir, { recursive: true, force: true });
		}
		tempDirs.length = 0;
	});

	it("parses cli arguments with defaults and overrides", () => {
		expect(parsePatchCoverageArgs([])).toMatchObject({ threshold: 100, lcovPath: "coverage/lcov.info" });
		expect(
			parsePatchCoverageArgs(["--threshold", "97.5", "--lcov", "tmp/lcov.info", "--base", "abc", "--head", "def"]),
		).toEqual({
			threshold: 97.5,
			lcovPath: "tmp/lcov.info",
			base: "abc",
			head: "def",
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

		expect(changed).toEqual(new Map([["packages/demo.ts", new Set([11, 12])]]));
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

		expect(summary).toMatchObject({ covered: 2, total: 3, pct: 66.66666666666666 });
		expect(summary.perFile).toEqual([
			{
				file: "packages/demo.ts",
				covered: 2,
				total: 3,
				pct: 66.66666666666666,
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

		expect(summary).toMatchObject({ covered: 1, total: 1, pct: 100 });
		expect(summary.perFile).toEqual([
			{
				file: "packages/demo.ts",
				covered: 1,
				total: 1,
				pct: 100,
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

		expect(summary.perFile.map((entry) => entry.file)).toEqual(["packages/b.ts", "packages/a.ts"]);
	});

	it("formats readable reports with and without uncovered files", () => {
		const failingReport = formatPatchCoverageReport(
			{
				covered: 19,
				total: 20,
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
			},
			100,
		);
		expect(failingReport).toContain("Patch coverage: 95.00% (19/20 changed executable lines covered)");
		expect(failingReport).toContain("Required threshold: 100.00%");
		expect(failingReport).toContain("packages/demo.ts: 42");

		const passingReport = formatPatchCoverageReport(
			{
				covered: 3,
				total: 3,
				pct: 100,
				perFile: [{ file: "packages/demo.ts", covered: 3, total: 3, pct: 100, uncoveredLines: [] }],
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

		expect(shouldIgnoreFileForPatchCoverage(ignored)).toBe(true);
		expect(shouldIgnoreFileForPatchCoverage(included)).toBe(false);
		expect(shouldIgnoreFileForPatchCoverage(path.join(dir, "missing.ts"))).toBe(false);
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

		expect(runPatchCoverageCheck({ base: "", head: "head", lcovPath: "coverage/lcov.info", threshold: 100 })).toEqual({
			skipped: true,
			pct: 100,
			covered: 0,
			total: 0,
			perFile: [],
		});
		expect(logSpy).toHaveBeenCalledWith("Skipping patch coverage check because BASE_SHA or HEAD_SHA is missing.");
	});

	it("skips files marked with file-level ignore directives when computing patch coverage", () => {
		const dir = createTempDir();
		const lcovPath = path.join(dir, "lcov.info");
		const ignoredFile = path.join(dir, "ignored.ts");
		fs.writeFileSync(ignoredFile, "/* c8 ignore file */\nexport const ignored = true;\n", "utf8");
		fs.writeFileSync(
			lcovPath,
			`TN:\nSF:${normalizeCoveragePath(ignoredFile)}\nDA:2,0\nend_of_record\n`,
			"utf8",
		);
		childProcessMocks.execFileSync.mockReturnValueOnce(
			`diff --git a/${normalizeCoveragePath(ignoredFile)} b/${normalizeCoveragePath(ignoredFile)}\n+++ b/${normalizeCoveragePath(ignoredFile)}\n@@ -1,0 +1,2 @@\n+/* c8 ignore file */\n+export const ignored = true;\n`,
		);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const summary = runPatchCoverageCheck({ base: "base", head: "head", lcovPath, threshold: 100 });

		expect(summary).toMatchObject({ covered: 0, total: 0, pct: 100 });
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

		expect(summary).toMatchObject({ covered: 0, total: 0, pct: 100 });
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

		expect(summary).toMatchObject({ covered: 1, total: 1, pct: 100 });
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Patch coverage: 100.00% (1/1 changed executable lines covered)"));
		expect(main(["--base", "base", "--head", "head", "--threshold", "100", "--lcov", lcovPath])).toMatchObject({
			covered: 1,
			total: 1,
			pct: 100,
		});
	});

	it("excludes lines marked with // patch-coverage-ignore from coverage", () => {
		const dir = createTempDir();
		const srcFile = path.join(dir, "example.ts");
		// Lines 10+ apart to avoid tolerance-based overlap
		const src = [
			"const a = 1; // patch-coverage-ignore",
			...Array(9).fill(""),
			"const b = 2; // patch-coverage-ignore",
		].join("\n");
		fs.writeFileSync(srcFile, src, "utf8");

		// Lines 1 and 11 have the comment, line 1 is covered
		const changed = new Map([["example.ts", new Set([1, 11])]]);
		const coverage = parseLcovByFile(`TN:\nSF:example.ts\nDA:1,1\nDA:11,0\nend_of_record\n`);
		const ignored = getIgnoredLinesForFile(srcFile);

		const summary = calculatePatchCoverage(changed, coverage, new Map([["example.ts", ignored]]));

		// Line 1 covered & excluded, line 11 uncovered & excluded → total 0, 100%
		expect(summary.pct).toBe(100);
	});

	it("returns empty set for nonexistent files in getIgnoredLinesForFile", () => {
		const ignored = getIgnoredLinesForFile("/nonexistent/path/file.ts");
		expect(ignored).toEqual(new Set());
	});

	it("excludes ignored lines even when they have zero coverage", () => {
		const dir = createTempDir();
		const srcFile = path.join(dir, "example.ts");
		// Lines 10+ apart to avoid tolerance-based overlap
		const src = ["const a = 1;", ...Array(8).fill(""), "const b = 2; // patch-coverage-ignore"].join("\n");
		fs.writeFileSync(srcFile, src, "utf8");

		const changed = new Map([["example.ts", new Set([1, 10])]]);
		const coverage = parseLcovByFile(`TN:\nSF:example.ts\nDA:1,1\nDA:10,0\nend_of_record\n`);
		const ignored = getIgnoredLinesForFile(srcFile);
		const summary = calculatePatchCoverage(changed, coverage, new Map([["example.ts", ignored]]));

		// Line 10 excluded (zero coverage), line 1 covered → 100%
		expect(summary).toMatchObject({ covered: 1, total: 1, pct: 100 });
		expect(summary.perFile[0]?.uncoveredLines).toEqual([]);
	});

	it("matches ignored lines within tolerance for source-map offsets", () => {
		// Comment at line 10, but V8 reports line 7 (3 lines off)
		const ignoredSet = new Set([10]);
		expect(isIgnoredLine(7, ignoredSet)).toBe(true); // |7-10| = 3 ≤ 3
		expect(isIgnoredLine(13, ignoredSet)).toBe(true); // |13-10| = 3 ≤ 3
		expect(isIgnoredLine(6, ignoredSet)).toBe(false); // |6-10| = 4 > 3
		expect(isIgnoredLine(14, ignoredSet)).toBe(false); // |14-10| = 4 > 3
		expect(isIgnoredLine(10, ignoredSet)).toBe(true); // exact match
		expect(isIgnoredLine(1, ignoredSet)).toBe(false); // |1-10| = 9 > 3
	});
});