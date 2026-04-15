#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { SWITCHER_PACKAGES } from "../packages/oh-pi/bin/package-list.mjs";

const IS_WINDOWS = process.platform === "win32";

type Mode = "local" | "remote" | "status";
type PackageSetting = string | ({ source: string } & Record<string, unknown>);

type SettingsFile = {
	packages?: PackageSetting[];
	[key: string]: unknown;
};

type Options = {
	mode: Mode;
	repoPath: string;
	version?: string;
	piLocal: boolean;
	dryRun: boolean;
};

type Change = {
	packageName: string;
	currentSource?: string;
	nextSource: string;
};

export function parseNpmPackageName(source: string): string | undefined {
	if (!source.startsWith("npm:")) {
		return undefined;
	}

	const specifier = source.slice(4);
	if (!specifier) {
		return undefined;
	}

	if (specifier.startsWith("@")) {
		const slashIndex = specifier.indexOf("/");
		if (slashIndex === -1) {
			return undefined;
		}
		const versionIndex = specifier.indexOf("@", slashIndex + 1);
		return versionIndex === -1 ? specifier : specifier.slice(0, versionIndex);
	}

	const versionIndex = specifier.indexOf("@");
	return versionIndex === -1 ? specifier : specifier.slice(0, versionIndex);
}

function readJsonFile<T>(filePath: string): T | undefined {
	if (!existsSync(filePath)) {
		return undefined;
	}

	return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function getPackageSource(entry: unknown): string | undefined {
	if (typeof entry === "string") {
		return entry;
	}
	if (entry && typeof entry === "object" && "source" in entry && typeof entry.source === "string") {
		return entry.source;
	}
	return undefined;
}

function withPackageSource(entry: PackageSetting, source: string): PackageSetting {
	return typeof entry === "string" ? source : { ...entry, source };
}

function resolvePathPackageName(source: string, sourceBaseDir: string): string | undefined {
	if (
		source.startsWith("git:") ||
		source.startsWith("http://") ||
		source.startsWith("https://") ||
		source.startsWith("ssh://")
	) {
		return undefined;
	}

	const resolvedSource = path.resolve(sourceBaseDir, source);
	const pkgJsonPath = path.join(resolvedSource, "package.json");
	const pkgJson = readJsonFile<{ name?: unknown }>(pkgJsonPath);
	return typeof pkgJson?.name === "string" ? pkgJson.name : undefined;
}

export function resolveManagedPackageNameFromSource(source: string, sourceBaseDir: string): string | undefined {
	return parseNpmPackageName(source) ?? resolvePathPackageName(source, sourceBaseDir);
}

export function resolveWorkspacePackageSources(repoPath: string, packageNames: readonly string[]): Map<string, string> {
	const packagesDir = path.join(repoPath, "packages");
	const workspacePackages = new Map<string, string>();

	for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			continue;
		}

		const packageDir = path.join(packagesDir, entry.name);
		const pkgJson = readJsonFile<{ name?: unknown }>(path.join(packageDir, "package.json"));
		if (typeof pkgJson?.name === "string") {
			workspacePackages.set(pkgJson.name, packageDir);
		}
	}

	const missingPackages: string[] = [];
	const resolvedSources = new Map<string, string>();
	for (const packageName of packageNames) {
		const packageDir = workspacePackages.get(packageName);
		if (!packageDir) {
			missingPackages.push(packageName);
			continue;
		}
		resolvedSources.set(packageName, path.resolve(packageDir));
	}

	if (missingPackages.length > 0) {
		throw new Error(`Could not find workspace packages under ${packagesDir}: ${missingPackages.join(", ")}`);
	}

	return resolvedSources;
}

export function dedupeManagedPackageEntries(
	entries: PackageSetting[],
	resolvePackageName: (source: string) => string | undefined,
): PackageSetting[] {
	const choiceByPackage = new Map<string, { index: number; entry: PackageSetting }>();

	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index];
		const source = getPackageSource(entry);
		if (!source) {
			continue;
		}

		const packageName = resolvePackageName(source);
		if (!packageName || !SWITCHER_PACKAGES.includes(packageName)) {
			continue;
		}

		const current = choiceByPackage.get(packageName);
		if (!current) {
			choiceByPackage.set(packageName, { index, entry });
			continue;
		}

		if (typeof entry === "object" && typeof current.entry !== "object") {
			choiceByPackage.set(packageName, { index, entry });
			continue;
		}

		if (typeof entry === "object" && typeof current.entry === "object") {
			choiceByPackage.set(packageName, { index, entry });
			continue;
		}

		if (typeof entry !== "object" && typeof current.entry !== "object") {
			choiceByPackage.set(packageName, { index, entry });
		}
	}

	return entries.filter((entry, index) => {
		const source = getPackageSource(entry);
		if (!source) {
			return true;
		}

		const packageName = resolvePackageName(source);
		if (!packageName || !SWITCHER_PACKAGES.includes(packageName)) {
			return true;
		}

		return choiceByPackage.get(packageName)?.index === index;
	});
}

