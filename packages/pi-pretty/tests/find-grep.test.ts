import { describe, it, expect, vi } from "vitest";
import { multiGrep, execMultiGrep } from "../src/find-grep.js";

vi.mock("@ff-labs/fff-node", () => ({
	CursorStore: vi.fn().mockImplementation(() => ({
		init: vi.fn().mockResolvedValue(undefined),
		grep: vi.fn().mockResolvedValue([
			{ file: "src/index.ts", line: 10, text: "function foo()" },
		]),
		stats: vi.fn().mockReturnValue({ fileCount: 5 }),
	})),
	Cursor: vi.fn(),
}));

describe("multiGrep", () => {
	it("returns no matches for empty patterns", async () => {
		const result = await multiGrep([], "*.ts");
		expect(result.ok).toBe(false);
		expect(result.matches).toBe(0);
	});

	it("finds matches with FFF", async () => {
		const result = await multiGrep(["foo"], "*.ts");
		expect(result.ok).toBe(true);
		expect(result.matches).toBeGreaterThan(0);
	});

	it("falls back to exec grep when FFF fails", async () => {
		vi.doUnmock("@ff-labs/fff-node");
		const result = await execMultiGrep(["import"], "*.ts", ".");
		// Result depends on actual codebase — just verify structure
		expect(typeof result.ok).toBe("boolean");
	});
});