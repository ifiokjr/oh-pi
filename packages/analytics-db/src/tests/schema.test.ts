/**
 * Analytics DB — Unit Tests
 *
 * Tests for utility functions and schema definitions that don't require SQLite.
 */

import { formatDate, formatDateBucket, formatHourBucket, formatMonthBucket, formatWeekBucket } from "../db.js";
import {
	codebaseDailyStats,
	codebases,
	dailyStats,
	hourlyStats,
	misspellings,
	modelDailyStats,
	models,
	providers,
	rateLimitSnapshots,
	sessionEvents,
	sessions,
	turns,
	wordFrequencies,
} from "../schema.js";

// ─── formatDateBucket ────────────────────────────────────────────────────────

describe(formatDateBucket, () => {
	it("formats a Date to YYYY-MM-DD", () => {
		expect(formatDateBucket(new Date("2024-07-15T12:00:00Z"))).toBe("2024-07-15");
	});

	it("pads single-digit months and days", () => {
		expect(formatDateBucket(new Date("2024-01-05T08:00:00Z"))).toBe("2024-01-05");
	});

	it("defaults to current date when called without arguments", () => {
		const result = formatDateBucket();
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("handles year boundaries correctly", () => {
		expect(formatDateBucket(new Date("2023-12-31"))).toBe("2023-12-31");
		expect(formatDateBucket(new Date("2024-01-01"))).toBe("2024-01-01");
	});
});

// ─── formatHourBucket ────────────────────────────────────────────────────────

describe(formatHourBucket, () => {
	it("formats to YYYY-MM-DD HH:00:00", () => {
		expect(formatHourBucket(new Date("2024-07-15T14:30:00Z"))).toContain("2024-07-15 14:00:00");
	});

	it("pads hours less than 10", () => {
		const result = formatHourBucket(new Date("2024-03-01T03:15:00Z"));
		expect(result).toContain(" 03:00:00");
	});

	it("defaults to current time when called without arguments", () => {
		const result = formatHourBucket();
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:00:00$/);
	});
});

// ─── formatWeekBucket ────────────────────────────────────────────────────────

describe(formatWeekBucket, () => {
	it("returns YYYY-Wxx format", () => {
		const result = formatWeekBucket(new Date("2024-01-08T00:00:00Z"));
		expect(result).toMatch(/^\d{4}-W\d{2}$/);
	});

	it("defaults to current week when called without arguments", () => {
		const result = formatWeekBucket();
		expect(result).toMatch(/^\d{4}-W\d{2}$/);
	});
});

// ─── formatMonthBucket ───────────────────────────────────────────────────────

describe(formatMonthBucket, () => {
	it("returns YYYY-MM format", () => {
		expect(formatMonthBucket(new Date("2024-07-15"))).toBe("2024-07");
	});

	it("pads single-digit months", () => {
		expect(formatMonthBucket(new Date("2024-01-15"))).toBe("2024-01");
	});
});

// ─── formatDate ────────────────────────────────────────────────────────────────

describe(formatDate, () => {
	it("formats a Date to YYYY-MM-DD", () => {
		expect(formatDate(new Date("2024-12-25"))).toBe("2024-12-25");
	});

	it("pads single-digit months", () => {
		expect(formatDate(new Date("2024-03-05"))).toBe("2024-03-05");
	});
});

// ─── Schema Table Definitions ───────────────────────────────────────────────

describe("schema: sessions", () => {
	it("has all required columns", () => {
		const columns = Object.keys(sessions);
		expect(columns).toContain("id");
		expect(columns).toContain("startedAt");
		expect(columns).toContain("endedAt");
		expect(columns).toContain("version");
		expect(columns).toContain("machineId");
		expect(columns).toContain("os");
	});
});

describe("schema: codebases", () => {
	it("has all required columns", () => {
		const columns = Object.keys(codebases);
		expect(columns).toContain("id");
		expect(columns).toContain("name");
		expect(columns).toContain("absolutePath");
		expect(columns).toContain("totalTurns");
		expect(columns).toContain("totalCost");
	});
});

describe("schema: providers", () => {
	it("has all required columns", () => {
		const columns = Object.keys(providers);
		expect(columns).toContain("id");
		expect(columns).toContain("displayName");
		expect(columns).toContain("totalTurns");
		expect(columns).toContain("totalCost");
	});
});

describe("schema: models", () => {
	it("has all required columns", () => {
		const columns = Object.keys(models);
		expect(columns).toContain("id");
		expect(columns).toContain("providerId");
		expect(columns).toContain("displayName");
		expect(columns).toContain("totalTurns");
		expect(columns).toContain("totalCost");
		expect(columns).toContain("totalInputTokens");
		expect(columns).toContain("totalOutputTokens");
	});
});

describe("schema: turns", () => {
	it("has all required columns", () => {
		const columns = Object.keys(turns);
		expect(columns).toContain("id");
		expect(columns).toContain("sessionId");
		expect(columns).toContain("modelId");
		expect(columns).toContain("inputTokens");
		expect(columns).toContain("outputTokens");
		expect(columns).toContain("costTotal");
		expect(columns).toContain("durationMs");
	});

	it("has emotional analysis columns", () => {
		const columns = Object.keys(turns);
		expect(columns).toContain("emotionalScore");
		expect(columns).toContain("emotionalLabels");
		expect(columns).toContain("contentPreview");
		expect(columns).toContain("contentHash");
	});
});

describe("schema: rateLimitSnapshots", () => {
	it("has all required columns", () => {
		const columns = Object.keys(rateLimitSnapshots);
		expect(columns).toContain("id");
		expect(columns).toContain("providerId");
		expect(columns).toContain("percentRemaining");
		expect(columns).toContain("recordedAt");
	});
});

describe("schema: dailyStats", () => {
	it("has all required columns", () => {
		const columns = Object.keys(dailyStats);
		expect(columns).toContain("dayBucket");
		expect(columns).toContain("totalTurns");
		expect(columns).toContain("totalCost");
		expect(columns).toContain("totalInputTokens");
		expect(columns).toContain("totalOutputTokens");
	});
});

describe("schema: hourlyStats", () => {
	it("has all required columns", () => {
		const columns = Object.keys(hourlyStats);
		expect(columns).toContain("hourBucket");
		expect(columns).toContain("totalTurns");
	});
});

describe("schema: modelDailyStats", () => {
	it("has all required columns", () => {
		const columns = Object.keys(modelDailyStats);
		expect(columns).toContain("modelId");
		expect(columns).toContain("dayBucket");
		expect(columns).toContain("totalTurns");
		expect(columns).toContain("totalCost");
	});
});

describe("schema: codebaseDailyStats", () => {
	it("has all required columns", () => {
		const columns = Object.keys(codebaseDailyStats);
		expect(columns).toContain("codebaseId");
		expect(columns).toContain("dayBucket");
		expect(columns).toContain("totalTurns");
		expect(columns).toContain("totalCost");
	});
});

describe("schema: wordFrequencies", () => {
	it("has all required columns", () => {
		const columns = Object.keys(wordFrequencies);
		expect(columns).toContain("id");
		expect(columns).toContain("modelId");
		expect(columns).toContain("dayBucket");
		expect(columns).toContain("word");
		expect(columns).toContain("count");
	});
});

describe("schema: misspellings", () => {
	it("has all required columns", () => {
		const columns = Object.keys(misspellings);
		expect(columns).toContain("id");
		expect(columns).toContain("modelId");
		expect(columns).toContain("dayBucket");
		expect(columns).toContain("misspelledWord");
		expect(columns).toContain("correctedWord");
		expect(columns).toContain("occurrenceCount");
	});
});

describe("schema: sessionEvents", () => {
	it("has all required columns", () => {
		const columns = Object.keys(sessionEvents);
		expect(columns).toContain("id");
		expect(columns).toContain("sessionId");
		expect(columns).toContain("eventType");
		expect(columns).toContain("isStreaming");
		expect(columns).toContain("status");
	});
});
