import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type PiPackageManifest = {
	pi?: {
		extensions?: string[];
	};
};

const extensionsDir = path.dirname(fileURLToPath(import.meta.url));

function readPackageJson(relativePath: string): PiPackageManifest {
	return JSON.parse(
		readFileSync(path.resolve(extensionsDir, "..", "..", "..", relativePath), "utf-8"),
	) as PiPackageManifest;
}

describe("pi package extension entrypoints", () => {
	it("lists explicit extension entrypoint files for helper-heavy packages", () => {
		const extensionPackages = [
			"packages/extensions/package.json",
			"packages/adaptive-routing/package.json",
			"packages/background-tasks/package.json",
			"packages/spec/package.json",
			"packages/diagnostics/package.json",
			"packages/cursor/package.json",
			"packages/ollama/package.json",
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
