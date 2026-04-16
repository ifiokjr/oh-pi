import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { SWITCHER_PACKAGES } from "../packages/oh-pi/bin/package-list.mjs";
import {
	buildPiExecutableCandidates,
	dedupeManagedPackageEntries,
	mergeManagedPackageManifest,
	parseNpmPackageName,
	planPackageSyncOperations,
	resolveManagedPackageNameFromSource,
	resolvePiCommand,
	resolveWorkspacePackageManifests,
	resolveWorkspacePackageSources,
	rewriteManagedPackageSources,
} from "./pi-source-switch.mts";

const tempDirs: string[] = [];
const scriptPath = fileURLToPath(new URL("./pi-source-switch.mts", import.meta.url));

function createTempDir(prefix: string): string {
	const dir = mkdtempSync(path.join(tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
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

function writeWorkspacePackage(
	repoDir: string,
	dirName: string,
	packageName: string,
	options: {
		pi?: Record<string, string[]>;
	} = {},
): string {
	const packageDir = path.join(repoDir, "packages", dirName);
	mkdirSync(packageDir, { recursive: true });
	writeFileSync(
		path.join(packageDir, "package.json"),
		JSON.stringify({ name: packageName, ...(options.pi ? { pi: options.pi } : {}) }),
	);
	return packageDir;
}

function createWorkspaceRepo(options: {
	manifests?: Partial<Record<string, Record<string, string[]>>>;
} = {}): Map<string, string> {
	const repoDir = createTempDir("oh-pi-switcher-workspace-");
	const packageDirs = new Map<string, string>();

	for (const [index, packageName] of SWITCHER_PACKAGES.entries()) {
		const dirName = `${index}-${packageName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;
		packageDirs.set(
			packageName,
			writeWorkspacePackage(repoDir, dirName, packageName, {
				pi: options.manifests?.[packageName],
			}),
		);
	}

	return packageDirs;
}

function createFakePiExecutable(logPath: string): string {
	const rootDir = createTempDir("oh-pi-switcher-pi-");
	const binDir = path.join(rootDir, "bin");
	mkdirSync(binDir, { recursive: true });

	const executablePath = path.join(binDir, "pi");
	writeFileSync(
		executablePath,
		[
			"#!/usr/bin/env node",
			"const fs = require('node:fs');",
			"const logPath = process.env.PI_TEST_LOG_PATH;",
			"if (logPath) {",
			"  fs.appendFileSync(logPath, process.argv.slice(2).join(' ') + '\\n');",
			"}",
			"if (process.argv[2] === '--version') {",
			"  process.stdout.write('0.0.0-test\\n');",
			"  process.exit(0);",
			"}",
			"if (process.env.PI_TEST_FAIL_ON === process.argv[2]) {",
			"  process.stderr.write(process.env.PI_TEST_FAIL_MESSAGE || 'sync failed');",
			"  process.exit(1);",
			"}",
			"process.exit(0);",
		].join("\n"),
		"utf8",
	);
	chmodSync(executablePath, 0o755);

	return binDir;
}

function runSwitcher(
	args: string[],
	options: {
		cwd?: string;
		env?: NodeJS.ProcessEnv;
	} = {},
) {
	return spawnSync(process.execPath, ["--experimental-strip-types", scriptPath, ...args], {
		cwd: options.cwd ?? process.cwd(),
		env: { ...process.env, ...options.env },
		encoding: "utf8",
	});
}

describe("pi source switcher helpers", () => {
	afterEach(() => {
		for (const dir of tempDirs) {
			rmSync(dir, { recursive: true, force: true });
		}
		tempDirs.length = 0;
	});

	it("parses scoped and unscoped npm package names", () => {
		expect(parseNpmPackageName("npm:@ifi/oh-pi-extensions")).toBe("@ifi/oh-pi-extensions");
		expect(parseNpmPackageName("npm:@ifi/oh-pi-extensions@0.4.4")).toBe("@ifi/oh-pi-extensions");
		expect(parseNpmPackageName("npm:chalk@5.0.0")).toBe("chalk");
		expect(parseNpmPackageName("/tmp/local-package")).toBeUndefined();
	});

	it("rewrites managed package sources while preserving object settings", () => {
		const nextEntries = rewriteManagedPackageSources(
			["npm:@ifi/oh-pi", { source: "npm:@ifi/oh-pi-extensions" }, "npm:@ifi/oh-pi-themes"],
			new Map([
				["@ifi/oh-pi-extensions", "/repo/packages/extensions"],
				["@ifi/oh-pi-themes", "/repo/packages/themes"],
				["@ifi/pi-provider-catalog", "/repo/packages/providers"],
				["@ifi/pi-provider-cursor", "/repo/packages/cursor"],
			]),
			(source) => parseNpmPackageName(source),
		);

		expect(nextEntries).toEqual([
			"npm:@ifi/oh-pi",
			{ source: "/repo/packages/extensions" },
			"/repo/packages/themes",
			"/repo/packages/providers",
			"/repo/packages/cursor",
		]);
	});

	it("dedupes managed package entries while preserving object-style config", () => {
		const nextEntries = dedupeManagedPackageEntries(
			["npm:@ifi/oh-pi", "/tmp/old/extensions", "/tmp/new/extensions", "/tmp/old/themes", "/tmp/new/themes"],
			(source) => {
				if (source.includes("extensions")) {
					return "@ifi/oh-pi-extensions";
				}
				if (source.includes("themes")) {
					return "@ifi/oh-pi-themes";
				}
				return parseNpmPackageName(source);
			},
		);

		expect(nextEntries).toEqual(["npm:@ifi/oh-pi", "/tmp/new/extensions", "/tmp/new/themes"]);
	});

	it("resolves workspace package directories from a repo checkout", () => {
		const repoDir = createTempDir("oh-pi-switcher-");
		const packagesDir = path.join(repoDir, "packages");
		mkdirSync(path.join(packagesDir, "extensions"), { recursive: true });
		mkdirSync(path.join(packagesDir, "themes"), { recursive: true });
		writeFileSync(
			path.join(packagesDir, "extensions", "package.json"),
			JSON.stringify({ name: "@ifi/oh-pi-extensions" }),
		);
		writeFileSync(path.join(packagesDir, "themes", "package.json"), JSON.stringify({ name: "@ifi/oh-pi-themes" }));

		const sources = resolveWorkspacePackageSources(repoDir, ["@ifi/oh-pi-extensions", "@ifi/oh-pi-themes"]);
		expect(sources.get("@ifi/oh-pi-extensions")).toBe(path.join(repoDir, "packages", "extensions"));
		expect(sources.get("@ifi/oh-pi-themes")).toBe(path.join(repoDir, "packages", "themes"));
	});

	it("merges local package manifests into object settings so new extensions are not missed", () => {
		expect(
			mergeManagedPackageManifest(
				{ source: "/repo/packages/extensions", extensions: ["extensions/existing.ts"] },
				{ extensions: ["extensions/existing.ts", "extensions/worktree.ts"] },
			),
		).toEqual({
			source: "/repo/packages/extensions",
			extensions: ["extensions/existing.ts", "extensions/worktree.ts"],
		});
	});

	it("keeps explicit empty arrays when merging local package manifests", () => {
		expect(
			mergeManagedPackageManifest(
				{ source: "/repo/packages/extensions", extensions: [] },
				{ extensions: ["extensions/worktree.ts"] },
			),
		).toEqual({ source: "/repo/packages/extensions", extensions: [] });
	});

	it("reads workspace pi manifests for managed packages", () => {
		const repoDir = createTempDir("oh-pi-switcher-manifest-");
		const packageDir = path.join(repoDir, "packages", "extensions");
		mkdirSync(packageDir, { recursive: true });
		writeFileSync(
			path.join(packageDir, "package.json"),
			JSON.stringify({
				name: "@ifi/oh-pi-extensions",
				pi: { extensions: ["./extensions/custom-footer.ts", "./extensions/worktree.ts"] },
			}),
		);

		const manifests = resolveWorkspacePackageManifests(repoDir, ["@ifi/oh-pi-extensions"]);
		expect(manifests.get("@ifi/oh-pi-extensions")).toEqual({
			extensions: ["extensions/custom-footer.ts", "extensions/worktree.ts"],
		});
	});

	it("installs newly added managed packages while updating existing ones", () => {
		const operations = planPackageSyncOperations(
			new Map([["@ifi/oh-pi-extensions", "npm:@ifi/oh-pi-extensions"]]),
			new Map([
				["@ifi/oh-pi-extensions", "/repo/packages/extensions"],
				["@ifi/pi-provider-catalog", "/repo/packages/providers"],
			]),
		);

		expect(operations).toEqual(
			expect.arrayContaining([
				{ packageName: "@ifi/oh-pi-extensions", source: "/repo/packages/extensions", action: "update" },
				{ packageName: "@ifi/pi-provider-catalog", source: "/repo/packages/providers", action: "install" },
			]),
		);
	});

	it("resolves local path sources back to workspace package names", () => {
		const repoDir = createTempDir("oh-pi-switcher-source-");
		const packageDir = path.join(repoDir, "packages", "themes");
		mkdirSync(packageDir, { recursive: true });
		writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({ name: "@ifi/oh-pi-themes" }));

		expect(resolveManagedPackageNameFromSource(packageDir, repoDir)).toBe("@ifi/oh-pi-themes");
	});

	it("adds common global pnpm and pi bin directories when building pi candidates", () => {
		const candidates = buildPiExecutableCandidates({
			env: { PATH: "", PNPM_HOME: "/custom/pnpm-home" },
			homeDir: "/Users/tester",
			platform: "darwin",
		});

		expect(candidates).toContain("pi");
		expect(candidates).toContain("/custom/pnpm-home/pi");
		expect(candidates).toContain("/Users/tester/Library/pnpm/pi");
		expect(candidates).toContain("/Users/tester/.pi/agent/bin/pi");
	});

	it("resolves pi from fallback candidates after PATH misses", () => {
		const resolved = resolvePiCommand(["pi", "/Users/tester/Library/pnpm/pi"], (candidate) => {
			return candidate === "/Users/tester/Library/pnpm/pi";
		});

		expect(resolved).toBe("/Users/tester/Library/pnpm/pi");
	});

	it("prints configured managed package status from user settings", () => {
		const agentDir = createTempDir("oh-pi-switcher-agent-");
		const settingsPath = path.join(agentDir, "settings.json");
		writeFileSync(
			settingsPath,
			JSON.stringify({
				packages: ["npm:@ifi/oh-pi-extensions@0.4.3", "npm:@ifi/oh-pi-themes@0.4.3", "npm:chalk@5.0.0"],
			}),
		);

		const result = runSwitcher(["status"], {
			env: {
				PI_CODING_AGENT_DIR: agentDir,
			},
		});

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toContain("oh-pi managed package sources (user settings)");
		expect(result.stdout).toContain(`Settings: ${settingsPath}`);
		expect(result.stdout).toContain("npm:@ifi/oh-pi-extensions@0.4.3");
		expect(result.stdout).toContain("npm:@ifi/oh-pi-themes@0.4.3");
		expect(result.stdout).toContain("@ifi/pi-provider-cursor");
		expect(result.stdout).toContain("<not configured>");
	});

	it("prints local dry-run changes without mutating project settings", () => {
		const projectDir = createTempDir("oh-pi-switcher-project-");
		const settingsPath = path.join(projectDir, ".pi", "settings.json");
		mkdirSync(path.dirname(settingsPath), { recursive: true });
		const originalSettings = JSON.stringify(
			{
				packages: [{ source: "npm:@ifi/oh-pi-extensions", extensions: ["extensions/legacy.ts"] }, "npm:chalk@5.0.0"],
			},
			null,
			2,
		);
		writeFileSync(settingsPath, `${originalSettings}\n`);

		const workspacePackages = createWorkspaceRepo({
			manifests: {
				"@ifi/oh-pi-extensions": {
					extensions: ["./extensions/custom-footer.ts", "./extensions/worktree.ts"],
				},
			},
		});
		const repoDir = path.dirname(path.dirname(workspacePackages.get("@ifi/oh-pi-extensions") ?? ""));

		const result = runSwitcher(["local", "--pi-local", "--dry-run", "--path", repoDir], {
			cwd: projectDir,
		});
		const resolvedSettingsPath = path.join(realpathSync.native(projectDir), ".pi", "settings.json");

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toContain("Switching oh-pi packages to local mode (project settings)");
		expect(result.stdout).toContain(`Settings: ${resolvedSettingsPath}`);
		expect(result.stdout).toContain(`Repo: ${repoDir}`);
		expect(result.stdout).toContain(workspacePackages.get("@ifi/oh-pi-extensions") ?? "");
		expect(result.stdout).toContain("Dry run only — settings were not written");
		expect(readFileSync(settingsPath, "utf8")).toBe(`${originalSettings}\n`);
	});

	it("writes remote package sources and syncs them through the discovered pi executable", () => {
		const agentDir = createTempDir("oh-pi-switcher-agent-");
		const settingsPath = path.join(agentDir, "settings.json");
		writeFileSync(
			settingsPath,
			JSON.stringify(
				{
					packages: [{ source: "npm:@ifi/oh-pi-extensions@0.4.3", extensions: ["extensions/custom-footer.ts"] }, "npm:chalk@5.0.0"],
				},
				null,
				2,
			),
		);

		const logPath = path.join(agentDir, "pi.log");
		const piBinDir = createFakePiExecutable(logPath);
		const result = runSwitcher(["remote", "--version", "0.4.4"], {
			env: {
				PATH: [piBinDir, path.dirname(process.execPath), process.env.PATH ?? ""].join(path.delimiter),
				PI_CODING_AGENT_DIR: agentDir,
				PI_CODING_AGENT_BIN: piBinDir,
				PI_TEST_LOG_PATH: logPath,
			},
		});

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toContain("Switching oh-pi packages to remote mode (user settings)");
		expect(result.stdout).toContain("Syncing packages with pi...");
		expect(result.stdout).toContain("✅ Done. Fully restart pi to reload the switched packages.");

		const savedSettings = JSON.parse(readFileSync(settingsPath, "utf8")) as { packages: unknown[] };
		const savedSources = savedSettings.packages.map(getPackageSource).filter((value): value is string => Boolean(value));
		const managedSources = savedSources.filter((value) => value.startsWith("npm:@ifi/"));
		const extensionEntry = savedSettings.packages.find(
			(entry) => getPackageSource(entry) === "npm:@ifi/oh-pi-extensions@0.4.4",
		) as { source: string; extensions?: string[] } | undefined;

		expect(managedSources).toHaveLength(SWITCHER_PACKAGES.length);
		expect(savedSources).toContain("npm:@ifi/pi-provider-cursor@0.4.4");
		expect(savedSources).toContain("npm:chalk@5.0.0");
		expect(extensionEntry).toEqual({
			source: "npm:@ifi/oh-pi-extensions@0.4.4",
			extensions: ["extensions/custom-footer.ts"],
		});

		const piLog = readFileSync(logPath, "utf8");
		expect(piLog).toContain("--version");
		expect(piLog).toContain("update npm:@ifi/oh-pi-extensions@0.4.4");
		expect(piLog).toContain("install npm:@ifi/pi-provider-cursor@0.4.4");
	}, 20_000);

	it("exits with an error when local mode cannot resolve the full managed workspace set", () => {
		const repoDir = createTempDir("oh-pi-switcher-incomplete-");
		writeWorkspacePackage(repoDir, "extensions", "@ifi/oh-pi-extensions");

		const result = runSwitcher(["local", "--dry-run", "--path", repoDir], {
			env: {
				PI_CODING_AGENT_DIR: createTempDir("oh-pi-switcher-agent-"),
			},
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Could not find workspace packages under");
	});
});
