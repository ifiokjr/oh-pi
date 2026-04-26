import { describe, expect, test } from "vitest";
import {
	buildImplementationPrefill,
	findDuplicateId,
	PLAN_MODE_END_OPTIONS,
	PLAN_MODE_START_OPTIONS,
	PLAN_MODE_SUMMARY_PROMPT,
	resolvePlanFilePath,
	resolveTaskAgentConcurrency,
} from "../utils";

describe("resolvePlanFilePath", () => {
	test("returns absolute path for relative input", () => {
		const resolved = resolvePlanFilePath("/tmp/project", "plans/next.md");
		expect(resolved).toBe("/tmp/project/plans/next.md");
	});

	test("returns null for empty input", () => {
		expect(resolvePlanFilePath("/tmp/project", "   ")).toBeNull();
	});
});

describe("resolveTaskAgentConcurrency", () => {
	test("defaults to two workers", () => {
		expect(resolveTaskAgentConcurrency(undefined)).toBe(2);
	});

	test("accepts integers in range", () => {
		expect(resolveTaskAgentConcurrency(1)).toBe(1);
		expect(resolveTaskAgentConcurrency(4)).toBe(4);
	});

	test("rejects fractional and out-of-range values", () => {
		expect(resolveTaskAgentConcurrency(1.5)).toBeNull();
		expect(resolveTaskAgentConcurrency(0)).toBeNull();
		expect(resolveTaskAgentConcurrency(5)).toBeNull();
	});
});

describe("findDuplicateId", () => {
	test("returns null when ids are unique", () => {
		expect(findDuplicateId(["a", "b", "c"])).toBeNull();
	});

	test("returns the first duplicate id", () => {
		expect(findDuplicateId(["a", "b", "a", "c"])).toBe("a");
	});
});

describe("plan mode review-style choices", () => {
	test("exposes start options matching review-style flow", () => {
		expect(PLAN_MODE_START_OPTIONS).toEqual(["Empty branch", "Current branch"]);
	});

	test("exposes concise end options", () => {
		expect(PLAN_MODE_END_OPTIONS).toEqual(["Exit", "Exit & summarize branch"]);
	});

	test("includes summarize-on-navigation instructions", () => {
		expect(PLAN_MODE_SUMMARY_PROMPT).toContain("switching from a planning branch back to implementation");
		expect(PLAN_MODE_SUMMARY_PROMPT).toContain("Ordered implementation steps");
	});
});

describe("buildImplementationPrefill", () => {
	test("returns a short implementation instruction", () => {
		expect(buildImplementationPrefill()).toContain("Implement the approved plan");
	});

	test("includes saved plan path when provided", () => {
		const prefill = buildImplementationPrefill("/tmp/plan.md");
		expect(prefill).toContain("Plan file: /tmp/plan.md");
		expect(prefill).toContain("\nImplement the approved plan in this file.");
	});
});
