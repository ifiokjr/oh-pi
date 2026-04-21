/**
 * Budget Planner — Usage-aware resource allocation for the ant colony.
 *
 * Integrates with the usage-tracker extension via `pi.events` to access
 * real-time provider rate limits (Claude session/weekly %, Codex 5h/weekly %)
 * and session cost data. Uses this information to:
 *
 * 1. **Allocate per-caste budgets** — scouts get less (exploration is cheap),
 *    workers get the bulk, soldiers get a review slice.
 * 2. **Cap concurrency** — when rate limits are low, reduce parallel ants
 *    to avoid 429s.
 * 3. **Set per-ant cost ceilings** — individual ants get a maxCost derived
 *    from the remaining budget and rate limit headroom.
 * 4. **Inject budget context into prompts** — ants know how tight the budget
 *    is and can adjust their behavior (e.g. skip low-priority work).
 *
 * The planner is purely functional: it takes usage data and colony state,
 * returns an allocation. No side effects.
 */

import type { AntCaste, ColonyMetrics, ConcurrencyConfig } from "./types.js";

// ═══ Types ═══

/** Rate limit window from a provider (mirrors usage-tracker's RateWindow). */
export interface RateWindow {
	label: string;
	percentLeft: number;
	resetDescription: string | null;
}

/** Rate limit snapshot from a provider (mirrors usage-tracker's ProviderRateLimits). */
export interface ProviderRateLimits {
	provider: string;
	windows: RateWindow[];
	credits: number | null;
	probedAt: number;
	error: string | null;
}

/** Per-model usage data from the usage-tracker (mirrors usage-tracker's ModelUsage). */
export interface ModelUsageSnapshot {
	model: string;
	provider: string;
	turns: number;
	input: number;
	output: number;
	costTotal: number;
}

/** Aggregate usage data broadcast by the usage-tracker extension via pi.events. */
export interface UsageLimitsEvent {
	providers: Map<string, ProviderRateLimits> | Record<string, ProviderRateLimits>;
	sessionCost: number;
	perModel: Map<string, ModelUsageSnapshot> | Record<string, ModelUsageSnapshot>;
}

/** Budget allocation for a single caste. */
export interface CasteBudget {
	/** Maximum total cost this caste may spend (USD). */
	maxCost: number;
	/** Maximum cost per individual ant (USD). */
	maxCostPerAnt: number;
	/** Maximum recommended concurrent ants for this caste. */
	maxConcurrency: number;
	/** Maximum turns per ant (tighter budget → fewer turns). */
	maxTurns: number;
}

/** Full budget plan for a colony run. */
export interface RoutingTelemetrySnapshot {
	totalRoutes: number;
	avgLatencyMs: number;
	outcomeCounts: {
		claimed: number;
		completed: number;
		failed: number;
		escalated: number;
	};
	escalationReasonCounts: Record<string, number>;
}

export interface BudgetPlan {
	/** Per-caste allocations. */
	castes: Record<AntCaste, CasteBudget>;
	/** Recommended global max concurrency (overrides adaptive controller upper bound). */
	recommendedMaxConcurrency: number;
	/** Overall severity: how constrained the budget is. */
	severity: "comfortable" | "moderate" | "tight" | "critical";
	/** Lowest rate limit percentage across all providers/windows. */
	lowestRateLimitPct: number;
	/** Human-readable summary for prompt injection. */
	summary: string;
	/** Aggregated routing telemetry used for reporting and debugging. */
	routingTelemetry: RoutingTelemetrySnapshot;
}

// ═══ Constants ═══

/** Default turn counts per caste when budget is unconstrained. */
const DEFAULT_TURNS: Record<AntCaste, number> = {
	scout: 8,
	worker: 15,
	soldier: 8,
	drone: 1,
};

/** Budget share per caste (must sum to 1.0). */
const BUDGET_SHARES: Record<AntCaste, number> = {
	scout: 0.1,
	worker: 0.7,
	soldier: 0.2,
	drone: 0.0, // drones are free (execSync, no LLM)
};

/** Severity thresholds based on lowest rate limit %. */
const SEVERITY_THRESHOLDS = {
	critical: 10,
	tight: 25,
	moderate: 50,
} as const;

/** Concurrency caps per severity level. */
const CONCURRENCY_CAPS: Record<BudgetPlan["severity"], number> = {
	critical: 1,
	tight: 2,
	moderate: 3,
	comfortable: 6,
};

/** Per-ant cost caps per severity level (USD). */
const PER_ANT_COST_CAPS: Record<BudgetPlan["severity"], number> = {
	critical: 0.05,
	tight: 0.15,
	moderate: 0.3,
	comfortable: 0.5,
};

/** Turn multipliers per severity level. */
const TURN_MULTIPLIERS: Record<BudgetPlan["severity"], number> = {
	critical: 0.5,
	tight: 0.7,
	moderate: 0.85,
	comfortable: 1.0,
};

