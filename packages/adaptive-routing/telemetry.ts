import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
	AdaptiveRoutingStats,
	AdaptiveRoutingTelemetryConfig,
	AdaptiveRoutingTelemetryEvent,
	RouteDecision,
	RouteFeedbackCategory,
} from "./types.js";

export function getAdaptiveRoutingEventsPath(): string {
	return join(getAgentDir(), "adaptive-routing", "events.jsonl");
}

export function getAdaptiveRoutingAggregatesPath(): string {
	return join(getAgentDir(), "adaptive-routing", "aggregates.json");
}

export function shouldPersistTelemetry(config: AdaptiveRoutingTelemetryConfig): boolean {
	return config.mode !== "off";
}

export function hashPrompt(prompt: string): string {
	return createHash("sha256").update(prompt).digest("hex");
}

export function createDecisionId(): string {
	return randomUUID();
}

// In-memory stats accumulator so we don't re-read the entire events file on every append.
let memoryStats: AdaptiveRoutingStats | undefined;

export function appendTelemetryEvent(
	config: AdaptiveRoutingTelemetryConfig,
	event: AdaptiveRoutingTelemetryEvent,
): void {
	if (!shouldPersistTelemetry(config)) {
		return;
	}

	const eventsPath = getAdaptiveRoutingEventsPath();
	try {
		mkdirSync(dirname(eventsPath), { recursive: true });
		// Append-only write — never read the entire file back just to add one line.
		appendFileSync(eventsPath, `${JSON.stringify(event)}\n`, "utf8");

		// Update in-memory stats incrementally instead of re-reading the whole file.
		if (!memoryStats) {
			memoryStats = readAggregatesFromDisk();
		}
		updateStatsIncremental(memoryStats, event);
		writeAggregates(memoryStats);
	} catch {
		// Telemetry is best-effort only.
	}
}

function readAggregatesFromDisk(): AdaptiveRoutingStats {
	const aggregatesPath = getAdaptiveRoutingAggregatesPath();
	try {
		if (!existsSync(aggregatesPath)) {
			return emptyStats();
		}
		const raw = readFileSync(aggregatesPath, "utf8");
		const parsed = JSON.parse(raw) as AdaptiveRoutingStats;
		if (parsed && typeof parsed === "object" && "decisions" in parsed) {
			return parsed;
		}
		return emptyStats();
	} catch {
		return emptyStats();
	}
}

function emptyStats(): AdaptiveRoutingStats {
	return {
		decisions: 0,
		feedback: {},
		outcomes: 0,
		overrides: 0,
		perModelLatencyMs: {},
		shadowDisagreements: 0,
	};
}

function updateStatsIncremental(stats: AdaptiveRoutingStats, event: AdaptiveRoutingTelemetryEvent): void {
	if (event.type === "route_decision") {
		stats.decisions += 1;
		stats.lastDecisionAt = Math.max(stats.lastDecisionAt ?? 0, event.timestamp);
	} else if (event.type === "route_override") {
		stats.overrides += 1;
	} else if (event.type === "route_shadow_disagreement") {
		stats.shadowDisagreements += 1;
	} else if (event.type === "route_feedback") {
		stats.feedback[event.category] = (stats.feedback[event.category] ?? 0) + 1;
	} else if (event.type === "route_outcome") {
		stats.outcomes += 1;
		if (typeof event.durationMs === "number" && Number.isFinite(event.durationMs)) {
			const existing = stats.avgDurationMs ?? 0;
			const count = stats.outcomes;
			stats.avgDurationMs = Math.round(((existing * (count - 1) + event.durationMs) / count) * 10) / 10;
			if (event.selectedModel) {
				const m = stats.perModelLatencyMs[event.selectedModel] ?? { avgMs: 0, count: 0 };
				const newCount = m.count + 1;
				stats.perModelLatencyMs[event.selectedModel] = {
					avgMs: Math.round(((m.avgMs * m.count + event.durationMs) / newCount) * 10) / 10,
					count: newCount,
				};
			}
		}
	}
}

