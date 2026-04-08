import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
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
		const payload = `${JSON.stringify(event)}\n`;
		if (existsSync(eventsPath)) {
			writeFileSync(eventsPath, readFileSync(eventsPath, "utf-8") + payload, "utf-8");
		} else {
			writeFileSync(eventsPath, payload, "utf-8");
		}
		writeAggregates(computeStats(readTelemetryEvents()));
	} catch {
		// Telemetry is best-effort only.
	}
}

export function readTelemetryEvents(): AdaptiveRoutingTelemetryEvent[] {
	const eventsPath = getAdaptiveRoutingEventsPath();
	try {
		if (!existsSync(eventsPath)) {
			return [];
		}
		return readFileSync(eventsPath, "utf-8")
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
		overrides: 0,
		shadowDisagreements: 0,
	};

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
		}
	}

	return stats;
}

export function formatStats(stats: AdaptiveRoutingStats): string[] {
	const lines = [
		"Adaptive Routing Stats",
		`Decisions: ${stats.decisions}`,
		`Overrides: ${stats.overrides}`,
		`Shadow disagreements: ${stats.shadowDisagreements}`,
	];
	const feedbackEntries = Object.entries(stats.feedback).sort((a, b) => a[0].localeCompare(b[0]));
	if (feedbackEntries.length > 0) {
		lines.push("Feedback:");
		for (const [category, count] of feedbackEntries) {
			lines.push(`  - ${category}: ${count}`);
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
		type: "route_feedback",
		timestamp: Date.now(),
		decisionId: decision?.id,
		sessionId,
		category,
	};
}

function writeAggregates(stats: AdaptiveRoutingStats): void {
	const aggregatesPath = getAdaptiveRoutingAggregatesPath();
	try {
		mkdirSync(dirname(aggregatesPath), { recursive: true });
		writeFileSync(aggregatesPath, `${JSON.stringify(stats, null, 2)}\n`, "utf-8");
	} catch {
		// best effort
	}
}
