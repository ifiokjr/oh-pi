import { classifyPromptHeuristically } from "./classifier.js";
import { decideRoute } from "./engine.js";
import type {
	AdaptiveRoutingConfig,
	NormalizedRouteCandidate,
	PromptRouteClassification,
	ProviderUsageState,
	RouteDecision,
	RouteTier,
	RouteThinkingLevel,
	RouteIntent,
	RouteRisk,
	RouteExpectedTurns,
	RouteToolIntensity,
	RouteContextBreadth,
} from "./types.js";

/**
 * A single corpus entry that describes a prompt and its expected routing
 * characteristics.
 */
export interface CorpusEntry {
	name: string;
	prompt: string;
	/** Expected intent from heuristic or LLM classifier */
	expectedIntent: RouteIntent;
	/** Expected complexity bucket */
	expectedComplexity: 1 | 2 | 3 | 4 | 5;
	/** Expected risk level */
	expectedRisk: RouteRisk;
	/** Expected number of turns */
	expectedTurns: RouteExpectedTurns;
	/** Expected tool intensity */
	expectedToolIntensity: RouteToolIntensity;
	/** Expected context breadth */
	expectedContextBreadth: RouteContextBreadth;
	/** Expected tier from the router/policy engine */
	expectedTier: RouteTier;
	/** Expected thinking level after clamping */
	expectedThinking: RouteThinkingLevel;
	/** Full model id expected from the policy engine (e.g. "openai/gpt-5.4") */
	expectedModel: string;
	/** Ordered list of acceptable fallback model ids */
	acceptableFallbacks: string[];
}

export interface CorpusEvaluationRun {
	name: string;
	prompt: string;
	classification?: PromptRouteClassification;
	decision?: RouteDecision;
	mismatches: ClassificationMismatch[];
	modelMismatch?: string;
}

export interface ClassificationMismatch {
	fieldName: string;
	expected: unknown;
	actual: unknown;
}

export interface CorpusSummary {
	total: number;
	matched: number;
	mismatched: number;
	intentAccuracy: number;
	modelMismatchCount: number;
	fallbackMismatchCount: number;
	runs: CorpusEvaluationRun[];
}

export interface EvaluateCorpusOptions {
	config: AdaptiveRoutingConfig;
	candidates: NormalizedRouteCandidate[];
	usage?: ProviderUsageState;
	currentModel?: string;
	currentThinking?: RouteThinkingLevel;
	lock?: { model: string; thinking: RouteThinkingLevel; setAt?: number };
}

export function evaluateCorpus(
	corpus: CorpusEntry[],
	opts: EvaluateCorpusOptions,
): CorpusSummary {
	const runs: CorpusEvaluationRun[] = [];
	let matched = 0;
	let mismatched = 0;
	let modelMismatchCount = 0;
	let fallbackMismatchCount = 0;
	let intentMatches = 0;

	for (const entry of corpus) {
		const classification = classifyPromptHeuristically(entry.prompt);
		const mismatches: ClassificationMismatch[] = [];

		if (entry.expectedIntent !== classification.intent) {
			mismatches.push({
				fieldName: "intent",
				expected: entry.expectedIntent,
				actual: classification.intent,
			});
		} else {
			intentMatches++;
		}

		if (entry.expectedComplexity !== classification.complexity) {
			mismatches.push({
				fieldName: "complexity",
				expected: entry.expectedComplexity,
				actual: classification.complexity,
			});
		}

		if (entry.expectedRisk !== classification.risk) {
			mismatches.push({
				fieldName: "risk",
				expected: entry.expectedRisk,
				actual: classification.risk,
			});
		}

		if (entry.expectedTurns !== classification.expectedTurns) {
			mismatches.push({
				fieldName: "expectedTurns",
				expected: entry.expectedTurns,
				actual: classification.expectedTurns,
			});
		}

		if (entry.expectedToolIntensity !== classification.toolIntensity) {
			mismatches.push({
				fieldName: "toolIntensity",
				expected: entry.expectedToolIntensity,
				actual: classification.toolIntensity,
			});
		}

		if (entry.expectedContextBreadth !== classification.contextBreadth) {
			mismatches.push({
				fieldName: "contextBreadth",
				expected: entry.expectedContextBreadth,
				actual: classification.contextBreadth,
			});
		}

		if (entry.expectedTier !== classification.recommendedTier) {
			mismatches.push({
				fieldName: "recommendedTier",
				expected: entry.expectedTier,
				actual: classification.recommendedTier,
			});
		}

		if (entry.expectedThinking !== classification.recommendedThinking) {
			mismatches.push({
				fieldName: "recommendedThinking",
				expected: entry.expectedThinking,
				actual: classification.recommendedThinking,
			});
		}

		const decision = decideRoute({
			config: opts.config,
			candidates: opts.candidates,
			classification,
			usage: opts.usage,
			currentModel: opts.currentModel,
			currentThinking: opts.currentThinking,
			lock: opts.lock ? { ...opts.lock, setAt: opts.lock.setAt ?? Date.now() } : undefined,
		});

		let modelMismatch: string | undefined;

		if (decision) {
			if (entry.expectedModel === decision.selectedModel) {
				// perfect match
			} else {
				if (entry.acceptableFallbacks.includes(decision.selectedModel)) {
					// acceptable fallback – we do not count this as a mismatch for modelAccuracy
				} else {
					modelMismatch = decision.selectedModel;
					modelMismatchCount++;
				}
			}
		} else {
			modelMismatch = "<no-decision>";
			modelMismatchCount++;
		}

		if (decision) {
			const orderedFallbacks = [decision.selectedModel, ...decision.fallbacks];
			const primaryInFallbacks = orderedFallbacks.includes(entry.expectedModel);
			if (!primaryInFallbacks && !entry.acceptableFallbacks.some((f) => orderedFallbacks.includes(f))) {
				fallbackMismatchCount++;
			}
		}

		const run: CorpusEvaluationRun = {
			name: entry.name,
			prompt: entry.prompt,
			classification,
			decision: decision ?? undefined,
			mismatches,
			modelMismatch,
		};

		runs.push(run);

		if (mismatches.length === 0 && !modelMismatch) {
			matched++;
		} else {
			mismatched++;
		}
	}

	const intentAccuracy = corpus.length > 0 ? intentMatches / corpus.length : 1;

	return {
		total: corpus.length,
		matched,
		mismatched,
		intentAccuracy,
		modelMismatchCount,
		fallbackMismatchCount,
		runs,
	};
}

/**
 * Produces a formatted, multi-line report string from a summary.
 */
export function formatEvaluationSummary(summary: CorpusSummary): string {
	const lines: string[] = [
		`Corpus Evaluation — ${summary.total} examples`,
		`  Matched: ${summary.matched} / ${summary.total}`,
		`  Mismatched: ${summary.mismatched}`,
		`  Intent accuracy: ${(summary.intentAccuracy * 100).toFixed(1)}%`,
		`  Model mismatches: ${summary.modelMismatchCount}`,
		`  Fallback mismatches: ${summary.fallbackMismatchCount}`,
	];

	if (summary.mismatched > 0) {
		lines.push("");
		lines.push("Mismatched examples:");
		for (const run of summary.runs) {
			if (run.mismatches.length === 0 && !run.modelMismatch) continue;
			lines.push(`  • ${run.name}`);
			for (const m of run.mismatches) {
				lines.push(`    - ${m.fieldName}: expected ${String(m.expected)} — got ${String(m.actual)}`);
			}
			if (run.modelMismatch) {
				lines.push(`    - model: got ${run.modelMismatch}`);
			}
		}
	}

	return lines.join("\n");
}
