/**
 * Tests for the budget-planner module.
 *
 * Covers:
 * - Rate limit percentage extraction from various provider configurations
 * - Severity classification from rate limits and cost budget
 * - Budget summary generation for prompt injection
 * - Full budget plan allocation across castes
 * - Concurrency cap application
 * - Prompt section generation
 * - Edge cases: no data, empty providers, infinite budget, zero remaining
 */

import { describe, expect, it } from "vitest";

import {
	applyConcurrencyCap,
	type BudgetPlan,
	buildBudgetPromptSection,
	buildBudgetSummary,
	buildRoutingTelemetrySnapshot,
	type CasteBudget,
	classifySeverity,
	getLowestRateLimitPct,
	planBudget,
	type ProviderRateLimits,
	type UsageLimitsEvent,
} from "../extensions/ant-colony/budget-planner.js";
import type { ColonyMetrics, ConcurrencyConfig } from "../extensions/ant-colony/types.js";

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeProvider(
	name: string,
	windows: Array<{ label: string; percentLeft: number; resetDescription?: string | null }>,
	opts?: { error?: string; credits?: number },
): ProviderRateLimits {
	return {
		provider: name,
		windows: windows.map((w) => ({
			label: w.label,
			percentLeft: w.percentLeft,
			resetDescription: w.resetDescription ?? null,
		})),
		credits: opts?.credits ?? null,
		probedAt: Date.now(),
		error: opts?.error ?? null,
	};
}

function makeMetrics(overrides: Partial<ColonyMetrics> = {}): ColonyMetrics {
	return {
		tasksTotal: overrides.tasksTotal ?? 10,
		tasksDone: overrides.tasksDone ?? 3,
		tasksFailed: overrides.tasksFailed ?? 0,
		antsSpawned: overrides.antsSpawned ?? 5,
		totalCost: overrides.totalCost ?? 0.5,
		totalTokens: overrides.totalTokens ?? 15000,
		startTime: overrides.startTime ?? Date.now() - 60000,
		throughputHistory: overrides.throughputHistory ?? [],
		routingTelemetry: overrides.routingTelemetry ?? [],
	};
}

function makeConcurrency(overrides: Partial<ConcurrencyConfig> = {}): ConcurrencyConfig {
	return {
		current: overrides.current ?? 3,
		min: overrides.min ?? 1,
		max: overrides.max ?? 6,
		optimal: overrides.optimal ?? 3,
		history: overrides.history ?? [],
	};
}

function makeUsageLimits(providers: Record<string, ProviderRateLimits>, sessionCost = 0.5): UsageLimitsEvent {
	return {
		providers,
		sessionCost,
		perModel: {},
	};
}

// ─── getLowestRateLimitPct ───────────────────────────────────────────────────

