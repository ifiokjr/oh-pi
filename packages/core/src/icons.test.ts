import { afterEach, describe, expect, it } from "vitest";
import { icon, isPlainIcons, setPlainIcons } from "./icons.js";

describe("icons", () => {
	afterEach(() => {
		process.env.OH_PI_PLAIN_ICONS = "";
	});

	describe("isPlainIcons", () => {
		it("returns false by default", () => {
			expect(isPlainIcons()).toBe(false);
		});

		it('returns true when OH_PI_PLAIN_ICONS is "1"', () => {
			process.env.OH_PI_PLAIN_ICONS = "1";
			expect(isPlainIcons()).toBe(true);
		});

		it('returns true when OH_PI_PLAIN_ICONS is "true"', () => {
			process.env.OH_PI_PLAIN_ICONS = "true";
			expect(isPlainIcons()).toBe(true);
		});

		it("returns false for other values", () => {
			process.env.OH_PI_PLAIN_ICONS = "0";
			expect(isPlainIcons()).toBe(false);
		});
	});

	describe("setPlainIcons", () => {
		it("enables plain mode", () => {
			setPlainIcons(true);
			expect(process.env.OH_PI_PLAIN_ICONS).toBe("1");
			expect(isPlainIcons()).toBe(true);
		});

		it("disables plain mode", () => {
			process.env.OH_PI_PLAIN_ICONS = "1";
			setPlainIcons(false);
			expect(isPlainIcons()).toBe(false);
		});
	});

	describe("icon", () => {
		it("returns emoji by default", () => {
			expect(icon("check")).toBe("✓");
			expect(icon("cross")).toBe("✗");
			expect(icon("ant")).toBe("🐜");
			expect(icon("rocket")).toBe("🚀");
			expect(icon("warning")).toBe("⚠️");
		});

		it("returns plain text when plain mode is enabled", () => {
			process.env.OH_PI_PLAIN_ICONS = "1";
			expect(icon("check")).toBe("[ok]");
			expect(icon("cross")).toBe("[x]");
			expect(icon("ant")).toBe("[ant]");
			expect(icon("rocket")).toBe("[>>]");
			expect(icon("warning")).toBe("[!]");
		});

		it("responds dynamically to env var changes", () => {
			expect(icon("shield")).toBe("🛡️");
			process.env.OH_PI_PLAIN_ICONS = "1";
			expect(icon("shield")).toBe("[!]");
			process.env.OH_PI_PLAIN_ICONS = "";
			expect(icon("shield")).toBe("🛡️");
		});
	});
});
