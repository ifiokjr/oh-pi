import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { getAgentDir } = vi.hoisted(() => ({
	getAgentDir: vi.fn(() => "/mock-home/.pi/agent"),
}));

vi.mock<typeof import("@mariozechner/pi-coding-agent")>(import("@mariozechner/pi-coding-agent"), () => ({
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
				decisionId: "d1",
				explanationCodes: [],
				fallbacks: [],
				mode: "auto",
				selected: { model: "openai/gpt-5.4", thinking: "high" },
				timestamp: 10,
				type: "route_decision",
			},
			{
				completed: true,
				decisionId: "d1",
				durationMs: 4_000,
				selectedModel: "openai/gpt-5.4",
				timestamp: 20,
				turnCount: 2,
				type: "route_outcome",
				userOverrideOccurred: false,
			},
			{
				completed: true,
				decisionId: "d2",
				durationMs: 6_000,
				selectedModel: "openai/gpt-5.4",
				timestamp: 30,
				turnCount: 1,
				type: "route_outcome",
				userOverrideOccurred: false,
			},
			{
				completed: true,
				decisionId: "d3",
				durationMs: 2_000,
				selectedModel: "google/gemini-2.5-flash",
				timestamp: 40,
				turnCount: 1,
				type: "route_outcome",
				userOverrideOccurred: false,
			},
		];

		const stats = computeStats(events);
		expect(stats.outcomes).toBe(3);
		expect(stats.avgDurationMs).toBe(4000);
		expect(stats.perModelLatencyMs["openai/gpt-5.4"]).toStrictEqual({ avgMs: 5_000, count: 2 });
		expect(stats.perModelLatencyMs["google/gemini-2.5-flash"]).toStrictEqual({ avgMs: 2_000, count: 1 });
		expect(formatStats(stats)).toStrictEqual(
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
					completed: true,
					decisionId,
					durationMs: 3_500,
					selectedModel: "openai/gpt-5.4",
					timestamp: 100,
					turnCount: 1,
					type: "route_outcome",
					userOverrideOccurred: false,
				},
			);

			const events = readTelemetryEvents();
			expect(events).toHaveLength(1);
			const aggregates = JSON.parse(readFileSync(getAdaptiveRoutingAggregatesPath(), "utf8")) as {
				avgDurationMs?: number;
				perModelLatencyMs?: Record<string, { avgMs: number }>;
			};
			expect(aggregates.avgDurationMs).toBe(3500);
			expect(aggregates.perModelLatencyMs?.["openai/gpt-5.4"]?.avgMs).toBe(3500);
		} finally {
			rmSync(tempAgentDir, { force: true, recursive: true });
		}
	});

	it("increments override count for route_override events", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "adaptive-routing-telemetry-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "adaptive-routing"), { recursive: true });

		try {
			appendTelemetryEvent(
				{ mode: "local", privacy: "minimal" },
				{
					decisionId: "d1",
					from: { model: "openai/gpt-4", thinking: "high" },
					reason: "manual",
					timestamp: 100,
					to: { model: "anthropic/claude-3", thinking: "high" },
					type: "route_override",
				},
			);

			const aggregates = JSON.parse(readFileSync(getAdaptiveRoutingAggregatesPath(), "utf8")) as {
				overrides?: number;
			};
			expect(aggregates.overrides).toBe(1);
		} finally {
			rmSync(tempAgentDir, { force: true, recursive: true });
		}
	});

	it("increments shadow disagreement count for route_shadow_disagreement events", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "adaptive-routing-telemetry-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "adaptive-routing"), { recursive: true });

		try {
			appendTelemetryEvent(
				{ mode: "local", privacy: "minimal" },
				{
					actual: { model: "openai/gpt-4", thinking: "high" },
					decisionId: "d1",
					suggested: { model: "anthropic/claude-3", thinking: "high" },
					timestamp: 100,
					type: "route_shadow_disagreement",
				},
			);

			const aggregates = JSON.parse(readFileSync(getAdaptiveRoutingAggregatesPath(), "utf8")) as {
				shadowDisagreements?: number;
			};
			expect(aggregates.shadowDisagreements).toBe(1);
		} finally {
			rmSync(tempAgentDir, { force: true, recursive: true });
		}
	});

	it("increments feedback count for route_feedback events", () => {
		const tempAgentDir = mkdtempSync(join(tmpdir(), "adaptive-routing-telemetry-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "adaptive-routing"), { recursive: true });

		try {
			appendTelemetryEvent(
				{ mode: "local", privacy: "minimal" },
				{
					category: "good",
					decisionId: "d1",
					timestamp: 100,
					type: "route_feedback",
				},
			);

			const aggregates = JSON.parse(readFileSync(getAdaptiveRoutingAggregatesPath(), "utf8")) as {
				feedback?: Record<string, number>;
			};
			expect(aggregates.feedback?.["good"]).toBe(1);
		} finally {
			rmSync(tempAgentDir, { force: true, recursive: true });
		}
	});
});