describe("getLowestRateLimitPct", () => {
	it("returns 100 when providers is null", () => {
		expect(getLowestRateLimitPct(null)).toBe(100);
	});

	it("returns 100 when providers is undefined", () => {
		expect(getLowestRateLimitPct(undefined)).toBe(100);
	});

	it("returns 100 when providers is an empty Map", () => {
		expect(getLowestRateLimitPct(new Map())).toBe(100);
	});

	it("returns 100 when providers is an empty object", () => {
		expect(getLowestRateLimitPct({})).toBe(100);
	});

	it("returns 100 when all providers have errors", () => {
		const providers = {
			claude: makeProvider("claude", [], { error: "CLI not found" }),
		};
		expect(getLowestRateLimitPct(providers)).toBe(100);
	});

	it("returns 100 when providers have empty windows", () => {
		const providers = {
			claude: makeProvider("claude", []),
		};
		expect(getLowestRateLimitPct(providers)).toBe(100);
	});

	it("extracts the lowest percentage from a single provider", () => {
		const providers = {
			claude: makeProvider("claude", [
				{ label: "Session", percentLeft: 72 },
				{ label: "Weekly (all)", percentLeft: 45 },
			]),
		};
		expect(getLowestRateLimitPct(providers)).toBe(45);
	});

	it("extracts the lowest percentage across multiple providers", () => {
		const providers = {
			claude: makeProvider("claude", [
				{ label: "Session", percentLeft: 72 },
				{ label: "Weekly (all)", percentLeft: 45 },
			]),
			codex: makeProvider("codex", [
				{ label: "5-hour", percentLeft: 88 },
				{ label: "Weekly", percentLeft: 30 },
			]),
		};
		expect(getLowestRateLimitPct(providers)).toBe(30);
	});

	it("works with Map input", () => {
		const providers = new Map<string, ProviderRateLimits>();
		providers.set("claude", makeProvider("claude", [{ label: "Session", percentLeft: 15 }]));
		expect(getLowestRateLimitPct(providers)).toBe(15);
	});

	it("ignores providers with errors when others have data", () => {
		const providers = {
			claude: makeProvider("claude", [], { error: "timeout" }),
			codex: makeProvider("codex", [{ label: "5-hour", percentLeft: 60 }]),
		};
		expect(getLowestRateLimitPct(providers)).toBe(60);
	});

	it("handles zero percent correctly", () => {
		const providers = {
			claude: makeProvider("claude", [{ label: "Session", percentLeft: 0 }]),
		};
		expect(getLowestRateLimitPct(providers)).toBe(0);
	});

	it("handles 100 percent correctly", () => {
		const providers = {
			claude: makeProvider("claude", [{ label: "Session", percentLeft: 100 }]),
		};
		expect(getLowestRateLimitPct(providers)).toBe(100);
	});
});

// ─── classifySeverity ────────────────────────────────────────────────────────

describe("classifySeverity", () => {
	it("returns comfortable when rate limit is high and no cost cap", () => {
		expect(classifySeverity(80, 0, null)).toBe("comfortable");
	});

	it("returns comfortable when rate limit is high and cost is low", () => {
		expect(classifySeverity(80, 1, 10)).toBe("comfortable");
	});

	it("returns moderate when rate limit is between 25-50%", () => {
		expect(classifySeverity(35, 0, null)).toBe("moderate");
	});

	it("returns tight when rate limit is between 10-25%", () => {
		expect(classifySeverity(18, 0, null)).toBe("tight");
	});

	it("returns critical when rate limit is below 10%", () => {
		expect(classifySeverity(5, 0, null)).toBe("critical");
	});

	it("returns critical when rate limit is exactly 0", () => {
		expect(classifySeverity(0, 0, null)).toBe("critical");
	});

	it("returns moderate when cost is between 50-75% spent", () => {
		// Rate limit fine (80%), cost is 60% used → 40% remaining → moderate
		expect(classifySeverity(80, 6, 10)).toBe("moderate");
	});

	it("returns tight when cost is between 75-90% spent", () => {
		// Rate limit fine (80%), cost is 80% used → 20% remaining → tight
		expect(classifySeverity(80, 8, 10)).toBe("tight");
	});

	it("returns critical when cost is >90% spent", () => {
		// Rate limit fine (80%), cost is 95% used → 5% remaining → critical
		expect(classifySeverity(80, 9.5, 10)).toBe("critical");
	});

	it("uses the worse of rate limit and cost severity", () => {
		// Rate limit tight (20%), cost comfortable → tight
		expect(classifySeverity(20, 1, 10)).toBe("tight");
		// Rate limit comfortable (80%), cost critical → critical
		expect(classifySeverity(80, 9.5, 10)).toBe("critical");
	});

	it("handles null maxCost (unlimited budget)", () => {
		// Only rate limit matters when cost is unlimited
		expect(classifySeverity(35, 100, null)).toBe("moderate");
	});

	it("handles zero maxCost", () => {
		// maxCost=0 should be treated as if unlimited (avoid division by zero)
		expect(classifySeverity(80, 0, 0)).toBe("comfortable");
	});

	it("exact threshold boundaries", () => {
		// At exactly 10% → tight (not critical, since < 10 is critical)
		expect(classifySeverity(10, 0, null)).toBe("tight");
		// At exactly 25% → moderate
		expect(classifySeverity(25, 0, null)).toBe("moderate");
		// At exactly 50% → comfortable
		expect(classifySeverity(50, 0, null)).toBe("comfortable");
	});
});

