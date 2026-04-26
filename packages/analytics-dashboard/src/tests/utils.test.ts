/**
 * Utility Function Tests
 */

import { describe, it, expect } from "vitest";
import {
	cn,
	formatNumber,
	formatCurrency,
	formatTokens,
	formatDuration,
	formatDate,
	formatTimeRange,
	truncate,
	stringToColor,
	getChartColors,
	calculatePercentage,
	getProviderDisplayName,
	getModelShortName,
	debounce,
	isEqual,
	safeJsonParse,
} from "../lib/utils";

describe("utils", () => {
	describe("cn", () => {
		it("should merge class names", () => {
			expect(cn("a", "b", "c")).toBe("a b c");
		});

		it("should handle conditional classes", () => {
			const show = false;
			expect(cn("a", show && "b", "c")).toBe("a c");
		});

		it("should merge Tailwind classes correctly", () => {
			expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
		});
	});

	describe("formatNumber", () => {
		it("should format thousands with compact notation", () => {
			expect(formatNumber(1000)).toBe("1k");
			expect(formatNumber(1000000)).toBe("1M");
		});

		it("should format small numbers with commas", () => {
			expect(formatNumber(500)).toBe("500");
			expect(formatNumber(123)).toBe("123");
		});

		it("should format with decimals in compact mode", () => {
			expect(formatNumber(1234, 2)).toBe("1.23k");
			expect(formatNumber(15678, 1)).toBe("15.7k");
		});

		it("should return 0 for zero", () => {
			expect(formatNumber(0)).toBe("0");
		});
	});

	describe("formatCurrency", () => {
		it("should format USD correctly", () => {
			expect(formatCurrency(100, "USD")).toBe("$100.00");
		});

		it("should handle compact mode", () => {
			expect(formatCurrency(1500, "USD", true)).toBe("$1.5k");
		});

		it("should handle small amounts", () => {
			// Amounts < $1 get 4 decimal places by default
			expect(formatCurrency(0.5, "USD", false)).toBe("$0.5000");
			// Compact mode for small amounts still uses 4 decimal places
			expect(formatCurrency(0.5, "USD", true)).toBe("$0.5000");
			// Amounts >= $1 use 2 decimal places in compact mode
			expect(formatCurrency(1.5, "USD", true)).toBe("$1.50");
		});
	});

	describe("formatTokens", () => {
		it("should format large numbers", () => {
			expect(formatTokens(1000000)).toBe("1.00M");
			expect(formatTokens(15000)).toBe("15.0k");
		});

		it("should format medium numbers with compact notation", () => {
			expect(formatTokens(1234)).toBe("1.2k");
			expect(formatTokens(500)).toBe("500");
		});
	});

	describe("formatDuration", () => {
		it("should format milliseconds", () => {
			expect(formatDuration(500)).toBe("500ms");
		});

		it("should format seconds", () => {
			expect(formatDuration(5000)).toBe("5.0s");
		});

		it("should format minutes", () => {
			expect(formatDuration(120000)).toBe("2.0m");
		});
	});

	describe("formatDate", () => {
		it("should return Today for current date", () => {
			const today = new Date();
			expect(formatDate(today)).toBe("Today");
		});

		it("should return Yesterday", () => {
			const yesterday = new Date();
			yesterday.setDate(yesterday.getDate() - 1);
			expect(formatDate(yesterday)).toBe("Yesterday");
		});
	});

	describe("truncate", () => {
		it("should truncate long strings", () => {
			expect(truncate("Hello World", 5)).toBe("He...");
		});

		it("should not change short strings", () => {
			expect(truncate("Hi", 10)).toBe("Hi");
		});
	});

	describe("stringToColor", () => {
		it("should return a color for any string", () => {
			expect(stringToColor("test")).toMatch(/^#/);
		});

		it("should return consistent colors for same string", () => {
			expect(stringToColor("hello")).toBe(stringToColor("hello"));
		});
	});

	describe("getChartColors", () => {
		it("should return array of colors", () => {
			const colors = getChartColors(5);
			expect(colors).toHaveLength(5);
			colors.forEach((c) => expect(c).toMatch(/^#/));
		});
	});

	describe("calculatePercentage", () => {
		it("should calculate correctly", () => {
			expect(calculatePercentage(50, 100)).toBe(50);
			expect(calculatePercentage(25, 100)).toBe(25);
		});

		it("should handle zero total", () => {
			expect(calculatePercentage(50, 0)).toBe(0);
		});
	});

	describe("formatNumber", () => {
		it("should handle NaN", () => {
			expect(formatNumber(Number.NaN)).toBe("—");
		});

		it("should handle negative numbers", () => {
			expect(formatNumber(-5000)).toBe("-5k");
			expect(formatNumber(-1000000)).toBe("-1M");
		});

		it("should format millions with M suffix", () => {
			expect(formatNumber(2500000, 1)).toBe("2.5M");
		});

		it("should format with decimals for thousands", () => {
			expect(formatNumber(1234, 2)).toBe("1.23k");
		});
	});

	describe("formatCurrency", () => {
		it("should handle negative amounts", () => {
			expect(formatCurrency(-1500, "USD", true)).toBe("-$1.5k");
		});

		it("should handle NaN", () => {
			expect(formatCurrency(Number.NaN)).toBe("—");
		});

		it("should format small amounts in compact mode", () => {
			// Compact mode for amounts $1+$
			expect(formatCurrency(5, "USD", true)).toBe("$5.00");
		});

		it("should format sub-dollar amounts", () => {
			expect(formatCurrency(0.003, "USD")).toBe("$0.0030");
		});
	});

	describe("formatTokens", () => {
		it("should handle zero", () => {
			expect(formatTokens(0)).toBe("0");
		});

		it("should handle NaN", () => {
			expect(formatTokens(Number.NaN)).toBe("—");
		});

		it("should format millions", () => {
			expect(formatTokens(2500000)).toBe("2.50M");
		});

		it("should format less than 1000 normally", () => {
			expect(formatTokens(500)).toBe("500");
		});
	});

	describe("formatDuration", () => {
		it("should format hours", () => {
			expect(formatDuration(3600000)).toBe("1.0h");
		});

		it("should format exact minute boundary", () => {
			expect(formatDuration(60000)).toBe("1.0m");
		});
	});

	describe("formatDate short/medium/long", () => {
		it("should format recent dates", () => {
			const threeDaysAgo = new Date();
			threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
			expect(formatDate(threeDaysAgo)).toBe("3 days ago");
		});

		it("should format older dates with medium format", () => {
			const date = new Date(2024, 0, 15); // Jan 15 2024
			const result = formatDate(date, "medium");
			expect(result).toContain("Jan");
		});

		it("should format dates with short format", () => {
			const date = new Date(2024, 5, 15);
			const result = formatDate(date, "short");
			expect(result).toContain("Jun");
		});

		it("should format dates with long format", () => {
			const date = new Date(2024, 0, 15);
			const result = formatDate(date, "long");
			expect(result).toContain("January");
			expect(result).toContain("2024");
		});

		it("should handle string date input", () => {
			const result = formatDate("2024-06-15");
			expect(typeof result).toBe("string");
		});

		it("should handle numeric date input", () => {
			const timestamp = new Date(2024, 0, 15).getTime();
			const result = formatDate(timestamp);
			expect(typeof result).toBe("string");
		});
	});

	describe("formatTimeRange", () => {
		it("should format short session", () => {
			const start = new Date(2024, 0, 15, 10, 0, 0);
			const end = new Date(start.getTime() + 500); // 500ms later
			const result = formatTimeRange(start.toISOString(), end.toISOString());
			// Durations < 60s formatted as "Nms session" or "N.Ns session"
			expect(result).toContain("session");
		});

		it("should format longer session with time range", () => {
			const start = new Date(2024, 0, 15, 10, 0, 0);
			const end = new Date(2024, 0, 15, 11, 30, 0);
			const result = formatTimeRange(start, end);
			expect(result).toContain("10:00");
			expect(result).toContain("11:30");
		});
	});

	describe("getProviderDisplayName", () => {
		it("should map known providers", () => {
			expect(getProviderDisplayName("anthropic")).toBe("Anthropic");
			expect(getProviderDisplayName("openai")).toBe("OpenAI");
			expect(getProviderDisplayName("google")).toBe("Google");
			expect(getProviderDisplayName("ollama")).toBe("Ollama");
		});

		it("should capitalize unknown providers", () => {
			expect(getProviderDisplayName("mistral")).toBe("Mistral");
			expect(getProviderDisplayName("x")).toBe("X");
		});
	});

	describe("getModelShortName", () => {
		it("should remove organization prefix", () => {
			expect(getModelShortName("anthropic/claude-3")).toBe("claude-3");
			expect(getModelShortName("openai/gpt-4")).toBe("gpt-4");
		});

		it("should remove date suffix", () => {
			expect(getModelShortName("model-2024-01-15")).toBe("model");
		});

		it("should remove -latest suffix", () => {
			expect(getModelShortName("gpt-4-latest")).toBe("gpt-4");
		});

		it("should truncate long names", () => {
			const longName = "a".repeat(30);
			expect(getModelShortName(longName).length).toBeLessThanOrEqual(25);
		});
	});

	describe("stringToColor with index", () => {
		it("should use index when provided", () => {
			const color0 = stringToColor("test", 0);
			const color1 = stringToColor("test", 1);
			const color2 = stringToColor("test", 2);
			expect(color0).toMatch(/^#[0-9a-f]{6}$/i);
			expect(color1).toMatch(/^#[0-9a-f]{6}$/i);
			expect(color2).toMatch(/^#[0-9a-f]{6}$/i);
			// Different indices should give different colors
			expect(color0).not.toBe(color1);
		});
	});

	describe("getChartColors extended", () => {
		it("should generate more colors than base palette", () => {
			const colors = getChartColors(20);
			expect(colors).toHaveLength(20);
		});

		it("should return exactly base colors when count matches", () => {
			const colors = getChartColors(8);
			expect(colors).toHaveLength(8);
		});
	});

	describe("debounce", () => {
		it("should delay function execution", async () => {
			let count = 0;
			const fn = debounce(() => {
				count++;
			}, 10);
			fn();
			fn();
			fn();
			expect(count).toBe(0); // Not yet called
			await new Promise((r) => setTimeout(r, 50));
			expect(count).toBe(1); // Called only once
		});
	});

	describe("isEqual", () => {
		it("should compare equal objects", () => {
			expect(isEqual({ a: 1 }, { a: 1 })).toBe(true);
		});

		it("should compare different objects", () => {
			expect(isEqual({ a: 1 }, { a: 2 })).toBe(false);
		});

		it("should compare primitives", () => {
			expect(isEqual(1, 1)).toBe(true);
			expect(isEqual("a", "a")).toBe(true);
		});
	});

	describe("safeJsonParse", () => {
		it("should parse valid JSON", () => {
			expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
		});

		it("should return fallback for null", () => {
			expect(safeJsonParse(null, { default: true })).toEqual({ default: true });
		});

		it("should return fallback for invalid JSON", () => {
			expect(safeJsonParse("not json", { default: true })).toEqual({ default: true });
		});

		it("should return fallback for empty string", () => {
			expect(safeJsonParse("", [])).toEqual([]);
		});
	});
});
