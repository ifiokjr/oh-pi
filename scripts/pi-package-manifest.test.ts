import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type PiPackageManifest = {
	pi?: {
		extensions?: string[];
	};
};

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function readPackageJson(relativePath: string): PiPackageManifest {
	return JSON.parse(readFileSync(path.resolve(repoRoot, relativePath), "utf-8")) as PiPackageManifest;
}

describe("pi package extension entrypoints", () => {
	it("lists explicit extension entrypoint files for helper-heavy packages", () => {
		const extensionPackages = [
			"packages/monopi__extension-answer/package.json",
			"packages/monopi__extension-watchdog/package.json",
			"packages/monopi__extension-bg-process/package.json",
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
			"packages/monopi__adaptive-routing/package.json",
			"packages/monopi__background-tasks/package.json",
			"packages/monopi__diagnostics/package.json",
			"packages/monopi__provider-cursor/package.json",
			"packages/monopi__provider-ollama/package.json",
		];

		for (const packagePath of extensionPackages) {
			const manifest = readPackageJson(packagePath);
			const entries = manifest.pi?.extensions ?? [];
			expect(entries.length).toBeGreaterThan(0);
			expect(entries.every((entry) => entry.endsWith(".ts"))).toBe(true);
			expect(entries.every((entry) => !(entry.endsWith("/extensions") || entry.endsWith("/extension")))).toBe(true);
		}
	});
});