// ─── buildBudgetSummary ──────────────────────────────────────────────────────

describe("buildRoutingTelemetrySnapshot", () => {
	it("aggregates latency, outcomes, and escalation reasons", () => {
		const metrics = makeMetrics({
			routingTelemetry: [
				{
					taskId: "t1",
					caste: "worker",
					outcome: "completed",
					latencyMs: 250,
					escalationReasons: [],
					timestamp: Date.now(),
				},
				{
					taskId: "t2",
					caste: "worker",
					outcome: "escalated",
					latencyMs: 750,
					escalationReasons: ["risk_flag", "low_confidence"],
					timestamp: Date.now(),
				},
			],
		});

		const snapshot = buildRoutingTelemetrySnapshot(metrics);
		expect(snapshot.totalRoutes).toBe(2);
		expect(snapshot.avgLatencyMs).toBe(500);
		expect(snapshot.outcomeCounts.completed).toBe(1);
		expect(snapshot.outcomeCounts.escalated).toBe(1);
		expect(snapshot.escalationReasonCounts.risk_flag).toBe(1);
		expect(snapshot.escalationReasonCounts.low_confidence).toBe(1);
	});
});

describe("buildBudgetSummary", () => {
	it("includes rate limit info when below 100%", () => {
		const summary = buildBudgetSummary("moderate", 45, 0, null, 0, 0);
		expect(summary).toContain("45% remaining");
	});

	it("omits rate limit info when at 100%", () => {
		const summary = buildBudgetSummary("comfortable", 100, 0, null, 0, 0);
		expect(summary).not.toContain("rate limit");
	});

	it("includes cost info when maxCost is set", () => {
		const summary = buildBudgetSummary("moderate", 60, 3, 10, 0, 0);
		expect(summary).toContain("$3.00 spent");
		expect(summary).toContain("$10.00");
		expect(summary).toContain("$7.00 remaining");
	});

	it("shows session cost when no maxCost but cost > 0", () => {
		const summary = buildBudgetSummary("comfortable", 100, 2.5, null, 0, 0);
		expect(summary).toContain("$2.50");
	});

	it("includes progress when tasksTotal > 0", () => {
		const summary = buildBudgetSummary("comfortable", 100, 0, null, 5, 12);
		expect(summary).toContain("5/12");
	});

	it("includes critical warning for critical severity", () => {
		const summary = buildBudgetSummary("critical", 5, 9.5, 10, 8, 10);
		expect(summary).toContain("CRITICAL");
		expect(summary).toContain("essential");
	});

	it("includes tight warning for tight severity", () => {
		const summary = buildBudgetSummary("tight", 18, 7, 10, 5, 10);
		expect(summary).toContain("tight");
		expect(summary).toContain("efficient");
	});

	it("includes moderate guidance for moderate severity", () => {
		const summary = buildBudgetSummary("moderate", 35, 4, 10, 3, 10);
		expect(summary).toContain("moderate");
	});

	it("includes routing telemetry rollup when available", () => {
		const summary = buildBudgetSummary("moderate", 35, 4, 10, 3, 10, {
			totalRoutes: 4,
			avgLatencyMs: 420,
			outcomeCounts: { claimed: 1, completed: 2, failed: 0, escalated: 1 },
			escalationReasonCounts: { low_confidence: 1 },
		});
		expect(summary).toContain("Routing: 4 outcomes");
		expect(summary).toContain("420ms");
		expect(summary).toContain("Top escalation reason: low_confidence (1)");
	});

	it("no severity guidance for comfortable", () => {
		const summary = buildBudgetSummary("comfortable", 80, 1, 10, 2, 10);
		expect(summary).not.toContain("CRITICAL");
		expect(summary).not.toContain("tight");
		expect(summary).not.toContain("moderate");
	});
});

