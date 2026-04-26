
import { countExisting } from "./confirm-apply.js";

const mkEnv = (files: string[]) => ({ existingFiles: files }) as any;

describe(countExisting, () => {
	it("counts files matching prefix", () => {
		expect(countExisting(mkEnv(["extensions/a", "extensions/b", "prompts/c"]), "extensions")).toBe(2);
	});

	it("returns 0 when no match", () => {
		expect(countExisting(mkEnv(["extensions/a"]), "themes")).toBe(0);
	});

	it("returns 0 for empty existingFiles", () => {
		expect(countExisting(mkEnv([]), "extensions")).toBe(0);
	});

	it("counts different prefix", () => {
		expect(countExisting(mkEnv(["extensions/a", "extensions/b", "prompts/c"]), "prompts")).toBe(1);
	});

	it("does not match without slash separator", () => {
		expect(countExisting(mkEnv(["extensionsX"]), "extensions")).toBe(0);
	});
});
