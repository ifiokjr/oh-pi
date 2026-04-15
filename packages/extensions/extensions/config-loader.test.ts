import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadJsonConfigFile } from "./config-loader.js";

describe("loadJsonConfigFile", () => {
	let tempDir: string;

	afterEach(() => {
		if (tempDir) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("returns the fallback when the config file is missing", () => {
		const warnings: string[] = [];
		const fallback = { mode: "shadow", stickyTurns: 1 };

		tempDir = mkdtempSync(join(tmpdir(), "config-loader-"));
		const result = loadJsonConfigFile({
			path: join(tempDir, "missing.json"),
			fallback,
			normalize: (raw) => ({ value: raw as typeof fallback, warnings: [] }),
			warn: (message) => warnings.push(message),
		});

		expect(result).toEqual(fallback);
		expect(warnings).toEqual([]);
	});

	it("returns the fallback and warns when the config JSON is invalid", () => {
		const warnings: string[] = [];
		const fallback = { mode: "shadow", stickyTurns: 1 };

		tempDir = mkdtempSync(join(tmpdir(), "config-loader-"));
		writeFileSync(join(tempDir, "broken.json"), "{ invalid json", "utf-8");

		const result = loadJsonConfigFile({
			path: join(tempDir, "broken.json"),
			fallback,
			normalize: (raw) => ({ value: raw as typeof fallback, warnings: [] }),
			warn: (message) => warnings.push(message),
		});

		expect(result).toEqual(fallback);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("Failed to parse config");
		expect(warnings[0]).toContain("broken.json");
	});

	it("returns the fallback and warns when normalization throws", () => {
		const warnings: string[] = [];
		const fallback = { mode: "shadow", stickyTurns: 1 };

		tempDir = mkdtempSync(join(tmpdir(), "config-loader-"));
		writeFileSync(join(tempDir, "config.json"), `${JSON.stringify({ mode: "auto" })}\n`, "utf-8");

		const result = loadJsonConfigFile({
			path: join(tempDir, "config.json"),
			fallback,
			normalize: () => {
				throw new Error("bad normalize");
			},
			warn: (message) => warnings.push(message),
		});

		expect(result).toEqual(fallback);
		expect(warnings).toEqual([expect.stringContaining("Failed to normalize config")]);
	});

	it("returns normalized config and forwards partial-config warnings", () => {
		const warnings: string[] = [];
		const fallback = { mode: "shadow", stickyTurns: 1 };

		tempDir = mkdtempSync(join(tmpdir(), "config-loader-"));
		mkdirSync(tempDir, { recursive: true });
		writeFileSync(
			join(tempDir, "config.json"),
			`${JSON.stringify({ mode: "auto", stickyTurns: 4, ignored: { bad: true } }, null, 2)}\n`,
			"utf-8",
		);

		const normalize = vi.fn((raw: unknown) => ({
			value: { ...(fallback as object), ...(raw as object) },
			warnings: ["Skipped invalid section: ignored"],
		}));

		const result = loadJsonConfigFile({
			path: join(tempDir, "config.json"),
			fallback,
			normalize,
			warn: (message) => warnings.push(message),
		});

		expect(normalize).toHaveBeenCalledOnce();
		expect(result).toEqual({ mode: "auto", stickyTurns: 4, ignored: { bad: true } });
		expect(warnings).toEqual(["Skipped invalid section: ignored"]);
	});
});