// ─── planBudget ──────────────────────────────────────────────────────────────

describe("planBudget", () => {
	it("returns a valid plan with all caste allocations", () => {
		const plan = planBudget(null, makeMetrics(), null, makeConcurrency());
		expect(plan.castes.scout).toBeDefined();
		expect(plan.castes.worker).toBeDefined();
		expect(plan.castes.soldier).toBeDefined();
		expect(plan.castes.drone).toBeDefined();
	});

	it("drone caste always has zero maxCostPerAnt", () => {
		const plan = planBudget(null, makeMetrics(), 10, makeConcurrency());
		expect(plan.castes.drone.maxCostPerAnt).toBe(0);
	});

	it("drone caste always has maxCost of 0 (0% share)", () => {
		const plan = planBudget(null, makeMetrics({ totalCost: 0 }), 10, makeConcurrency());
		expect(plan.castes.drone.maxCost).toBe(0);
	});

	it("worker caste gets the largest budget share", () => {
		const plan = planBudget(null, makeMetrics({ totalCost: 0 }), 10, makeConcurrency());
		expect(plan.castes.worker.maxCost).toBeGreaterThan(plan.castes.scout.maxCost);
		expect(plan.castes.worker.maxCost).toBeGreaterThan(plan.castes.soldier.maxCost);
	});

	it("returns comfortable severity when no usage data", () => {
		const plan = planBudget(null, makeMetrics(), null, makeConcurrency());
		expect(plan.severity).toBe("comfortable");
		expect(plan.lowestRateLimitPct).toBe(100);
	});

	it("reduces concurrency when rate limits are tight", () => {
		const limits = makeUsageLimits({
			claude: makeProvider("claude", [{ label: "Session", percentLeft: 18 }]),
		});
		const plan = planBudget(limits, makeMetrics(), null, makeConcurrency({ max: 6 }));
		expect(plan.severity).toBe("tight");
		expect(plan.recommendedMaxConcurrency).toBeLessThanOrEqual(2);
	});

	it("reduces concurrency to 1 when rate limits are critical", () => {
		const limits = makeUsageLimits({
			claude: makeProvider("claude", [{ label: "Session", percentLeft: 5 }]),
		});
		const plan = planBudget(limits, makeMetrics(), null, makeConcurrency({ max: 6 }));
		expect(plan.severity).toBe("critical");
		expect(plan.recommendedMaxConcurrency).toBe(1);
	});

	it("does not exceed hardware concurrency cap", () => {
		const plan = planBudget(null, makeMetrics(), null, makeConcurrency({ max: 2 }));
		expect(plan.recommendedMaxConcurrency).toBeLessThanOrEqual(2);
	});

	it("reduces turns when budget is tight", () => {
		const limits = makeUsageLimits({
			claude: makeProvider("claude", [{ label: "Session", percentLeft: 18 }]),
		});
		const plan = planBudget(limits, makeMetrics(), null, makeConcurrency());
		expect(plan.castes.worker.maxTurns).toBeLessThan(15); // default is 15
		expect(plan.castes.scout.maxTurns).toBeLessThan(8); // default is 8
	});

	it("turns are halved when budget is critical", () => {
		const limits = makeUsageLimits({
			claude: makeProvider("claude", [{ label: "Session", percentLeft: 3 }]),
		});
		const plan = planBudget(limits, makeMetrics(), null, makeConcurrency());
		expect(plan.castes.worker.maxTurns).toBeLessThanOrEqual(8); // 15 * 0.5 = 7.5 → 7
		expect(plan.castes.scout.maxTurns).toBeLessThanOrEqual(4); // 8 * 0.5 = 4
	});

	it("per-ant cost is capped lower when budget is tight", () => {
		const comfyPlan = planBudget(null, makeMetrics(), 10, makeConcurrency());
		const limits = makeUsageLimits({
			claude: makeProvider("claude", [{ label: "Session", percentLeft: 18 }]),
		});
		const tightPlan = planBudget(limits, makeMetrics(), 10, makeConcurrency());
		expect(tightPlan.castes.worker.maxCostPerAnt).toBeLessThan(comfyPlan.castes.worker.maxCostPerAnt);
	});

	it("allocates remaining budget correctly when some is spent", () => {
		const plan = planBudget(null, makeMetrics({ totalCost: 7 }), 10, makeConcurrency());
		// Remaining is $3, worker gets 70% = $2.10
		expect(plan.castes.worker.maxCost).toBeCloseTo(2.1, 1);
		// Scout gets 10% = $0.30
		expect(plan.castes.scout.maxCost).toBeCloseTo(0.3, 1);
	});

	it("returns zero remaining when budget is fully spent", () => {
		const plan = planBudget(null, makeMetrics({ totalCost: 10 }), 10, makeConcurrency());
		expect(plan.castes.worker.maxCost).toBe(0);
		expect(plan.castes.scout.maxCost).toBe(0);
		expect(plan.severity).toBe("critical");
	});

	it("handles infinite budget (null maxCost)", () => {
		const plan = planBudget(null, makeMetrics(), null, makeConcurrency());
		expect(plan.castes.worker.maxCost).toBe(Number.POSITIVE_INFINITY);
		expect(plan.castes.scout.maxCost).toBe(Number.POSITIVE_INFINITY);
	});

	it("includes a non-empty summary", () => {
		const limits = makeUsageLimits({
			claude: makeProvider("claude", [{ label: "Session", percentLeft: 40 }]),
		});
		const plan = planBudget(limits, makeMetrics(), 5, makeConcurrency());
		expect(plan.summary.length).toBeGreaterThan(0);
		expect(plan.summary).toContain("40% remaining");
	});

	it("scouts/soldiers get lower concurrency than workers", () => {
		const plan = planBudget(null, makeMetrics(), null, makeConcurrency({ max: 6 }));
		expect(plan.castes.scout.maxConcurrency).toBeLessThanOrEqual(plan.castes.worker.maxConcurrency);
		expect(plan.castes.soldier.maxConcurrency).toBeLessThanOrEqual(plan.castes.worker.maxConcurrency);
	});

	it("uses cost-based severity when cost is worse than rate limits", () => {
		// Rate limits fine (80%), but 95% of cost budget used
		const plan = planBudget(
			makeUsageLimits({
				claude: makeProvider("claude", [{ label: "Session", percentLeft: 80 }]),
			}),
			makeMetrics({ totalCost: 9.5 }),
			10,
			makeConcurrency(),
		);
		expect(plan.severity).toBe("critical");
	});

	it("drone turns are always 1 regardless of severity", () => {
		const limits = makeUsageLimits({
			claude: makeProvider("claude", [{ label: "Session", percentLeft: 3 }]),
		});
		const plan = planBudget(limits, makeMetrics(), null, makeConcurrency());
		// 1 * 0.5 = 0.5 → floor to 0 → clamped to 1
		expect(plan.castes.drone.maxTurns).toBe(1);
	});
});

