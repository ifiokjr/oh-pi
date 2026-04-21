/**
 * Micro-benchmarks for core hot paths.
 *
 * Run: node --import tsx packages/core/bench.ts
 *
 * These benchmarks validate that performance-critical functions
 * remain fast as the codebase evolves.
 */
import { selectDelegatedModel, mergeDelegatedSelectionPolicies } from "./src/model-intelligence.js";
import type { DelegatedAvailableModel, DelegatedSelectionPolicy } from "./src/model-intelligence.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatNs(ns: number): string {
	if (ns < 1_000) return `${ns.toFixed(0)}ns`;
	if (ns < 1_000_000) return `${(ns / 1_000).toFixed(1)}µs`;
	return `${(ns / 1_000_000).toFixed(2)}ms`;
}

function bench(name: string, fn: () => void, iterations = 10_000): void {
	// Warm-up
	for (let i = 0; i < Math.min(iterations, 100); i++) fn();

	const start = performance.now();
	for (let i = 0; i < iterations; i++) fn();
	const elapsed = performance.now() - start;
	const perOpNs = (elapsed / iterations) * 1_000_000;

	console.log(`  ${name}: ${formatNs(perOpNs)}/op (${iterations} iterations, ${elapsed.toFixed(1)}ms total)`);
}

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeModels(count: number): DelegatedAvailableModel[] {
	const providers = ["anthropic", "openai", "google", "groq", "openrouter"];
	const models: DelegatedAvailableModel[] = [];
	for (let i = 0; i < count; i++) {
		const provider = providers[i % providers.length]!;
		models.push({
			provider,
			id: `model-${i}`,
			name: `Model ${i}`,
			reasoning: i % 3 === 0,
			input: i % 2 === 0 ? ["text", "image"] : ["text"],
			contextWindow: [32_000, 128_000, 200_000, 1_048_576][i % 4]!,
			maxTokens: 16_384,
			cost: { input: 0.01 * i, output: 0.03 * i, cacheRead: 0.005 * i, cacheWrite: 0.01 * i },
		});
	}
	return models;
}

const smallModelSet = makeModels(5);
const mediumModelSet = makeModels(20);
const largeModelSet = makeModels(100);

const defaultPolicy: DelegatedSelectionPolicy = {
	preferFastModels: true,
	preferLowCost: false,
	preferLowerUsage: true,
	taskProfile: "coding",
};

const largeTaskText = "Fix the bug in the authentication module. ".repeat(50);

// ── Benchmarks ──────────────────────────────────────────────────────────────

console.log("\n=== Core Performance Benchmarks ===\n");

console.log("selectDelegatedModel (no policy)");
bench("5 models", () => selectDelegatedModel({ availableModels: smallModelSet }), 50_000);
bench("20 models", () => selectDelegatedModel({ availableModels: mediumModelSet }), 50_000);
bench("100 models", () => selectDelegatedModel({ availableModels: largeModelSet }), 50_000);

console.log("\nselectDelegatedModel (with policy + usage + latency)");
bench("5 models (full opts)", () =>
	selectDelegatedModel({
		availableModels: smallModelSet,
		policy: defaultPolicy,
		taskText: largeTaskText,
		usage: { anthropic: { remainingPct: 45, confidence: "estimated" } },
		latency: { "anthropic/claude-sonnet-4": { avgMs: 2500, count: 15 } },
	}), 50_000);
bench("20 models (full opts)", () =>
	selectDelegatedModel({
		availableModels: mediumModelSet,
		policy: defaultPolicy,
		taskText: largeTaskText,
		usage: { anthropic: { remainingPct: 45, confidence: "estimated" } },
		latency: { "anthropic/claude-sonnet-4": { avgMs: 2500, count: 15 } },
	}), 50_000);

console.log("\nmergeDelegatedSelectionPolicies");
const base: DelegatedSelectionPolicy = {
	blockedModels: ["old-model-1", "old-model-2"],
	blockedProviders: ["slow-provider"],
	taskProfile: "coding",
	preferFastModels: true,
};
const override: DelegatedSelectionPolicy = {
	blockedModels: ["deprecated-model"],
	preferredModels: ["fast-model-1"],
	taskProfile: "design",
	preferLowCost: true,
};
bench("base + override", () => mergeDelegatedSelectionPolicies(base, override), 100_000);
bench("undefined + undefined", () => mergeDelegatedSelectionPolicies(undefined, undefined), 100_000);
bench("base + undefined", () => mergeDelegatedSelectionPolicies(base, undefined), 100_000);

console.log("\n✅ All core benchmarks complete.\n");