import { describe, it, expect } from "vitest";
import {
	strip,
	fillToolBackground,
	preserveToolBackground,
	isLowContrastShikiFg,
	normalizeShikiContrast,
	lnum,
	rule,
	termW,
	resolveBaseBackground,
	parseAnsiRgb,
	FG_MUTED,
} from "../src/theme.js";

describe("strip", () => {
	it("removes ANSI codes", () => {
		expect(strip("\x1b[31mhello\x1b[0m")).toBe("hello");
	});

	it("returns plain text unchanged", () => {
		expect(strip("plain")).toBe("plain");
	});
});

describe("fillToolBackground", () => {
	it("fills lines to terminal width", () => {
		const result = fillToolBackground("hi");
		const firstLine = result.split("\n")[0];
		expect(strip(firstLine)).toHaveLength(termW());
	});

	it("handles empty string", () => {
		const result = fillToolBackground("");
		const firstLine = result.split("\n")[0];
		expect(strip(firstLine).length).toBeGreaterThan(0);
	});
});

describe("preserveToolBackground", () => {
	it("preserves reset sequences by adding bg", () => {
		const result = preserveToolBackground("\x1b[0mhello", "\x1b[49m");
		expect(result).toContain("\x1b[49m");
	});

	it("leaves non-reset sequences alone", () => {
		expect(preserveToolBackground("\x1b[31mhello", "\x1b[49m")).toBe("\x1b[31mhello");
	});
});

describe("isLowContrastShikiFg", () => {
	it("detects dark black", () => {
		expect(isLowContrastShikiFg("30")).toBe(true);
		expect(isLowContrastShikiFg("90")).toBe(true);
	});

	it("accepts bright colors", () => {
		expect(isLowContrastShikiFg("38;2;255;255;255")).toBe(false);
		expect(isLowContrastShikiFg("38;5;15")).toBe(false);
	});

	it("rejects invalid formats", () => {
		expect(isLowContrastShikiFg("1")).toBe(false);
		expect(isLowContrastShikiFg("38;2;50;50")).toBe(false); // incomplete
	});
});

describe("normalizeShikiContrast", () => {
	it("replaces low contrast with muted", () => {
		const input = "\x1b[30m dark \x1b[0m";
		const result = normalizeShikiContrast(input);
		expect(result).not.toContain("\x1b[30m");
		expect(result).toContain(FG_MUTED);
	});
});

describe("lnum", () => {
	it("pads line numbers", () => {
		expect(strip(lnum(1, 3))).toBe("  1");
		expect(strip(lnum(42, 3))).toBe(" 42");
		expect(strip(lnum(100, 3))).toBe("100");
	});
});

describe("rule", () => {
	it("creates horizontal line", () => {
		expect(strip(rule(10))).toBe("──────────");
	});
});

describe("termW", () => {
	it("returns a reasonable width", () => {
		const w = termW();
		expect(w).toBeGreaterThanOrEqual(80);
		expect(w).toBeLessThanOrEqual(210);
	});
});

describe("resolveBaseBackground", () => {
	it("updates BG_BASE when theme provides bg", () => {
		resolveBaseBackground({ getBgAnsi: (key) => (key === "toolSuccessBg" ? "\x1b[48;2;30;30;30m" : undefined) });
		// If called again with same state, it should early return
		resolveBaseBackground({ getBgAnsi: () => undefined });
	});
});
