import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectLanguage } from "../src/read.js";

vi.mock("@shikijs/cli", () => ({
	codeToANSI: vi.fn().mockResolvedValue("highlighted code"),
}));

describe("detectLanguage", () => {
	it("detects TypeScript from .ts", () => {
		expect(detectLanguage("index.ts")).toBe("typescript");
	});

	it("detects JavaScript from .js", () => {
		expect(detectLanguage("index.js")).toBe("javascript");
	});

	it("detects Dockerfile", () => {
		expect(detectLanguage("Dockerfile")).toBe("dockerfile");
	});

	it("detects Makefile", () => {
		expect(detectLanguage("Makefile")).toBe("make");
	});

	it("detects .envrc as bash", () => {
		expect(detectLanguage(".envrc")).toBe("bash");
	});

	it("returns undefined for unknown extension", () => {
		expect(detectLanguage("file.xyz")).toBeUndefined();
	});

	it("handles empty filename", () => {
		expect(detectLanguage("")).toBeUndefined();
	});
});
