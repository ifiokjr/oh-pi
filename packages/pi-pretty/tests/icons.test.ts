import { describe, it, expect } from "vitest";
import { getFileIcon, getDirectoryIcon, enableIcons, areIconsEnabled } from "../src/icons.js";

describe("getFileIcon", () => {
	it("returns TypeScript icon", () => {
		expect(getFileIcon("index.ts")).toContain("󰛦");
	});

	it("returns JavaScript icon", () => {
		expect(getFileIcon("index.js")).toContain("󰌞");
	});

	it("returns generic file icon for unknown", () => {
		expect(getFileIcon("unknown.xyz")).toContain("󰈙");
	});

	it("returns empty when icons disabled", () => {
		enableIcons(false);
		expect(getFileIcon("index.ts")).toBe("");
		enableIcons(true);
	});
});

describe("getDirectoryIcon", () => {
	it("returns directory icon", () => {
		expect(getDirectoryIcon()).toContain("󰉋");
	});

	it("returns empty when icons disabled", () => {
		enableIcons(false);
		expect(getDirectoryIcon()).toBe("");
		enableIcons(true);
	});
});

describe("areIconsEnabled", () => {
	it("defaults to true", () => {
		expect(areIconsEnabled()).toBe(true);
	});
});