/**
 * Micro-benchmarks for adaptive-routing hot paths.
 *
 * Run: node --import tsx packages/adaptive-routing/bench.ts
 *
 * These benchmarks validate that model selection and route decision
 * functions remain fast under production-scale model lists.
 */
import { decideRoute } from "./engine.js";
import { readAdaptiveRoutingConfig } from "./config.js";
import type {
	AdaptiveRoutingConfig,
	NormalizedRouteCandidate,
	PromptRouteClassification,
} from "./types.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatNs(ns: number): string {
	if (ns < 1_000) return `${ns.toFixed(0)}ns`;
	if (ns < 1_000_000) return `${(ns / 1_000).toFixed(1)}µs`;
	return `${(ns / 1_000_000).toFixed(2)}ms`;
}

function bench(name: string, fn: () => void, iterations = 10_000): void {
	for (let i = 0; i < Math.min(iterations, 100); i++) fn();
	const start = performance.now();
	for (let i = 0; i < iterations; i++) fn();
	const elapsed = performance.now() - start;
	const perOpNs = (elapsed / iterations) * 1_000_000;
	console.log(`  ${name}: ${formatNs(perOpNs)}/op (${iterations} iterations, ${elapsed.toFixed(1)}ms total)`);
}

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeCandidate(id: string, provider: string, tier: "cheap" | "balanced" | "premium" | "peak"): NormalizedRouteCandidate {
	return {
		provider,
		id,
		fullId: `${provider}/${id}`,
		name: `Model ${id}`,
		tags: [tier === "peak" ? "architecture" : "design"],
		tier,
		maxThinkingLevel: tier === "cheap" ? "low" : "medium",
		fallbackGroups: [],
		input: ["text"],
		contextWindow: tier === "peak" ? 200_000 : 128_000,
		multimodal: true,
		reasoning: tier === "premium" || tier === "peak",
		fastScore: tier === "cheap" ? 4 : 0,
		costScore: tier === "cheap" ? 6 : tier === "balanced" ? 2 : 0,
	};
}

const smallCandidates: NormalizedRouteCandidate[] = [
	makeCandidate("claude-sonnet-4", "anthropic", "balanced"),
	makeCandidate("gpt-4o", "openai", "balanced"),
	makeCandidate("gemini-2.5-flash", "google", "cheap"),
];

const mediumCandidates: NormalizedRouteCandidate[] = [
	...smallCandidates,
	makeCandidate("claude-opus-4", "anthropic", "premium"),
	makeCandidate("o3-mini", "openai", "balanced"),
	makeCandidate("gemini-2.5-pro", "google", "peak"),
	makeCandidate("llama-3.3-70b", "groq", "cheap"),
	makeCandidate("mixtral-8x7b", "openrouter", "cheap"),
];

const largeCandidates: NormalizedRouteCandidate[] = [
	...mediumCandidates,
	...Array.from({ length: 20 }, (_, i) =>
		makeCandidate(`test-model-${i}`, i % 2 === 0 ? "test-provider-a" : "test-provider-b", ["cheap", "balanced", "premium", "peak"][i % 4]!),
	),
];

const defaultClassification: PromptRouteClassification = {
	intent: "implementation",
	complexity: 3,
	risk: "medium",
	expectedTurns: "few",
	toolIntensity: "high",
	contextBreadth: "medium",
	recommendedTier: "balanced",
	recommendedThinking: "medium",
	confidence: 0.85,
	reason: "Default classification.",
	classifierMode: "heuristic",
};

const minimalConfig: AdaptiveRoutingConfig = {
	enabled: true,
	models: { ranked: [], excluded: [] },
	intents: {},
	delegatedRouting: { enabled: false, categories: {} },
	delegatedModelSelection: {
		disabledProviders: [],
		disabledModels: [],
		roleOverrides: {},
		preferLowerUsage: false,
		allowSmallContextForSmallTasks: true,
	},
	providerReserves: {},
	fallbackGroups: {},
	stickyTurns: 0,
};

// ── Benchmarks ──────────────────────────────────────────────────────────────

console.log("\n=== Adaptive Routing Performance Benchmarks ===\n");

console.log("decideRoute (no policy)");
bench("3 candidates", () =>
	decideRoute({
		config: minimalConfig,
		candidates: smallCandidates,
		classification: defaultClassification,
	}), 50_000);
bench("8 candidates", () =>
	decideRoute({
		config: minimalConfig,
		candidates: mediumCandidates,
		classification: defaultClassification,
	}), 50_000);
bench("28 candidates", () =>
	decideRoute({
		config: minimalConfig,
		candidates: largeCandidates,
		classification: defaultClassification,
	}), 50_000);

console.log("\n✅ All adaptive-routing benchmarks complete.\n");