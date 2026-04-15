import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

describe("pi source switcher helpers", () => {
	const tempDirs: string[] = [];

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
			[
				"npm:@ifi/oh-pi",
				{ source: "npm:@ifi/oh-pi-extensions", extensions: ["-extensions/safe-guard.ts"] },
				"npm:@ifi/oh-pi-themes",
			],
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
			{ source: "/repo/packages/extensions", extensions: ["-extensions/safe-guard.ts"] },
			"/repo/packages/themes",
			"/repo/packages/providers",
			"/repo/packages/cursor",
		]);
	});

	it("dedupes managed package entries while preserving object-style config", () => {
		const nextEntries = dedupeManagedPackageEntries(
			[
				"npm:@ifi/oh-pi",
				{ source: "/tmp/old/extensions", extensions: ["-extensions/safe-guard.ts"] },
				"/tmp/new/extensions",
				"/tmp/old/themes",
				"/tmp/new/themes",
			],
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

		expect(nextEntries).toEqual([
			"npm:@ifi/oh-pi",
			{ source: "/tmp/old/extensions", extensions: ["-extensions/safe-guard.ts"] },
			"/tmp/new/themes",
		]);
	});

	it("resolves workspace package directories from a repo checkout", () => {
		const repoDir = mkdtempSync(path.join(tmpdir(), "oh-pi-switcher-"));
		tempDirs.push(repoDir);
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
				{ source: "/repo/packages/extensions", extensions: ["extensions/existing.ts", "-extensions/safe-guard.ts"] },
				{ extensions: ["extensions/existing.ts", "extensions/worktree.ts"] },
			),
		).toEqual({
			source: "/repo/packages/extensions",
			extensions: ["extensions/existing.ts", "extensions/worktree.ts", "-extensions/safe-guard.ts"],
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
		const repoDir = mkdtempSync(path.join(tmpdir(), "oh-pi-switcher-manifest-"));
		tempDirs.push(repoDir);
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
		const repoDir = mkdtempSync(path.join(tmpdir(), "oh-pi-switcher-source-"));
		tempDirs.push(repoDir);
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
});
