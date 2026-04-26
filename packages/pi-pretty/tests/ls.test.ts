import { renderTree } from "../src/ls.js";

const { renderTree: rt } = await import("../src/ls.js");

describe(renderTree, () => {
	it("renders simple directory tree", () => {
		const entries = [
			{ children: [{ name: "index.ts", isDirectory: false }], isDirectory: true, name: "src" },
			{ isDirectory: false, name: "README.md" },
		];
		const output = renderTree(entries);
		expect(output).toContain("src");
		expect(output).toContain("README.md");
		expect(output).toContain("index.ts");
	});

	it("handles empty entries", () => {
		const output = renderTree([]);
		expect(output).toBe("");
	});

	it("sorts directories first", () => {
		const entries = [
			{ isDirectory: false, name: "zzz" },
			{ isDirectory: true, name: "aaa" },
		];
		const output = renderTree(entries);
		const lines = output.split("\n").filter(Boolean);
		// Directory should appear before file
		const dirIdx = lines.findIndex((l) => l.includes("aaa"));
		const fileIdx = lines.findIndex((l) => l.includes("zzz"));
		expect(dirIdx).toBeLessThan(fileIdx);
	});
});