export function readTelemetryEvents(): AdaptiveRoutingTelemetryEvent[] {
	const eventsPath = getAdaptiveRoutingEventsPath();
	try {
		if (!existsSync(eventsPath)) {
			return [];
		}
		return readFileSync(eventsPath, "utf8")
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => JSON.parse(line) as AdaptiveRoutingTelemetryEvent);
	} catch {
		return [];
	}
}

export function computeStats(events: AdaptiveRoutingTelemetryEvent[]): AdaptiveRoutingStats {
	const stats: AdaptiveRoutingStats = {
		decisions: 0,
		feedback: {},
		outcomes: 0,
		overrides: 0,
		perModelLatencyMs: {},
		shadowDisagreements: 0,
	};
	let totalDurationMs = 0;
	let durationCount = 0;

	for (const event of events) {
		if (event.type === "route_decision") {
			stats.decisions += 1;
			stats.lastDecisionAt = Math.max(stats.lastDecisionAt ?? 0, event.timestamp);
		} else if (event.type === "route_override") {
			stats.overrides += 1;
		} else if (event.type === "route_shadow_disagreement") {
			stats.shadowDisagreements += 1;
		} else if (event.type === "route_feedback") {
			stats.feedback[event.category] = (stats.feedback[event.category] ?? 0) + 1;
		} else if (event.type === "route_outcome") {
			stats.outcomes += 1;
			if (typeof event.durationMs === "number" && Number.isFinite(event.durationMs)) {
				totalDurationMs += event.durationMs;
				durationCount += 1;
				if (event.selectedModel) {
					const existing = stats.perModelLatencyMs[event.selectedModel] ?? { avgMs: 0, count: 0 };
					const count = existing.count + 1;
					stats.perModelLatencyMs[event.selectedModel] = {
						avgMs: Math.round(((existing.avgMs * existing.count + event.durationMs) / count) * 10) / 10,
						count,
					};
				}
			}
		}
	}

	if (durationCount > 0) {
		stats.avgDurationMs = Math.round((totalDurationMs / durationCount) * 10) / 10;
	}

	return stats;
}

export function formatStats(stats: AdaptiveRoutingStats): string[] {
	const lines = [
		"Adaptive Routing Stats",
		`Decisions: ${stats.decisions}`,
		`Outcomes: ${stats.outcomes}`,
		`Overrides: ${stats.overrides}`,
		`Shadow disagreements: ${stats.shadowDisagreements}`,
	];
	if (typeof stats.avgDurationMs === "number") {
		lines.push(`Avg duration: ${Math.round(stats.avgDurationMs)}ms`);
	}
	const feedbackEntries = Object.entries(stats.feedback).toSorted((a, b) => a[0].localeCompare(b[0]));
	if (feedbackEntries.length > 0) {
		lines.push("Feedback:");
		for (const [category, count] of feedbackEntries) {
			lines.push(`  - ${category}: ${count}`);
		}
	}
	const latencyEntries = Object.entries(stats.perModelLatencyMs).toSorted((left, right) =>
		left[0].localeCompare(right[0]),
	);
	if (latencyEntries.length > 0) {
		lines.push("Measured latency:");
		for (const [model, value] of latencyEntries) {
			lines.push(
				`  - ${model}: ${Math.round(value.avgMs)}ms avg over ${value.count} run${value.count === 1 ? "" : "s"}`,
			);
		}
	}
	if (stats.lastDecisionAt) {
		lines.push(`Last decision: ${new Date(stats.lastDecisionAt).toLocaleString()}`);
	}
	return lines;
}

export function createFeedbackEvent(
	decision: RouteDecision | undefined,
	category: RouteFeedbackCategory,
	sessionId?: string,
): AdaptiveRoutingTelemetryEvent {
	return {
		category,
		decisionId: decision?.id,
		sessionId,
		timestamp: Date.now(),
		type: "route_feedback",
	};
}

function writeAggregates(stats: AdaptiveRoutingStats): void {
	const aggregatesPath = getAdaptiveRoutingAggregatesPath();
	try {
		mkdirSync(dirname(aggregatesPath), { recursive: true });
		writeFileSync(aggregatesPath, `${JSON.stringify(stats, null, 2)}\n`, "utf8");
	} catch {
		// Best effort
	}
}
