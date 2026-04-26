import { buildCompletionKey, getGlobalSeenMap, markSeenWithTtl } from "../completion-dedupe.js";

describe(buildCompletionKey, () => {
	it("uses id as canonical key when present", () => {
		const key = buildCompletionKey({ agent: "reviewer", id: "run-123", timestamp: 123 }, "fallback");
		expect(key).toBe("id:run-123");
	});

	it("builds deterministic fallback key when id is missing", () => {
		const a = buildCompletionKey(
			{ agent: "reviewer", success: true, taskIndex: 1, timestamp: 123, totalTasks: 2 },
			"x",
		);
		const b = buildCompletionKey(
			{ agent: "reviewer", success: true, taskIndex: 1, timestamp: 123, totalTasks: 2 },
			"x",
		);
		expect(a).toBe(b);
	});
});

describe(markSeenWithTtl, () => {
	it("returns true only for duplicates within ttl", () => {
		const seen = new Map<string, number>();
		const ttlMs = 1000;
		expect(markSeenWithTtl(seen, "k", 100, ttlMs)).toBeFalsy();
		expect(markSeenWithTtl(seen, "k", 200, ttlMs)).toBeTruthy();
		expect(markSeenWithTtl(seen, "k", 1201, ttlMs)).toBeFalsy();
	});
});

describe(getGlobalSeenMap, () => {
	it("returns the same map for the same global store key", () => {
		const a = getGlobalSeenMap("__test_seen_key__");
		a.set("x", 1);
		const b = getGlobalSeenMap("__test_seen_key__");
		expect(b.get("x")).toBe(1);
		expect(a).toBe(b);
	});
});
