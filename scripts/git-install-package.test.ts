import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type PiManifest = {
	extensions?: string[];
	prompts?: string[];
	skills?: string[];
	themes?: string[];
};

type PackageManifest = {
	workspaces?: string[];
	pi?: PiManifest;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
};

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, "..");

function readPackageJson(relativePath: string): PackageManifest {
	return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8")) as PackageManifest;
}

function toRootRelative(packageJsonPath: string, entry: string): string {
	const packageDir = path.posix.dirname(packageJsonPath);
	return `./${path.posix.join(packageDir, entry.replace(/^\.\//, ""))}`;
}

describe("git-install package manifest", () => {
	it("aggregates the standalone pi packages at the repo root", () => {
		const rootManifest = readPackageJson("package.json");
		const extensionPackages = [
			"packages/monopi__extension-answer/package.json",
			"packages/monopi__extension-watchdog/package.json",
			"packages/monopi__extension-btw/package.json",
			"packages/monopi__extension-compact-header/package.json",
			"packages/monopi__extension-custom-footer/package.json",
			"packages/monopi__extension-external-editor/package.json",
			"packages/monopi__extension-git-guard/package.json",
			"packages/monopi__extension-scheduler/package.json",
			"packages/monopi__extension-shell-format/package.json",
			"packages/monopi__extension-tool-metadata/package.json",
			"packages/monopi__extension-usage-tracker/package.json",
			"packages/monopi__extension-worktree/package.json",
			"packages/monopi__background-tasks/package.json",
			"packages/monopi__diagnostics/package.json",
			"packages/monopi__subagents/package.json",
			"packages/monopi__web-remote/package.json",
			"packages/monopi__provider-cursor/package.json",
			"packages/monopi__provider-ollama/package.json",
			"packages/monopi__analytics-extension/package.json",
		];
		const expectedExtensionEntries = extensionPackages.flatMap((packageJsonPath) => {
			const manifest = readPackageJson(packageJsonPath);
			return (manifest.pi?.extensions ?? []).map((entry) => toRootRelative(packageJsonPath, entry));
		});

		expect(rootManifest.workspaces).toEqual(["packages/*"]);
		expect(rootManifest.pi?.extensions).toEqual(expectedExtensionEntries);
		expect(rootManifest.pi?.skills).toEqual(["./packages/monopi__skills/skills"]);
		expect(rootManifest.pi?.themes).toBeUndefined();

		for (const extensionEntry of rootManifest.pi?.extensions ?? []) {
			expect(extensionEntry.endsWith(".ts")).toBe(true);
			expect(extensionEntry.includes("node_modules")).toBe(false);
		}
	});

	it("avoids npm-incompatible workspace protocol dependencies", () => {
		const manifestPaths = [
			"package.json",
			...readdirSync(path.join(repoRoot, "packages"), { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => path.posix.join("packages", entry.name, "package.json")),
		];
		const dependencyKeys = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

		for (const manifestPath of manifestPaths) {
			const manifest = readPackageJson(manifestPath);
			for (const dependencyKey of dependencyKeys) {
				for (const [dependencyName, version] of Object.entries(manifest[dependencyKey] ?? {})) {
					expect(
						version.startsWith("workspace:"),
						`${manifestPath} uses unsupported ${dependencyKey}.${dependencyName}=${version}`,
					).toBe(false);
				}
			}
		}
	});
});
