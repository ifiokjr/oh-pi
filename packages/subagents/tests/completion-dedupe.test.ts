import { describe, expect, it } from "vitest";
import { buildCompletionKey, getGlobalSeenMap, markSeenWithTtl } from "../completion-dedupe.js";

describe("buildCompletionKey", () => {
	it("uses id as canonical key when present", () => {
		const key = buildCompletionKey(
			{
				id: "run-123",
				agent: "reviewer",
				timestamp: 123,
			},
			"fallback",
		);
		expect(key).toBe("id:run-123");
	});

	it("builds deterministic fallback key when id is missing", () => {
		const a = buildCompletionKey(
			{
				agent: "reviewer",
				timestamp: 123,
				taskIndex: 1,
				totalTasks: 2,
				success: true,
			},
			"x",
		);
		const b = buildCompletionKey(
			{
				agent: "reviewer",
				timestamp: 123,
				taskIndex: 1,
				totalTasks: 2,
				success: true,
			},
			"x",
		);
		expect(a).toBe(b);
	});
});

describe("markSeenWithTtl", () => {
	it("returns true only for duplicates within ttl", () => {
		const seen = new Map<string, number>();
		const ttlMs = 1_000;
		expect(markSeenWithTtl(seen, "k", 100, ttlMs)).toBe(false);
		expect(markSeenWithTtl(seen, "k", 200, ttlMs)).toBe(true);
		expect(markSeenWithTtl(seen, "k", 1_201, ttlMs)).toBe(false);
	});
});

describe("getGlobalSeenMap", () => {
	it("returns the same map for the same global store key", () => {
		const a = getGlobalSeenMap("__test_seen_key__");
		a.set("x", 1);
		const b = getGlobalSeenMap("__test_seen_key__");
		expect(b.get("x")).toBe(1);
		expect(a).toBe(b);
	});
});
