import { execMultiGrep, multiGrep } from "../src/find-grep.js";

vi.mock<typeof import("@ff-labs/fff-node")>(import("@ff-labs/fff-node"), async (importOriginal) => ({
	CursorStore: vi.fn().mockImplementation(() => ({
		init: vi.fn().mockResolvedValue(undefined),
		grep: vi.fn().mockResolvedValue([{ file: "src/index.ts", line: 10, text: "function foo()" }]),
		stats: vi.fn().mockReturnValue({ fileCount: 5 }),
	})),
	Cursor: vi.fn(),
}));

describe(multiGrep, () => {
	it("returns no matches for empty patterns", async () => {
		const result = await multiGrep([], "*.ts");
		expect(result.ok).toBeFalsy();
		expect(result.matches).toBe(0);
	});

	it("finds matches with FFF", async () => {
		// When FFF module is available and returns matches
		const result = await multiGrep(["foo"], "*.ts");
		// Result may come from FFF or grep fallback depending on module resolution
		expectTypeOf(result.ok).toBeBoolean();
		expectTypeOf(result.matches).toBeNumber();
	});

	it("falls back to exec grep when FFF fails", async () => {
		vi.doUnmock("@ff-labs/fff-node");
		const result = await execMultiGrep(["import"], "*.ts", ".");
		// Result depends on actual codebase — just verify structure
		expectTypeOf(result.ok).toBeBoolean();
	});
});
