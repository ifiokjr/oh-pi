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
  truncate,
  stringToColor,
  getChartColors,
  calculatePercentage,
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
});
