import { describe, expect, it } from "vitest";
import { buildPrompt, CASTE_PROMPTS } from "../extensions/ant-colony/prompts.js";
import type { Task } from "../extensions/ant-colony/types.js";

const mkTask = (overrides: Partial<Task> = {}): Task => ({
	id: "t-1",
	parentId: null,
	title: "Test task",
	description: "Do something",
	caste: "worker",
	status: "pending",
	priority: 3,
	files: [],
	claimedBy: null,
	result: null,
	error: null,
	spawnedTasks: [],
	createdAt: 0,
	startedAt: null,
	finishedAt: null,
	...overrides,
});

describe("CASTE_PROMPTS", () => {
	it("has all castes", () => {
		for (const c of ["scout", "worker", "soldier"] as const) {
			expect(typeof CASTE_PROMPTS[c]).toBe("string");
			expect(CASTE_PROMPTS[c].length).toBeGreaterThan(0);
		}
	});
});

describe("buildPrompt", () => {
	it("includes task title and description", () => {
		const r = buildPrompt(mkTask(), "", "System");
		expect(r).toContain("Test task");
		expect(r).toContain("Do something");
	});

	it("includes pheromone context", () => {
		const r = buildPrompt(mkTask(), "Found auth at src/auth.ts", "System");
		expect(r).toContain("Found auth at src/auth.ts");
	});

	it("includes files scope", () => {
		const r = buildPrompt(mkTask({ files: ["a.ts", "b.ts"] }), "", "System");
		expect(r).toContain("a.ts, b.ts");
	});

	it("includes turn limit when provided", () => {
		const r = buildPrompt(mkTask(), "", "System", 10);
		expect(r).toContain("10");
		expect(r).toContain("Turn Limit");
	});

	it("omits turn limit when not provided", () => {
		expect(buildPrompt(mkTask(), "", "System")).not.toContain("Turn Limit");
	});

	it("includes pre-loaded context", () => {
		const r = buildPrompt(mkTask({ context: "code snippet" }), "", "System");
		expect(r).toContain("code snippet");
	});

	it("adds Chinese hint for Chinese descriptions", () => {
		const r = buildPrompt(mkTask({ description: "修复登录问题" }), "", "System");
		expect(r).toContain("Chinese");
	});

	// Bio 3: Tandem foraging — tandem context
	it("includes tandem parent result when provided", () => {
		const r = buildPrompt(mkTask(), "", "System", 10, { parentResult: "Parent found auth module at src/auth.ts" });
		expect(r).toContain("Tandem Context");
		expect(r).toContain("Parent found auth module");
	});

	it("includes tandem prior error when provided", () => {
		const r = buildPrompt(mkTask(), "", "System", 10, { priorError: "TypeError: cannot read property" });
		expect(r).toContain("Prior Attempt Failed");
		expect(r).toContain("TypeError: cannot read property");
	});

	it("includes both tandem fields when provided", () => {
		const r = buildPrompt(mkTask(), "", "System", 10, {
			parentResult: "Scout found files",
			priorError: "Build failed",
		});
		expect(r).toContain("Tandem Context");
		expect(r).toContain("Prior Attempt Failed");
	});

	it("omits tandem sections when not provided", () => {
		const r = buildPrompt(mkTask(), "", "System", 10);
		expect(r).not.toContain("Tandem Context");
		expect(r).not.toContain("Prior Attempt Failed");
	});

	it("omits tandem sections when empty object", () => {
		const r = buildPrompt(mkTask(), "", "System", 10, {});
		expect(r).not.toContain("Tandem Context");
		expect(r).not.toContain("Prior Attempt Failed");
	});

	it("truncates long parent result", () => {
		const longResult = "x".repeat(5000);
		const r = buildPrompt(mkTask(), "", "System", 10, { parentResult: longResult });
		expect(r).toContain("Tandem Context");
		// Should be truncated to 3000 chars
		expect(r.length).toBeLessThan(longResult.length);
	});
});
