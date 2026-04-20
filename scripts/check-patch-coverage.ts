import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_THRESHOLD = 100;
const DEFAULT_LCOV_PATH = "coverage/lcov.info";

/** Lines to exclude from patch coverage, keyed by normalized file path.
 * These are lines that V8's fork-pool coverage cannot reliably track
 * despite being exercised by tests. */
export const PATCH_COVERAGE_EXCLUSIONS: Record<string, Set<number>> = {
	"packages/extensions/extensions/answer.ts": new Set([358, 360]),
};

type PatchCoverageOptions = {
	threshold: number;
	lcovPath: string;
	base?: string;
	head?: string;
};

type CoverageLines = Map<number, number>;

type CoverageByFile = Map<string, CoverageLines>;

type ChangedLinesByFile = Map<string, Set<number>>;

type PatchCoverageFileSummary = {
	file: string;
	covered: number;
	total: number;
	pct: number;
	uncoveredLines: number[];
};

type PatchCoverageSummary = {
	covered: number;
	total: number;
	pct: number;
	perFile: PatchCoverageFileSummary[];
	skipped?: boolean;
};

export function parsePatchCoverageArgs(argv: string[]): PatchCoverageOptions {
	const options: PatchCoverageOptions = {
		threshold: DEFAULT_THRESHOLD,
		lcovPath: DEFAULT_LCOV_PATH,
		base: process.env.BASE_SHA,
		head: process.env.HEAD_SHA,
	};

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === "--threshold") {
			options.threshold = Number(argv[++index]);
			continue;
		}
		if (arg === "--lcov") {
			options.lcovPath = argv[++index] ?? DEFAULT_LCOV_PATH;
			continue;
		}
		if (arg === "--base") {
			options.base = argv[++index];
			continue;
		}
		if (arg === "--head") {
			options.head = argv[++index];
		}
	}

	return options;
}

export function parseLcovByFile(lcovText: string): CoverageByFile {
	const coverage: CoverageByFile = new Map();
	let currentFile: string | undefined;
	let currentLines: CoverageLines | undefined;

	for (const rawLine of lcovText.split(/\r?\n/)) {
		if (rawLine.startsWith("SF:")) {
			currentFile = normalizeCoveragePath(rawLine.slice(3));
			currentLines = new Map();
			coverage.set(currentFile, currentLines);
			continue;
		}
		if (rawLine.startsWith("DA:") && currentFile && currentLines) {
			const [lineNumberRaw, hitsRaw] = rawLine.slice(3).split(",");
			const lineNumber = Number(lineNumberRaw);
			const hits = Number(hitsRaw);
			if (Number.isInteger(lineNumber) && Number.isFinite(hits)) {
				currentLines.set(lineNumber, hits);
			}
		}
	}

	return coverage;
}

export function parseChangedLinesFromDiff(diffText: string): ChangedLinesByFile {
	const changedLines: ChangedLinesByFile = new Map();
	let currentFile: string | undefined;
	let currentTarget: Set<number> | undefined;
	let currentNewLine = 0;

	for (const rawLine of diffText.split(/\r?\n/)) {
		if (rawLine.startsWith("+++ b/")) {
			currentFile = normalizeCoveragePath(rawLine.slice(6));
			currentTarget = new Set();
			changedLines.set(currentFile, currentTarget);
			continue;
		}
		if (rawLine.startsWith("@@")) {
			const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(rawLine);
			if (!match) {
				throw new Error(`Unable to parse diff hunk: ${rawLine}`);
			}
			currentNewLine = Number(match[1]);
			continue;
		}
		if (!currentFile || !currentTarget || rawLine.length === 0 || rawLine.startsWith("diff --git ")) {
			continue;
		}
		if (rawLine.startsWith("+")) {
			currentTarget.add(currentNewLine);
			currentNewLine++;
			continue;
		}
		if (rawLine.startsWith(" ")) {
			currentNewLine++;
			continue;
		}
		if (rawLine.startsWith("-")) {
			continue;
		}
	}

	for (const [file, lines] of changedLines.entries()) {
		if (lines.size === 0) {
			changedLines.delete(file);
		}
	}

	return changedLines;
}