// ═══ Core logic ═══

/**
 * Extract the lowest remaining percentage across all provider rate limit windows.
 * Returns 100 if no rate limit data is available (assume unconstrained).
 */
export function getLowestRateLimitPct(
	providers: Map<string, ProviderRateLimits> | Record<string, ProviderRateLimits> | null | undefined,
): number {
	if (!providers) {
		return 100;
	}

	const entries = providers instanceof Map ? providers.values() : Object.values(providers);
	let lowest = 100;

	for (const provider of entries) {
		if (provider.error || provider.windows.length === 0) {
			continue;
		}
		for (const window of provider.windows) {
			if (window.percentLeft < lowest) {
				lowest = window.percentLeft;
			}
		}
	}

	return lowest;
}

/**
 * Determine budget severity from the lowest rate limit percentage
 * and the fraction of maxCost already spent.
 */
export function classifySeverity(
	lowestRateLimitPct: number,
	costSpent: number,
	maxCost: number | null,
): BudgetPlan["severity"] {
	// Rate-limit severity
	let rateSeverity: BudgetPlan["severity"] = "comfortable";
	if (lowestRateLimitPct < SEVERITY_THRESHOLDS.critical) {
		rateSeverity = "critical";
	} else if (lowestRateLimitPct < SEVERITY_THRESHOLDS.tight) {
		rateSeverity = "tight";
	} else if (lowestRateLimitPct < SEVERITY_THRESHOLDS.moderate) {
		rateSeverity = "moderate";
	}

	// Cost severity (only if a budget cap is set)
	let costSeverity: BudgetPlan["severity"] = "comfortable";
	if (maxCost != null && maxCost > 0) {
		const costPctUsed = (costSpent / maxCost) * 100;
		const costPctRemaining = 100 - costPctUsed;
		if (costPctRemaining < SEVERITY_THRESHOLDS.critical) {
			costSeverity = "critical";
		} else if (costPctRemaining < SEVERITY_THRESHOLDS.tight) {
			costSeverity = "tight";
		} else if (costPctRemaining < SEVERITY_THRESHOLDS.moderate) {
			costSeverity = "moderate";
		}
	}

	// Return the worse of the two
	const order: BudgetPlan["severity"][] = ["critical", "tight", "moderate", "comfortable"];
	const rateIdx = order.indexOf(rateSeverity);
	const costIdx = order.indexOf(costSeverity);
	return order[Math.min(rateIdx, costIdx)];
}

/**
 * Build a budget summary string for injection into ant prompts.
 */
export function buildBudgetSummary(
	severity: BudgetPlan["severity"],
	lowestRateLimitPct: number,
	costSpent: number,
	maxCost: number | null,
	tasksDone: number,
	tasksTotal: number,
	routingTelemetry?: RoutingTelemetrySnapshot,
): string {
	const parts: string[] = [];

	// Rate limit info
	if (lowestRateLimitPct < 100) {
		parts.push(`Provider rate limit: ~${lowestRateLimitPct}% remaining.`);
	}

	// Cost info
	if (maxCost != null && maxCost > 0) {
		const remaining = Math.max(0, maxCost - costSpent);
		parts.push(
			`Budget: $${costSpent.toFixed(2)} spent of $${maxCost.toFixed(2)} ($${remaining.toFixed(2)} remaining).`,
		);
	} else if (costSpent > 0) {
		parts.push(`Session cost so far: $${costSpent.toFixed(2)}.`);
	}

	// Progress
	if (tasksTotal > 0) {
		parts.push(`Progress: ${tasksDone}/${tasksTotal} tasks completed.`);
	}

	if (routingTelemetry && routingTelemetry.totalRoutes > 0) {
		parts.push(
			`Routing: ${routingTelemetry.totalRoutes} outcomes, avg latency ${routingTelemetry.avgLatencyMs}ms, escalations ${routingTelemetry.outcomeCounts.escalated}.`,
		);
		// Single-pass max-finder instead of sorting entire array for just the top entry
		let topEscalation: [string, number] | undefined;
		for (const entry of Object.entries(routingTelemetry.escalationReasonCounts)) {
			if (!topEscalation || entry[1] > topEscalation[1]) {
				topEscalation = entry;
			}
		}
		if (topEscalation) {
			parts.push(`Top escalation reason: ${topEscalation[0]} (${topEscalation[1]}).`);
		}
	}

	// Severity-specific guidance
	switch (severity) {
		case "critical":
			parts.push(
				"⚠️ CRITICAL: Resources nearly exhausted. Only execute essential high-priority tasks. Skip exploration, be extremely concise, minimize tool calls.",
			);
			break;
		case "tight":
			parts.push(
				"⚠️ Budget is tight. Be efficient — prefer targeted edits over broad exploration. Skip low-priority or nice-to-have tasks.",
			);
			break;
		case "moderate":
			parts.push("Budget is moderate. Be reasonably efficient — avoid unnecessary exploration but don't cut corners.");
			break;
		case "comfortable":
			// No extra guidance needed
			break;
	}

	return parts.join(" ");
}

