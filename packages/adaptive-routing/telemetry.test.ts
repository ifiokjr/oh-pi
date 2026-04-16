import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getAgentDir } = vi.hoisted(() => ({
	getAgentDir: vi.fn(() => "/mock-home/.pi/agent"),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	getAgentDir,
}));

import {
	appendTelemetryEvent,
	computeStats,
	createDecisionId,
	formatStats,
	getAdaptiveRoutingAggregatesPath,
	readTelemetryEvents,
} from "./telemetry.js";
import type { AdaptiveRoutingTelemetryEvent } from "./types.js";

describe("adaptive routing telemetry", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("computes aggregate latency stats from route outcomes", () => {
		const events: AdaptiveRoutingTelemetryEvent[] = [
			{
				type: "route_decision",
				timestamp: 10,
				decisionId: "d1",
				mode: "auto",
				selected: { model: "openai/gpt-5.4", thinking: "high" },
				fallbacks: [],
				explanationCodes: [],
			},
			{
				type: "route_outcome",
				timestamp: 20,
				decisionId: "d1",
				selectedModel: "openai/gpt-5.4",
				turnCount: 2,
				completed: true,
				userOverrideOccurred: false,
				durationMs: 4_000,
			},
			{
				type: "route_outcome",
				timestamp: 30,
				decisionId: "d2",
				selectedModel: "openai/gpt-5.4",
				turnCount: 1,
				completed: true,
				userOverrideOccurred: false,
				durationMs: 6_000,
			},
			{
				type: "route_outcome",
				timestamp: 40,
				decisionId: "d3",
				selectedModel: "google/gemini-2.5-flash",
				turnCount: 1,
				completed: true,
				userOverrideOccurred: false,
				durationMs: 2_000,
			},
		];

		const stats = computeStats(events);
		expect(stats.outcomes).toBe(3);
		expect(stats.avgDurationMs).toBe(4_000);
		expect(stats.perModelLatencyMs["openai/gpt-5.4"]).toEqual({ count: 2, avgMs: 5_000 });
		expect(stats.perModelLatencyMs["google/gemini-2.5-flash"]).toEqual({ count: 1, avgMs: 2_000 });
		expect(formatStats(stats)).toEqual(
			expect.arrayContaining([
				"Outcomes: 3",
				"Avg duration: 4000ms",
				expect.stringContaining("openai/gpt-5.4: 5000ms avg over 2 runs"),
			]),
		);
	});

	it("persists aggregates with measured latency", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "adaptive-routing-telemetry-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "adaptive-routing"), { recursive: true });
		const decisionId = createDecisionId();

		try {
			appendTelemetryEvent(
				{ mode: "local", privacy: "minimal" },
				{
					type: "route_outcome",
					timestamp: 100,
					decisionId,
					selectedModel: "openai/gpt-5.4",
					turnCount: 1,
					completed: true,
					userOverrideOccurred: false,
					durationMs: 3_500,
				},
			);

			const events = readTelemetryEvents();
			expect(events).toHaveLength(1);
			const aggregates = JSON.parse(readFileSync(getAdaptiveRoutingAggregatesPath(), "utf-8")) as {
				avgDurationMs?: number;
				perModelLatencyMs?: Record<string, { avgMs: number }>;
			};
			expect(aggregates.avgDurationMs).toBe(3_500);
			expect(aggregates.perModelLatencyMs?.["openai/gpt-5.4"]?.avgMs).toBe(3_500);
		} finally {
			rmSync(tempAgentDir, { recursive: true, force: true });
		}
	});
});
