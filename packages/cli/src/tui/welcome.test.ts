import { categorize } from "./welcome.js";

describe(categorize, () => {
	it("groups by directory", () => {
		const result = categorize(["ext/a.ts", "ext/b.ts", "prompts/c.md"]);
		expect(result).toContain("ext (2)");
		expect(result).toContain("prompts (1)");
	});

	it("empty array returns empty string", () => {
		expect(categorize([])).toBe("");
	});

	it("files without directory use filename", () => {
		const result = categorize(["a.ts", "b.ts"]);
		expect(result).toContain("a.ts (1)");
		expect(result).toContain("b.ts (1)");
	});

	it("single file", () => {
		expect(categorize(["foo/bar.ts"])).toBe("foo (1)");
	});

	it("mixed files with and without directory", () => {
		const result = categorize(["a.ts", "dir/b.ts"]);
		expect(result).toContain("a.ts (1)");
		expect(result).toContain("dir (1)");
	});
});
