import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { getStats, indexEntry, purgeAll, searchKB } from "../src/store.js";

const TEST_DB_DIR = join(homedir(), ".pi/context-kb-test");
const TEST_DB_PATH = join(TEST_DB_DIR, "sessions.db");

describe("store", () => {
	beforeEach(() => {
		// The store uses a singleton DB. We need to close and remove it between tests.
		// We can't easily rewire the singleton, so we purge instead.
		if (existsSync(TEST_DB_PATH)) {
			rmSync(TEST_DB_PATH, { force: true });
		}
		purgeAll();
	});

	it("indexes and searches entries", () => {
		indexEntry({
			sessionId: "s1",
			projectDir: "/project/a",
			content: "How do I use the context extension?",
			role: "user",
			timestamp: Date.now(),
		});
		indexEntry({
			sessionId: "s1",
			projectDir: "/project/a",
			content: "You install it and run /ctx:search.",
			role: "assistant",
			timestamp: Date.now(),
		});

		const results = searchKB("context extension", "/project/a", 5);
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results[0].role).toBe("user");
	});

	it("filters by project directory", () => {
		indexEntry({
			sessionId: "s1",
			projectDir: "/project/a",
			content: "Alpha context",
			role: "user",
			timestamp: Date.now(),
		});
		indexEntry({
			sessionId: "s2",
			projectDir: "/project/b",
			content: "Beta context",
			role: "user",
			timestamp: Date.now(),
		});

		const results = searchKB("Alpha", "/project/a", 5);
		expect(results.length).toBe(1);
		expect(results[0].content).toContain("Alpha");
	});

	it("purges all entries", () => {
		indexEntry({
			sessionId: "s1",
			projectDir: "/project/a",
			content: "Data to purge",
			role: "user",
			timestamp: Date.now(),
		});
		purgeAll();
		const stats = getStats();
		expect(stats.totalEntries).toBe(0);
	});
});