// ─── applyConcurrencyCap ─────────────────────────────────────────────────────

describe("applyConcurrencyCap", () => {
	it("caps max to the plan recommendation", () => {
		const config = makeConcurrency({ current: 4, max: 6, optimal: 4 });
		const plan: BudgetPlan = {
			castes: {} as Record<string, CasteBudget>,
			recommendedMaxConcurrency: 2,
			severity: "tight",
			lowestRateLimitPct: 18,
			summary: "",
		};
		const result = applyConcurrencyCap(config, plan);
		expect(result.max).toBe(2);
	});

	it("caps current to the new max", () => {
		const config = makeConcurrency({ current: 5, max: 6 });
		const plan: BudgetPlan = {
			castes: {} as Record<string, CasteBudget>,
			recommendedMaxConcurrency: 3,
			severity: "moderate",
			lowestRateLimitPct: 40,
			summary: "",
		};
		const result = applyConcurrencyCap(config, plan);
		expect(result.current).toBeLessThanOrEqual(3);
	});

	it("caps optimal to the new max", () => {
		const config = makeConcurrency({ current: 2, max: 6, optimal: 5 });
		const plan: BudgetPlan = {
			castes: {} as Record<string, CasteBudget>,
			recommendedMaxConcurrency: 3,
			severity: "moderate",
			lowestRateLimitPct: 40,
			summary: "",
		};
		const result = applyConcurrencyCap(config, plan);
		expect(result.optimal).toBeLessThanOrEqual(3);
	});

	it("does not change config when plan max is higher", () => {
		const config = makeConcurrency({ current: 2, max: 3, optimal: 2 });
		const plan: BudgetPlan = {
			castes: {} as Record<string, CasteBudget>,
			recommendedMaxConcurrency: 6,
			severity: "comfortable",
			lowestRateLimitPct: 80,
			summary: "",
		};
		const result = applyConcurrencyCap(config, plan);
		expect(result.max).toBe(3); // hardware cap wins
		expect(result.current).toBe(2);
	});

	it("preserves min and history", () => {
		const config = makeConcurrency({
			min: 1,
			history: [
				{
					timestamp: 1,
					concurrency: 2,
					cpuLoad: 0.3,
					memFree: 8e9,
					throughput: 1,
				},
			],
		});
		const plan: BudgetPlan = {
			castes: {} as Record<string, CasteBudget>,
			recommendedMaxConcurrency: 2,
			severity: "tight",
			lowestRateLimitPct: 20,
			summary: "",
		};
		const result = applyConcurrencyCap(config, plan);
		expect(result.min).toBe(1);
		expect(result.history).toHaveLength(1);
	});
});

