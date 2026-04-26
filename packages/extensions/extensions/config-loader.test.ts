import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadJsonConfigFile } from "./config-loader.js";

describe(loadJsonConfigFile, () => {
	let tempDir: string;

	afterEach(() => {
		if (tempDir) {
			rmSync(tempDir, { force: true, recursive: true });
		}
	});

	it("returns the fallback when the config file is missing", () => {
		const warnings: string[] = [];
		const fallback = { mode: "shadow", stickyTurns: 1 };

		tempDir = mkdtempSync(join(tmpdir(), "config-loader-"));
		const result = loadJsonConfigFile({
			fallback,
			normalize: (raw) => ({ value: raw as typeof fallback, warnings: [] }),
			path: join(tempDir, "missing.json"),
			warn: (message) => warnings.push(message),
		});

		expect(result).toStrictEqual(fallback);
		expect(warnings).toStrictEqual([]);
	});

	it("returns the fallback and warns when the config JSON is invalid", () => {
		const warnings: string[] = [];
		const fallback = { mode: "shadow", stickyTurns: 1 };

		tempDir = mkdtempSync(join(tmpdir(), "config-loader-"));
		writeFileSync(join(tempDir, "broken.json"), "{ invalid json", "utf8");

		const result = loadJsonConfigFile({
			fallback,
			normalize: (raw) => ({ value: raw as typeof fallback, warnings: [] }),
			path: join(tempDir, "broken.json"),
			warn: (message) => warnings.push(message),
		});

		expect(result).toStrictEqual(fallback);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("Failed to parse config");
		expect(warnings[0]).toContain("broken.json");
	});

	it("returns the fallback and warns when normalization throws", () => {
		const warnings: string[] = [];
		const fallback = { mode: "shadow", stickyTurns: 1 };

		tempDir = mkdtempSync(join(tmpdir(), "config-loader-"));
		writeFileSync(join(tempDir, "config.json"), `${JSON.stringify({ mode: "auto" })}\n`, "utf8");

		const result = loadJsonConfigFile({
			fallback,
			normalize: () => {
				throw new Error("bad normalize");
			},
			path: join(tempDir, "config.json"),
			warn: (message) => warnings.push(message),
		});

		expect(result).toStrictEqual(fallback);
		expect(warnings).toStrictEqual([expect.stringContaining("Failed to normalize config")]);
	});

	it("returns normalized config and forwards partial-config warnings", () => {
		const warnings: string[] = [];
		const fallback = { mode: "shadow", stickyTurns: 1 };

		tempDir = mkdtempSync(join(tmpdir(), "config-loader-"));
		mkdirSync(tempDir, { recursive: true });
		writeFileSync(
			join(tempDir, "config.json"),
			`${JSON.stringify({ ignored: { bad: true }, mode: "auto", stickyTurns: 4 }, null, 2)}\n`,
			"utf8",
		);

		const normalize = vi.fn((raw: unknown) => ({
			value: { ...(fallback as object), ...(raw as object) },
			warnings: ["Skipped invalid section: ignored"],
		}));

		const result = loadJsonConfigFile({
			fallback,
			normalize,
			path: join(tempDir, "config.json"),
			warn: (message) => warnings.push(message),
		});

		expect(normalize).toHaveBeenCalledTimes(1);
		expect(result).toStrictEqual({ ignored: { bad: true }, mode: "auto", stickyTurns: 4 });
		expect(warnings).toStrictEqual(["Skipped invalid section: ignored"]);
	});
});