export function rewriteManagedPackageSources(
	entries: PackageSetting[],
	desiredSources: ReadonlyMap<string, string>,
	resolvePackageName: (source: string) => string | undefined,
): PackageSetting[] {
	const remainingPackages = new Set(desiredSources.keys());
	const rewrittenEntries = entries.map((entry) => {
		const currentSource = getPackageSource(entry);
		if (!currentSource) {
			return entry;
		}

		const packageName = resolvePackageName(currentSource);
		if (!packageName) {
			return entry;
		}

		const nextSource = desiredSources.get(packageName);
		if (!nextSource) {
			return entry;
		}

		remainingPackages.delete(packageName);
		return currentSource === nextSource ? entry : withPackageSource(entry, nextSource);
	});

	for (const packageName of SWITCHER_PACKAGES) {
		if (!remainingPackages.has(packageName)) {
			continue;
		}
		const source = desiredSources.get(packageName);
		if (source) {
			rewrittenEntries.push(source);
		}
	}

	return dedupeManagedPackageEntries(rewrittenEntries, resolvePackageName);
}

function parseArgs(argv: string[]): Options {
	const args = argv.slice(2);
	const modeArg = args.shift();

	if (modeArg === "--help" || modeArg === "-h") {
		printHelp();
		process.exit(0);
	}

	if (modeArg !== "local" && modeArg !== "remote" && modeArg !== "status") {
		console.error("Error: first argument must be one of: local, remote, status");
		printHelp();
		process.exit(1);
	}

	const options: Options = {
		mode: modeArg,
		repoPath: process.cwd(),
		piLocal: false,
		dryRun: false,
	};

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--") {
			continue;
		}
		if (arg === "--path") {
			const value = args[++index];
			if (!value) {
				throw new Error("--path requires a value");
			}
			options.repoPath = value;
			continue;
		}
		if (arg === "--version" || arg === "-v") {
			const value = args[++index];
			if (!value) {
				throw new Error("--version requires a value");
			}
			options.version = value;
			continue;
		}
		if (arg === "--pi-local" || arg === "-l") {
			options.piLocal = true;
			continue;
		}
		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			printHelp();
			process.exit(0);
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	options.repoPath = path.resolve(options.repoPath);
	return options;
}

function printHelp() {
	console.log(`
oh-pi source switcher — toggle pi between local workspace packages and published npm packages

Usage:
  pnpm pi:switch local [--path <repo>] [--pi-local] [--dry-run]
  pnpm pi:switch remote [--version <ver>] [--pi-local] [--dry-run]
  pnpm pi:switch status [--pi-local]

Options:
  --path <repo>       Repo checkout to use for local package paths (default: current directory)
  -v, --version <v>  Pin remote installs to a published version
  -l, --pi-local     Write to project .pi/settings.json instead of user settings
  --dry-run          Show the changes without writing settings or running pi update
  -h, --help         Show this help

Examples:
  pnpm pi:local
  pnpm pi:local -- --path /tmp/oh-pi-branch
  pnpm pi:published
  pnpm pi:switch remote -- --version 0.4.4
  pnpm pi:switch local -- --pi-local

Notes:
  - local/remote mode also manages the experimental provider packages
  - fully restart pi after switching; /reload can keep old package modules alive
`.trim());
}

function findPi(): string {
	const candidates = IS_WINDOWS ? ["pi.cmd", "pi"] : ["pi"];
	for (const candidate of candidates) {
		try {
			execFileSync(candidate, ["--version"], { stdio: "ignore", shell: IS_WINDOWS });
			return candidate;
		} catch {
			// Try the next candidate.
		}
	}

	throw new Error("'pi' command not found. Install pi-coding-agent first: npm install -g @mariozechner/pi-coding-agent");
}

function getSettingsPath(piLocal: boolean): string {
	if (piLocal) {
		return path.join(process.cwd(), ".pi", "settings.json");
	}

	const agentDir = process.env.PI_CODING_AGENT_DIR ?? path.join(homedir(), ".pi", "agent");
	return path.join(agentDir, "settings.json");
}

function getSettingsSourceBaseDir(settingsPath: string, piLocal: boolean): string {
	return piLocal ? path.dirname(path.dirname(settingsPath)) : process.cwd();
}

function loadSettings(settingsPath: string): SettingsFile {
	return readJsonFile<SettingsFile>(settingsPath) ?? {};
}

function collectManagedPackageSources(
	entries: PackageSetting[],
	resolvePackageName: (source: string) => string | undefined,
): Map<string, string> {
	const currentSources = new Map<string, string>();
	for (const entry of entries) {
		const source = getPackageSource(entry);
		if (!source) {
			continue;
		}

		const packageName = resolvePackageName(source);
		if (!packageName || !SWITCHER_PACKAGES.includes(packageName)) {
			continue;
		}

		currentSources.set(packageName, source);
	}
	return currentSources;
}

