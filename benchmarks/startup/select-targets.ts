import * as fs from "node:fs/promises";
import * as path from "node:path";

type Manifest = {
	pi?: {
		extensions?: string[];
	};
};

type BenchmarkTargetReport = {
	mode: "all" | "selected";
	selectedExtensions: string[];
	reasons: string[];
	changedFiles: string[];
};

const ROOT = process.cwd();
const PACKAGE_PATH = path.join(ROOT, "package.json");
const EXTENSION_PACKAGE_PREFIX = "packages/extensions/extensions/";
const GLOBAL_PATH_PREFIXES = [
	"package.json",
	"pnpm-lock.yaml",
	"vitest.config.ts",
	"biome.json",
	"test-utils/",
	"packages/core/",
	"packages/providers/",
	"benchmarks/",
];

function toPosix(value: string): string {
	return value.split(path.sep).join("/");
}

function extensionIdFromEntry(entry: string): string {
	const normalized = toPosix(entry);
	const fileName = normalized.split("/").at(-1) ?? normalized;
	if (fileName === "index.ts") {
		return normalized.split("/").at(-2) ?? "unknown";
	}
	return fileName.replace(/\.ts$/, "");
}

function getPackageExtensionIds(entries: string[]): string[] {
	return entries
		.filter((entry) => toPosix(entry).startsWith(EXTENSION_PACKAGE_PREFIX))
		.map((entry) => extensionIdFromEntry(entry));
}

function impactsAllExtensions(filePath: string): boolean {
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

export async function computeBenchmarkTargets(changedFiles: string[]): Promise<BenchmarkTargetReport> {
	const manifest = JSON.parse(await fs.readFile(PACKAGE_PATH, "utf-8")) as Manifest;
	const entries = (manifest.pi?.extensions ?? []).map((entry) => toPosix(entry).replace(/^\.\//, ""));
	const packageExtensionIds = getPackageExtensionIds(entries);
	const selected = new Set<string>();
	const reasons: string[] = [];
	let mode: BenchmarkTargetReport["mode"] = "selected";

	for (const filePath of changedFiles.map(toPosix)) {
		if (impactsAllExtensions(filePath)) {
			mode = "all";
			reasons.push(`${filePath} affects shared benchmark/runtime infrastructure`);
			continue;
		}

		for (const extensionId of inferImpactedExtensions(filePath, entries, packageExtensionIds)) {
			selected.add(extensionId);
			reasons.push(`${filePath} impacts ${extensionId}`);
		}
	}

	const selectedExtensions =
		mode === "all" ? Array.from(new Set(entries.map(extensionIdFromEntry))).sort() : [...selected].sort();
	return {
		mode,
		selectedExtensions,
		reasons: Array.from(new Set(reasons)),
		changedFiles: changedFiles.map(toPosix),
	};
}

async function main() {
	const changedFilesArg = process.argv[2];
	if (!changedFilesArg) {
		throw new Error("Pass a newline-delimited changed-files path as the first argument.");
	}

	const changedFiles = (await fs.readFile(path.resolve(changedFilesArg), "utf-8"))
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
