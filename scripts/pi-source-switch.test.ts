import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	parseNpmPackageName,
	resolveManagedPackageNameFromSource,
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
			]),
			(source) => parseNpmPackageName(source),
		);

		expect(nextEntries).toEqual([
			"npm:@ifi/oh-pi",
			{ source: "/repo/packages/extensions", extensions: ["-extensions/safe-guard.ts"] },
			"/repo/packages/themes",
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

	it("resolves local path sources back to workspace package names", () => {
		const repoDir = mkdtempSync(path.join(tmpdir(), "oh-pi-switcher-source-"));
		tempDirs.push(repoDir);
		const packageDir = path.join(repoDir, "packages", "themes");
		mkdirSync(packageDir, { recursive: true });
		writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({ name: "@ifi/oh-pi-themes" }));

		expect(resolveManagedPackageNameFromSource(packageDir, repoDir)).toBe("@ifi/oh-pi-themes");
	});
});