function buildDesiredSources(options: Options): Map<string, string> {
	if (options.mode === "remote") {
		const suffix = options.version ? `@${options.version}` : "";
		return new Map(SWITCHER_PACKAGES.map((packageName) => [packageName, `npm:${packageName}${suffix}`]));
	}

	if (options.mode === "local") {
		return resolveWorkspacePackageSources(options.repoPath, SWITCHER_PACKAGES);
	}

	throw new Error(`Unsupported mode: ${options.mode}`);
}

function describeChanges(currentSources: ReadonlyMap<string, string>, desiredSources: ReadonlyMap<string, string>): Change[] {
	return SWITCHER_PACKAGES.map((packageName) => ({
		packageName,
		currentSource: currentSources.get(packageName),
		nextSource: desiredSources.get(packageName) ?? "",
	}));
}

function writeSettings(settingsPath: string, settings: SettingsFile) {
	mkdirSync(path.dirname(settingsPath), { recursive: true });
	writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

function printChangeSummary(mode: Mode, changes: readonly Change[], settingsPath: string, repoPath: string, piLocal: boolean) {
	const scope = piLocal ? "project" : "user";
	console.log(`\nSwitching oh-pi packages to ${mode} mode (${scope} settings)`);
	console.log(`Settings: ${settingsPath}`);
	if (mode === "local") {
		console.log(`Repo: ${repoPath}`);
	}
	console.log("");
	for (const change of changes) {
		const currentSource = change.currentSource ?? "<missing>";
		console.log(`  ${change.packageName}`);
		console.log(`    ${currentSource}`);
		console.log(`    -> ${change.nextSource}`);
	}
}

function printStatus(currentSources: ReadonlyMap<string, string>, settingsPath: string, piLocal: boolean) {
	const scope = piLocal ? "project" : "user";
	console.log(`\noh-pi managed package sources (${scope} settings)`);
	console.log(`Settings: ${settingsPath}`);
	console.log("");
	for (const packageName of SWITCHER_PACKAGES) {
		console.log(`  ${packageName}`);
		console.log(`    ${currentSources.get(packageName) ?? "<not configured>"}`);
	}
}

function updatePiSources(pi: string, desiredSources: ReadonlyMap<string, string>) {
	let failures = 0;
	console.log("\nUpdating packages with pi...\n");
	for (const packageName of SWITCHER_PACKAGES) {
		const source = desiredSources.get(packageName);
		if (!source) {
			continue;
		}

		process.stdout.write(`  ${packageName} ... `);
		try {
			execFileSync(pi, ["update", source], { stdio: "pipe", timeout: 120_000, shell: IS_WINDOWS });
			console.log("✓");
		} catch (error) {
			console.log("✗");
			const stderr = error instanceof Error && "stderr" in error ? String(error.stderr ?? "").trim() : "";
			if (stderr) {
				console.error(`    ${stderr.split("\n")[0]}`);
			}
			failures++;
		}
	}

	if (failures > 0) {
		throw new Error(`${failures} package(s) failed to update`);
	}
}

function main() {
	const options = parseArgs(process.argv);
	const settingsPath = getSettingsPath(options.piLocal);
	const settings = loadSettings(settingsPath);
	const currentEntries = Array.isArray(settings.packages) ? settings.packages : [];
	const sourceBaseDir = getSettingsSourceBaseDir(settingsPath, options.piLocal);
	const resolvePackageName = (source: string) => resolveManagedPackageNameFromSource(source, sourceBaseDir);
	const currentSources = collectManagedPackageSources(currentEntries, resolvePackageName);

	if (options.mode === "status") {
		printStatus(currentSources, settingsPath, options.piLocal);
		return;
	}

	const desiredSources = buildDesiredSources(options);
	const nextEntries = rewriteManagedPackageSources(currentEntries, desiredSources, resolvePackageName);
	const changes = describeChanges(currentSources, desiredSources);
	printChangeSummary(options.mode, changes, settingsPath, options.repoPath, options.piLocal);

	const nextSettings: SettingsFile = { ...settings, packages: nextEntries };
	if (options.dryRun) {
		console.log("\nDry run only — settings were not written and pi update was not run.");
		console.log("When you apply this switch, fully restart pi; /reload can keep old package modules alive.");
		return;
	}

	writeSettings(settingsPath, nextSettings);
	const pi = findPi();
	updatePiSources(pi, desiredSources);
	console.log("\n✅ Done. Fully restart pi to reload the switched packages.");
	console.log("⚠️  Avoid /reload after switching sources; it can keep previously loaded package modules alive.");
}

const currentFilePath = realpathSync(fileURLToPath(import.meta.url));
const invokedPath = process.argv[1] ? realpathSync(path.resolve(process.argv[1])) : undefined;
if (invokedPath && invokedPath === currentFilePath) {
	try {
		main();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`\nError: ${message}`);
		process.exit(1);
	}
}