// ─── buildBudgetPromptSection ────────────────────────────────────────────────

describe("buildBudgetPromptSection", () => {
	it("returns empty string for comfortable severity", () => {
		const plan: BudgetPlan = {
			castes: {} as Record<string, CasteBudget>,
			recommendedMaxConcurrency: 4,
			severity: "comfortable",
			lowestRateLimitPct: 80,
			summary: "All good.",
		};
		expect(buildBudgetPromptSection(plan)).toBe("");
	});

	it("returns non-empty string for tight severity", () => {
		const plan: BudgetPlan = {
			castes: {} as Record<string, CasteBudget>,
			recommendedMaxConcurrency: 2,
			severity: "tight",
			lowestRateLimitPct: 18,
			summary: "Budget is tight. Be efficient.",
		};
		const section = buildBudgetPromptSection(plan);
		expect(section).toContain("Budget Awareness");
		expect(section).toContain("tight");
	});

	it("returns non-empty string for critical severity", () => {
		const plan: BudgetPlan = {
			castes: {} as Record<string, CasteBudget>,
			recommendedMaxConcurrency: 1,
			severity: "critical",
			lowestRateLimitPct: 5,
			summary: "CRITICAL: Resources nearly exhausted.",
		};
		const section = buildBudgetPromptSection(plan);
		expect(section).toContain("Budget Awareness");
		expect(section).toContain("CRITICAL");
	});

	it("returns non-empty string for moderate severity", () => {
		const plan: BudgetPlan = {
			castes: {} as Record<string, CasteBudget>,
			recommendedMaxConcurrency: 3,
			severity: "moderate",
			lowestRateLimitPct: 40,
			summary: "Budget is moderate.",
		};
		const section = buildBudgetPromptSection(plan);
		expect(section).toContain("Budget Awareness");
	});
});