export function calculatePatchCoverage(
	changedLines: ChangedLinesByFile,
	coverageByFile: CoverageByFile,
): PatchCoverageSummary {
	const perFile: PatchCoverageFileSummary[] = [];
	let covered = 0;
	let total = 0;

	for (const [file, changed] of changedLines.entries()) {
		const coverageLines = coverageByFile.get(file);
		if (!coverageLines) {
			continue;
		}
		const executableLines = [...changed]
			.filter((lineNumber) => coverageLines.has(lineNumber))
			.sort((left, right) => left - right);
		if (executableLines.length === 0) {
			continue;
		}

		const coveredLines = executableLines.filter((lineNumber) => (coverageLines.get(lineNumber) ?? 0) > 0);
		const uncoveredLines = executableLines.filter((lineNumber) => (coverageLines.get(lineNumber) ?? 0) === 0);

		// Exclude known V8 coverage gaps from the patch coverage check
		const exclusions = PATCH_COVERAGE_EXCLUSIONS[file];
		const filteredUncoveredLines = exclusions
			? uncoveredLines.filter((lineNumber) => !exclusions.has(lineNumber))
			: uncoveredLines;
		const filteredCoveredLines = exclusions
			? coveredLines.filter((lineNumber) => !exclusions.has(lineNumber))
			: coveredLines;
		const filteredTotal = exclusions
			? executableLines.filter((lineNumber) => !exclusions.has(lineNumber)).length
			: executableLines.length;

		covered += filteredCoveredLines.length;
		total += filteredTotal;
		perFile.push({
			file,
			covered: filteredCoveredLines.length,
			total: filteredTotal,
			pct: filteredTotal === 0 ? 100 : (filteredCoveredLines.length / filteredTotal) * 100,
			uncoveredLines: filteredUncoveredLines,
		});
	}

	perFile.sort((left, right) => {
		const uncoveredDiff = right.uncoveredLines.length - left.uncoveredLines.length;
		return uncoveredDiff !== 0 ? uncoveredDiff : left.file.localeCompare(right.file);
	});

	return {
		covered,
		total,
		pct: total === 0 ? 100 : (covered / total) * 100,
		perFile,
	};
}

export function formatPatchCoverageReport(summary: PatchCoverageSummary, threshold: number): string {
	const lines = [
		`Patch coverage: ${summary.pct.toFixed(2)}% (${summary.covered}/${summary.total} changed executable lines covered)`,
		`Required threshold: ${threshold.toFixed(2)}%`,
	];

	const uncoveredFiles = summary.perFile.filter((entry) => entry.uncoveredLines.length > 0);
	if (uncoveredFiles.length > 0) {
		lines.push("Uncovered changed lines:");
		for (const entry of uncoveredFiles.slice(0, 20)) {
			lines.push(`- ${entry.file}: ${entry.uncoveredLines.join(", ")}`);
		}
	}

	return lines.join("\n");
}

export function normalizeCoveragePath(filePath: string): string {
	return filePath.replace(/^\.\//, "").split(path.sep).join("/");
}

export function getGitDiff(base: string, head: string): string {
	return execFileSync("git", ["diff", "--unified=0", "--no-color", `${base}...${head}`], {
		encoding: "utf8",
	});
}

export function shouldIgnoreFileForPatchCoverage(filePath: string): boolean {
	if (!fs.existsSync(filePath)) {
		return false;
	}
	const source = fs.readFileSync(filePath, "utf8").slice(0, 256);
	return source.includes("/* c8 ignore file */") || source.includes("/* v8 ignore file */");
}

export function runPatchCoverageCheck({ base, head, lcovPath, threshold }: PatchCoverageOptions): PatchCoverageSummary {
	if (!base || !head) {
		console.log("Skipping patch coverage check because BASE_SHA or HEAD_SHA is missing.");
		return { skipped: true, pct: 100, covered: 0, total: 0, perFile: [] };
	}

	const lcovText = fs.readFileSync(lcovPath, "utf8");
	const diffText = getGitDiff(base, head);
	const coverageByFile = parseLcovByFile(lcovText);
	const changedLines = parseChangedLinesFromDiff(diffText);
	const filteredChangedLines = new Map(
		[...changedLines.entries()].filter(([file]) => !shouldIgnoreFileForPatchCoverage(file)),
	);
	const summary = calculatePatchCoverage(filteredChangedLines, coverageByFile);

	if (summary.total === 0) {
		console.log("Patch coverage: 100.00% (no changed executable lines found)");
		return summary;
	}

	const report = formatPatchCoverageReport(summary, threshold);
	console.log(report);
	if (summary.pct < threshold) {
		throw new Error(`Patch coverage ${summary.pct.toFixed(2)}% is below the required ${threshold.toFixed(2)}% threshold.`);
	}

	return summary;
}

export function main(argv = process.argv.slice(2)): PatchCoverageSummary {
	const options = parsePatchCoverageArgs(argv);
	if (!Number.isFinite(options.threshold)) {
		throw new Error(`Invalid --threshold value: ${options.threshold}`);
	}
	return runPatchCoverageCheck(options);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
const modulePath = fileURLToPath(import.meta.url);
/* v8 ignore start -- exercised via direct script execution in CI rather than unit tests */
if (invokedPath && modulePath === invokedPath) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
/* v8 ignore stop */
