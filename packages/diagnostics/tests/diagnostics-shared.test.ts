import { describe, expect, it } from "vitest";
import {
	extractTextContent,
	formatDuration,
	formatTimestamp,
	summarizeContent,
	summarizeText,
} from "../diagnostics-shared.js";

describe("diagnostics shared helpers", () => {
	it("formats timestamps in local datetime form", () => {
		expect(formatTimestamp(Date.UTC(2026, 3, 16, 11, 2, 3))).toMatch(/2026-04-16 \d{2}:02:03/);
	});

	it("formats durations across milliseconds, seconds, minutes, and hours", () => {
		expect(formatDuration(250)).toBe("250ms");
		expect(formatDuration(1_250)).toBe("1.3s");
		expect(formatDuration(12_000)).toBe("12s");
		expect(formatDuration(90_000)).toBe("1m30s");
		expect(formatDuration(3_600_000)).toBe("1h");
		expect(formatDuration(7_500_000)).toBe("2h5m");
	});

	it("extracts text content from strings and mixed content arrays", () => {
		expect(extractTextContent("plain text")).toBe("plain text");
		expect(extractTextContent(null)).toBe("");
		expect(
			extractTextContent([
				{ type: "text", text: "hello" },
				{ type: "image", url: "file://image.png" },
				{ type: "text", text: "world" },
				{ type: "text", text: 42 },
			]),
		).toBe("hello world");
	});

	it("summarizes text by trimming, normalizing whitespace, and truncating", () => {
		expect(summarizeText("   hello\n\nworld   ")).toBe("hello world");
		expect(summarizeText("   \n\t  ")).toBe("");
		expect(summarizeText("abcdef", 5)).toBe("abcd…");
	});

	it("summarizes structured content via text extraction", () => {
		expect(
			summarizeContent(
				[
					{ type: "text", text: "First line" },
					{ type: "text", text: "Second line" },
				],
				20,
			),
		).toBe("First line Second l…");
		expect(summarizeContent([{ type: "image", url: "file://image.png" }])).toBe("");
	});
});