/**
 * Plan the budget allocation for a colony based on current usage data.
 *
 * @param usageLimits - Rate limit and cost data from the usage-tracker extension (may be null if unavailable).
 * @param metrics - Current colony metrics (cost spent, tasks done, etc.).
 * @param maxCost - Colony-level cost cap (null = unlimited).
 * @param concurrency - Current concurrency config for max bounds.
 * @returns A complete budget plan with per-caste allocations.
 */
export function buildRoutingTelemetrySnapshot(metrics: ColonyMetrics): RoutingTelemetrySnapshot {
	const entries = metrics.routingTelemetry ?? [];
	const outcomeCounts = {
		claimed: 0,
		completed: 0,
		failed: 0,
		escalated: 0,
	};
	const escalationReasonCounts: Record<string, number> = {};
	let latencyTotal = 0;

	for (const entry of entries) {
		outcomeCounts[entry.outcome] += 1;
		latencyTotal += entry.latencyMs;
		for (const reason of entry.escalationReasons) {
			escalationReasonCounts[reason] = (escalationReasonCounts[reason] ?? 0) + 1;
		}
	}

	return {
		totalRoutes: entries.length,
		avgLatencyMs: entries.length > 0 ? Math.round(latencyTotal / entries.length) : 0,
		outcomeCounts,
		escalationReasonCounts,
	};
}

export function planBudget(
	usageLimits: UsageLimitsEvent | null,
	metrics: ColonyMetrics,
	maxCost: number | null,
	concurrency: ConcurrencyConfig,
): BudgetPlan {
	const lowestRateLimitPct = getLowestRateLimitPct(usageLimits?.providers ?? null);
	const costSpent = metrics.totalCost;
	const severity = classifySeverity(lowestRateLimitPct, costSpent, maxCost);

	// Remaining budget for allocation
	const remainingBudget = maxCost == null ? Number.POSITIVE_INFINITY : Math.max(0, maxCost - costSpent);

	// Recommended max concurrency (min of severity cap and hardware cap)
	const recommendedMaxConcurrency = Math.min(CONCURRENCY_CAPS[severity], concurrency.max);

	// Per-caste allocation
	const castes = {} as Record<AntCaste, CasteBudget>;

	for (const caste of ["scout", "worker", "soldier", "drone"] as AntCaste[]) {
		const share = BUDGET_SHARES[caste];
		const casteMaxCost = Number.isFinite(remainingBudget) ? remainingBudget * share : Number.POSITIVE_INFINITY;

		const baseTurns = DEFAULT_TURNS[caste];
		const adjustedTurns = Math.max(1, Math.floor(baseTurns * TURN_MULTIPLIERS[severity]));

		const maxCostPerAnt = caste === "drone" ? 0 : Math.min(PER_ANT_COST_CAPS[severity], casteMaxCost);

		// Concurrency: scouts and soldiers typically need fewer slots than workers
		let casteConcurrency: number;
		if (caste === "drone") {
			casteConcurrency = recommendedMaxConcurrency; // drones are free
		} else if (caste === "scout" || caste === "soldier") {
			casteConcurrency = Math.max(1, Math.ceil(recommendedMaxConcurrency * 0.5));
		} else {
			casteConcurrency = recommendedMaxConcurrency;
		}

		castes[caste] = {
			maxCost: casteMaxCost,
			maxCostPerAnt,
			maxConcurrency: casteConcurrency,
			maxTurns: adjustedTurns,
		};
	}

	const routingTelemetry = buildRoutingTelemetrySnapshot(metrics);
	const summary = buildBudgetSummary(
		severity,
		lowestRateLimitPct,
		costSpent,
		maxCost,
		metrics.tasksDone,
		metrics.tasksTotal,
		routingTelemetry,
	);

	return {
		castes,
		recommendedMaxConcurrency,
		severity,
		lowestRateLimitPct,
		summary,
		routingTelemetry,
	};
}

/**
 * Apply a budget plan's concurrency constraints to the adaptive concurrency config.
 * Returns a new config with `max` capped by the budget plan.
 */
export function applyConcurrencyCap(config: ConcurrencyConfig, plan: BudgetPlan): ConcurrencyConfig {
	const cappedMax = Math.min(config.max, plan.recommendedMaxConcurrency);
	return {
		...config,
		max: cappedMax,
		current: Math.min(config.current, cappedMax),
		optimal: Math.min(config.optimal, cappedMax),
	};
}

/**
 * Build the budget-awareness section for ant system prompts.
 * Returns empty string if budget is comfortable (no need to distract the ant).
 */
export function buildBudgetPromptSection(plan: BudgetPlan): string {
	if (plan.severity === "comfortable") {
		return "";
	}
	return `\n## ⚠️ Budget Awareness\n${plan.summary}\n`;
}