// ─── Integration: full plan → prompt → concurrency pipeline ──────────────────

describe("integration: plan → prompt → concurrency pipeline", () => {
	it("comfortable scenario: no constraints applied", () => {
		const plan = planBudget(null, makeMetrics({ totalCost: 0 }), null, makeConcurrency({ max: 6 }));
		expect(plan.severity).toBe("comfortable");
		expect(plan.recommendedMaxConcurrency).toBe(6);
		expect(buildBudgetPromptSection(plan)).toBe("");

		const concurrency = applyConcurrencyCap(makeConcurrency({ max: 6, current: 4 }), plan);
		expect(concurrency.max).toBe(6);
		expect(concurrency.current).toBe(4);
	});

	it("tight scenario: reduced concurrency and turns, prompt injected", () => {
		const limits = makeUsageLimits({
			claude: makeProvider("claude", [
				{ label: "Session", percentLeft: 50 },
				{ label: "Weekly (all)", percentLeft: 18 },
			]),
		});
		const plan = planBudget(limits, makeMetrics({ totalCost: 2 }), 5, makeConcurrency({ max: 6 }));
		expect(plan.severity).toBe("tight");
		expect(plan.recommendedMaxConcurrency).toBeLessThanOrEqual(2);
		expect(plan.castes.worker.maxTurns).toBeLessThan(15);
		expect(buildBudgetPromptSection(plan)).toContain("Budget Awareness");

		const concurrency = applyConcurrencyCap(makeConcurrency({ max: 6, current: 5 }), plan);
		expect(concurrency.max).toBeLessThanOrEqual(2);
		expect(concurrency.current).toBeLessThanOrEqual(2);
	});

	it("critical scenario: minimal resources, strong prompt warning", () => {
		const limits = makeUsageLimits({
			claude: makeProvider("claude", [{ label: "Session", percentLeft: 3 }]),
			codex: makeProvider("codex", [{ label: "Weekly", percentLeft: 7 }]),
		});
		const plan = planBudget(limits, makeMetrics({ totalCost: 4.8 }), 5, makeConcurrency({ max: 6 }));
		expect(plan.severity).toBe("critical");
		expect(plan.recommendedMaxConcurrency).toBe(1);
		expect(plan.castes.worker.maxTurns).toBeLessThanOrEqual(8);
		expect(plan.castes.worker.maxCostPerAnt).toBeLessThanOrEqual(0.05);

		const section = buildBudgetPromptSection(plan);
		expect(section).toContain("CRITICAL");

		const concurrency = applyConcurrencyCap(makeConcurrency({ max: 6, current: 4 }), plan);
		expect(concurrency.max).toBe(1);
		expect(concurrency.current).toBe(1);
	});

	it("budget nearly exhausted overrides high rate limits", () => {
		// Plenty of rate limit headroom but money is almost gone
		const limits = makeUsageLimits({
			claude: makeProvider("claude", [{ label: "Session", percentLeft: 90 }]),
		});
		const plan = planBudget(limits, makeMetrics({ totalCost: 9.8 }), 10, makeConcurrency({ max: 6 }));
		expect(plan.severity).toBe("critical");
		// Remaining $0.20 — worker gets 70% = $0.14
		expect(plan.castes.worker.maxCost).toBeCloseTo(0.14, 1);
	});

	it("mixed provider data: uses the worst window", () => {
		const limits = makeUsageLimits({
			claude: makeProvider("claude", [
				{ label: "Session", percentLeft: 80 },
				{ label: "Weekly (all)", percentLeft: 60 },
			]),
			codex: makeProvider("codex", [
				{ label: "5-hour", percentLeft: 12 },
				{ label: "Weekly", percentLeft: 90 },
			]),
		});
		const plan = planBudget(limits, makeMetrics(), null, makeConcurrency());
		expect(plan.lowestRateLimitPct).toBe(12);
		expect(plan.severity).toBe("tight");
	});
});
