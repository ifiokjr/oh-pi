import { describe, expect, it } from "vitest";
import { clearProgressLine, renderProgress, runWithProgress } from "./progress.js";

describe("renderProgress", () => {
	it("writes a progress bar", () => {
		const chunks: string[] = [];
		const stdout = {
			write: (c: string) => chunks.push(c),
		} as unknown as NodeJS.WriteStream;
		renderProgress({ total: 10, current: 5, label: "test" }, { stdout });
		const output = chunks.join("");
		expect(output).toContain("50%");
		expect(output).toContain("Installing:");
		expect(output).toContain("test");
	});
});

describe("clearProgressLine", () => {
	it("writes clear sequence", () => {
		const chunks: string[] = [];
		const stdout = {
			write: (c: string) => chunks.push(c),
		} as unknown as NodeJS.WriteStream;
		clearProgressLine({ stdout });
		expect(chunks.join("")).toContain("\x1B[K");
	});
});

describe("runWithProgress", () => {
	it("runs tasks and shows progress", async () => {
		const chunks: string[] = [];
		const stdout = {
			write: (c: string) => chunks.push(c),
		} as unknown as NodeJS.WriteStream;
		const calls: string[] = [];
		await runWithProgress(
			[
				{
					label: "a",
					fn: () => {
						calls.push("a");
					},
				},
				{
					label: "b",
					fn: () => {
						calls.push("b");
					},
				},
			],
			{ stdout },
		);
		expect(calls).toEqual(["a", "b"]);
		const output = chunks.join("");
		expect(output).toContain("a");
		expect(output).toContain("b");
		expect(output).toContain("100%");
	});
});
