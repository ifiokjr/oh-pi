
import { clearProgressLine, renderProgress, runWithProgress } from "./progress.js";

describe(renderProgress, () => {
	it("writes a progress bar", () => {
		const chunks: string[] = [];
		const stdout = { write: (c: string) => chunks.push(c) } as unknown as NodeJS.WriteStream;
		renderProgress({ current: 5, label: "test", total: 10 }, { stdout });
		const output = chunks.join("");
		expect(output).toContain("50%");
		expect(output).toContain("Installing:");
		expect(output).toContain("test");
	});
});

describe(clearProgressLine, () => {
	it("writes clear sequence", () => {
		const chunks: string[] = [];
		const stdout = { write: (c: string) => chunks.push(c) } as unknown as NodeJS.WriteStream;
		clearProgressLine({ stdout });
		expect(chunks.join("")).toContain("\u001B[K");
	});
});

describe(runWithProgress, () => {
	it("runs tasks and shows progress", async () => {
		const chunks: string[] = [];
		const stdout = { write: (c: string) => chunks.push(c) } as unknown as NodeJS.WriteStream;
		const calls: string[] = [];
		await runWithProgress(
			[
				{
					fn: () => {
						calls.push("a");
					},
					label: "a",
				},
				{
					fn: () => {
						calls.push("b");
					},
					label: "b",
				},
			],
			{ stdout },
		);
		expect(calls).toStrictEqual(["a", "b"]);
		const output = chunks.join("");
		expect(output).toContain("a");
		expect(output).toContain("b");
		expect(output).toContain("100%");
	});
});
