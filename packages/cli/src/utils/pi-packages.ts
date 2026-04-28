import { resolvePiAgentDir } from "@ifi/oh-pi-core";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const IS_WINDOWS = process.platform === "win32";

type PackageSetting = string | ({ source: string } & Record<string, unknown>);

interface SettingsFile {
	packages?: PackageSetting[];
	[key: string]: unknown;
}

type ExecFileRunner = (
	file: string,
	args: string[],
	options: {
		stdio: "pipe";
		timeout: number;
		shell?: boolean;
	},
) => unknown;

export type PiPackageInstallScope = "none" | "user" | "project" | "both";
export type WritablePiPackageInstallScope = Exclude<PiPackageInstallScope, "none" | "both">;

export interface PiPackageInstallState {
	packageName: string;
	scope: PiPackageInstallScope;
}

export interface DetectPiPackageOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	homeDir?: string;
}

function readJsonFile<T>(filePath: string): T | undefined {
	if (!existsSync(filePath)) {
		return undefined;
	}

	try {
		return JSON.parse(readFileSync(filePath, "utf8")) as T;
	} catch {
		return undefined;
	}
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

function resolvePathPackageName(source: string, sourceBaseDir: string): string | undefined {
	if (
		source.startsWith("git:") ||
		source.startsWith("http://") ||
		source.startsWith("https://") ||
		source.startsWith("ssh://")
	) {
		return undefined;
	}

	const pkgJson = readJsonFile<{ name?: unknown }>(join(resolve(sourceBaseDir, source), "package.json"));
	return typeof pkgJson?.name === "string" ? pkgJson.name : undefined;
}

export function resolveManagedPackageName(source: string, sourceBaseDir: string): string | undefined {
	return parseNpmPackageName(source) ?? resolvePathPackageName(source, sourceBaseDir);
}

function collectManagedPackageNames(settingsPath: string, sourceBaseDir: string): Set<string> {
	const settings = readJsonFile<SettingsFile>(settingsPath) ?? {};
	const entries = Array.isArray(settings.packages) ? settings.packages : [];
	const packageNames = new Set<string>();
	for (const entry of entries) {
		const source = getPackageSource(entry);
		if (!source) {
			continue;
		}
		const packageName = resolveManagedPackageName(source, sourceBaseDir);
		if (packageName) {
			packageNames.add(packageName);
		}
	}
	return packageNames;
}

export function detectPiPackageInstallScopes(
	packageNames: string[],
	options: DetectPiPackageOptions = {},
): PiPackageInstallState[] {
	const cwd = options.cwd ?? process.cwd();
	const userSettingsPath = join(resolvePiAgentDir({ env: options.env, homeDir: options.homeDir }), "settings.json");
	const projectSettingsPath = join(cwd, ".pi", "settings.json");
	const userPackages = collectManagedPackageNames(userSettingsPath, cwd);
	const projectPackages = collectManagedPackageNames(projectSettingsPath, cwd);

	return packageNames.map((packageName) => {
		const installedInUser = userPackages.has(packageName);
		const installedInProject = projectPackages.has(packageName);
		const scope = installedInUser ? (installedInProject ? "both" : "user") : installedInProject ? "project" : "none";
		return { packageName, scope };
	});
}

export function findPiCommand(run: ExecFileRunner = execFileSync): string {
	const candidates = IS_WINDOWS ? ["pi.cmd", "pi"] : ["pi"];
	for (const candidate of candidates) {
		try {
			run(candidate, ["--version"], {
				shell: IS_WINDOWS,
				stdio: "pipe",
				timeout: 3_000,
			});
			return candidate;
		} catch {
			// Try next candidate
		}
	}
	throw new Error("pi not found. Install pi-coding-agent first.");
}

function readStderr(error: unknown): string {
	if (!error || typeof error !== "object" || !("stderr" in error)) {
		return "";
	}
	const { stderr } = error as { stderr?: { toString(): string } };
	return stderr ? stderr.toString().trim() : "";
}

export function installPiPackages(
	packageNames: string[],
	scope: WritablePiPackageInstallScope = "user",
	run: ExecFileRunner = execFileSync,
): void {
	if (packageNames.length === 0) {
		return;
	}

	const pi = findPiCommand(run);
	const scopeArgs = scope === "project" ? ["-l"] : [];
	for (const packageName of packageNames) {
		try {
			run(pi, ["install", `npm:${packageName}`, ...scopeArgs], {
				shell: IS_WINDOWS,
				stdio: "pipe",
				timeout: 60_000,
			});
		} catch (error) {
			const stderr = readStderr(error);
			if (stderr.includes("already installed") || stderr.includes("already exists")) {
				continue;
			}
			const details = stderr ? `: ${stderr.split("\n")[0]}` : ".";
			throw new Error(`Failed to install ${packageName}${details}`, {
				cause: error,
			});
		}
	}
}
