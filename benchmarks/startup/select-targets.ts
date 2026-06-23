import * as fs from "node:fs/promises";
import * as path from "node:path";

interface Manifest {
	pi?: {
		extensions?: string[];
	};
}

export interface BenchmarkTargetReport {
	mode: "all" | "selected";
	selectedExtensions: string[];
	selectedFocusedBenchmarkIds: string[];
	reasons: string[];
	changedFiles: string[];
}

const ROOT = process.cwd();
const PACKAGE_PATH = path.join(ROOT, "package.json");
const EXTENSION_PACKAGE_PREFIX = "packages/monopi__extension-";
const ALL_FOCUSED_BENCHMARK_IDS = [
	"scheduler-runtime-context-with-store",
	"custom-footer-usage-scan-large-history",
	"usage-tracker-session-start-near-threshold",
	"worktree-context-temp-repo",
	"worktree-snapshot-temp-repo",
	"custom-footer-first-render",
] as const;
const GLOBAL_PATH_PREFIXES = [
	"package.json",
	"pnpm-lock.yaml",
	"vitest.config.ts",
	"biome.json",
	"test-utils/",
	"packages/monopi__core/",
	"packages/monopi__provider-catalog/",
	"benchmarks/",
	".github/workflows/ci.yml",
] as const;
const FOCUSED_BENCHMARK_RULES = [
	{
		benchmarkIds: ["scheduler-runtime-context-with-store"],
		prefixes: [
			"packages/monopi__extension-scheduler/index.ts",
			"packages/monopi__extension-scheduler/scheduler-shared.ts",
			"packages/monopi__extension-scheduler/scheduler-registration.ts",
		],
	},
	{
		benchmarkIds: [
			"custom-footer-usage-scan-large-history",
			"custom-footer-first-render",
			"worktree-context-temp-repo",
		],
		prefixes: [
			"packages/monopi__extension-custom-footer/index.ts",
			"packages/monopi__extension-custom-footer/tests/custom-footer.test.ts",
		],
	},
	{
		benchmarkIds: ["usage-tracker-session-start-near-threshold"],
		prefixes: [
			"packages/monopi__extension-usage-tracker/index.ts",
			"packages/monopi__extension-usage-tracker/tests/usage-tracker.test.ts",
		],
	},
	{
		benchmarkIds: ["worktree-context-temp-repo", "worktree-snapshot-temp-repo", "custom-footer-first-render"],
		prefixes: [
			"packages/monopi__extension-worktree/index.ts",
			"packages/monopi__extension-worktree/tests/worktree.test.ts",
			"packages/monopi__extension-shared/worktree-shared.ts",
			"packages/monopi__extension-shared/tests/worktree-shared.test.ts",
		],
	},
] as const;

function toPosix(value: string): string {
	return value.split(path.sep).join("/");
}

function extensionIdFromEntry(entry: string): string {
	const normalized = toPosix(entry);
	const fileName = normalized.split("/").at(-1) ?? normalized;
	const rawId = fileName === "index.ts" ? (normalized.split("/").at(-2) ?? "unknown") : fileName.replace(/\.ts$/, "");
	return rawId.replace(/^monopi__extension-/, "");
}

function getPackageExtensionIds(entries: string[]): string[] {
	return entries
		.filter((entry) => toPosix(entry).startsWith(EXTENSION_PACKAGE_PREFIX))
		.map((entry) => extensionIdFromEntry(entry));
}

function impactsAllBenchmarks(filePath: string): boolean {
	return GLOBAL_PATH_PREFIXES.some((prefix) => filePath === prefix || filePath.startsWith(prefix));
}

function inferImpactedExtensions(filePath: string, entries: string[], packageExtensionIds: string[]): string[] {
	for (const entry of entries) {
		const normalizedEntry = toPosix(entry).replace(/^\.\//, "");
		const entryId = extensionIdFromEntry(normalizedEntry);
		if (filePath === normalizedEntry || filePath.startsWith(`${normalizedEntry.replace(/\.ts$/, "")}`)) {
			return [entryId];
		}

		if (normalizedEntry.endsWith("/index.ts")) {
			const entryDir = normalizedEntry.slice(0, -"index.ts".length);
			if (filePath.startsWith(entryDir)) {
				return [entryId];
			}
		}
	}

	if (filePath.startsWith(EXTENSION_PACKAGE_PREFIX)) {
		return packageExtensionIds;
	}

	return [];
}

function inferFocusedBenchmarkIds(filePath: string): string[] {
	for (const rule of FOCUSED_BENCHMARK_RULES) {
		if (rule.prefixes.some((prefix) => filePath === prefix || filePath.startsWith(prefix))) {
			return [...rule.benchmarkIds];
		}
	}

	return [];
}

export async function computeBenchmarkTargets(changedFiles: string[]): Promise<BenchmarkTargetReport> {
	const manifest = JSON.parse(await fs.readFile(PACKAGE_PATH, "utf8")) as Manifest;
	const entries = (manifest.pi?.extensions ?? []).map((entry) => toPosix(entry).replace(/^\.\//, ""));
	const packageExtensionIds = getPackageExtensionIds(entries);
	const selectedExtensions = new Set<string>();
	const selectedFocusedBenchmarkIds = new Set<string>();
	const reasons: string[] = [];
	let mode: BenchmarkTargetReport["mode"] = "selected";

	for (const filePath of changedFiles.map(toPosix)) {
		if (impactsAllBenchmarks(filePath)) {
			mode = "all";
			reasons.push(`${filePath} affects shared benchmark/runtime infrastructure`);
			continue;
		}

		for (const extensionId of inferImpactedExtensions(filePath, entries, packageExtensionIds)) {
			selectedExtensions.add(extensionId);
			reasons.push(`${filePath} impacts ${extensionId}`);
		}

		for (const benchmarkId of inferFocusedBenchmarkIds(filePath)) {
			selectedFocusedBenchmarkIds.add(benchmarkId);
			reasons.push(`${filePath} targets ${benchmarkId}`);
		}
	}

	return {
		changedFiles: changedFiles.map(toPosix),
		mode,
		reasons: Array.from(new Set(reasons)),
		selectedExtensions:
			mode === "all" ? Array.from(new Set(entries.map(extensionIdFromEntry))).sort() : [...selectedExtensions].sort(),
		selectedFocusedBenchmarkIds:
			mode === "all" ? [...ALL_FOCUSED_BENCHMARK_IDS] : [...selectedFocusedBenchmarkIds].sort(),
	};
}

async function main() {
	const changedFilesArg = process.argv[2];
	if (!changedFilesArg) {
		throw new Error("Pass a newline-delimited changed-files path as the first argument.");
	}

	const changedFiles = (await fs.readFile(path.resolve(changedFilesArg), "utf8"))
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	const report = await computeBenchmarkTargets(changedFiles);
	process.stdout.write(`${JSON.stringify(report, null, "\t")}\n`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("select-targets.ts")) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
