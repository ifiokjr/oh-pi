import { describe, expect, it } from "vitest";
import { compareVersion, entriesBetween, parseChangelog, renderChangelog } from "./changelog.js";

const FIXTURE = `# Changelog

## 0.5.0 (2026-04-20)

### Features

- Add interactive installer (#100)

### Fixes

- Fix bug (#99)

## 0.4.4 (2026-04-02)

### Features

- Feature A (#79)

## 0.4.3 (2026-04-01)

### Fixes

- Fix B (#75)

## 0.4.0 (2026-03-30)

### Breaking Changes

- Change C (#66)
`;

describe("parseChangelog", () => {
	it("extracts version entries", () => {
		const entries = parseChangelog(FIXTURE);
		expect(entries.map((e) => e.version)).toEqual(["0.5.0", "0.4.4", "0.4.3", "0.4.0"]);
	});

	it("captures dates", () => {
		const entries = parseChangelog(FIXTURE);
		expect(entries[0].date).toBe("2026-04-20");
	});

	it("returns empty for empty content", () => {
		expect(parseChangelog("")).toEqual([]);
	});
});

describe("entriesBetween", () => {
	const entries = parseChangelog(FIXTURE);

	it("returns entries up to target when no fromVersion", () => {
		const result = entriesBetween(entries, null, "0.4.4");
		expect(result.map((e) => e.version)).toEqual(["0.5.0", "0.4.4"]);
	});

	it("excludes fromVersion and includes toVersion", () => {
		const result = entriesBetween(entries, "0.4.4", "0.4.0");
		expect(result.map((e) => e.version)).toEqual(["0.4.3", "0.4.0"]);
	});

	it("returns empty when toVersion missing", () => {
		expect(entriesBetween(entries, "0.4.4", "9.9.9")).toEqual([]);
	});
});

describe("compareVersion", () => {
	it("returns 0 for equal", () => {
		expect(compareVersion("0.4.4", "0.4.4")).toBe(0);
	});

	it("returns positive when a > b", () => {
		expect(compareVersion("0.5.0", "0.4.4")).toBeGreaterThan(0);
	});

	it("returns negative when a < b", () => {
		expect(compareVersion("0.4.3", "0.4.4")).toBeLessThan(0);
	});
});

describe("renderChangelog", () => {
	it("renders formatted output", () => {
		const entries = parseChangelog(FIXTURE);
		const text = renderChangelog(entriesBetween(entries, "0.4.4", "0.4.3"));
		expect(text).toContain("0.4.3");
		expect(text).toContain("Fix B");
		expect(text).not.toContain("Feature A");
	});

	it("handles empty entries", () => {
		expect(renderChangelog([])).toBe("No changes found.");
	});
});
