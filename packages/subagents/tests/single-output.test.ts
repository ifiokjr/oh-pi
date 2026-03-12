import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { finalizeSingleOutput, injectSingleOutputInstruction, resolveSingleOutputPath } from "../single-output.js";

const tempDirs: string[] = [];

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) {
			continue;
		}
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("resolveSingleOutputPath", () => {
	it("keeps absolute paths unchanged", () => {
		const absolutePath = path.join(os.tmpdir(), "pi-subagents-abs", "report.md");
		expect(resolveSingleOutputPath(absolutePath, "/repo", "/override")).toBe(absolutePath);
	});

	it("resolves relative paths against the requested cwd", () => {
		expect(resolveSingleOutputPath("reviews/report.md", "/runtime", "/requested")).toBe(
			path.resolve("/requested", "reviews/report.md"),
		);
	});

	it("resolves relative paths against the runtime cwd when requested cwd is absent", () => {
		expect(resolveSingleOutputPath("reviews/report.md", "/runtime")).toBe(
			path.resolve("/runtime", "reviews/report.md"),
		);
	});

	it("resolves a relative requested cwd from the runtime cwd before resolving output", () => {
		expect(resolveSingleOutputPath("reviews/report.md", "/runtime", "nested/work")).toBe(
			path.resolve("/runtime", "nested/work", "reviews/report.md"),
		);
	});
});

describe("injectSingleOutputInstruction", () => {
	it("appends an output instruction with the resolved path", () => {
		const output = injectSingleOutputInstruction("Analyze this", "/tmp/report.md");
		expect(output).toMatch(/Write your findings to: \/tmp\/report\.md/);
	});
});

describe("finalizeSingleOutput", () => {
	it("persists full output while displaying truncated output", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-output-test-"));
		tempDirs.push(dir);
		const outputPath = path.join(dir, "review.md");
		const fullOutput = "line 1\nline 2\nline 3";
		const truncatedOutput = "[TRUNCATED]\nline 1";

		const result = finalizeSingleOutput({
			fullOutput,
			truncatedOutput,
			outputPath,
			exitCode: 0,
		});

		expect(result.displayOutput).toMatch(/^\[TRUNCATED\]\nline 1/);
		expect(result.displayOutput).toMatch(/📄 Output saved to:/);
		expect(fs.readFileSync(outputPath, "utf-8")).toBe(fullOutput);
	});

	it("does not write an output file on failed runs", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-output-test-"));
		tempDirs.push(dir);
		const outputPath = path.join(dir, "review.md");

		const result = finalizeSingleOutput({
			fullOutput: "full output",
			truncatedOutput: "truncated output",
			outputPath,
			exitCode: 1,
		});

		expect(result.displayOutput).toBe("truncated output");
		expect(fs.existsSync(outputPath)).toBe(false);
	});
});
