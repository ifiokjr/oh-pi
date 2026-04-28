/* C8 ignore file */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = import.meta.dirname;
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "docs", "research", "model-intelligence.snapshot.json");
const runtimeOutputPath = path.join(repoRoot, "packages", "core", "src", "model-intelligence.generated.ts");

const DATA_SOURCES = {
	benchLmLeaderboard: "https://benchlm.ai/api/data/leaderboard?limit=250",
	benchLmPricing: "https://benchlm.ai/api/data/pricing?limit=400",
	modelsDev: "https://models.dev/api.json",
};

const TASK_SCORE_WEIGHTS = {
	all: {
		overallScore: 1,
	},
	coding: {
		coding: 1,
	},
	design: {
		coding: 0.2,
		instructionFollowing: 0.2,
		multimodalGrounded: 0.45,
		reasoning: 0.15,
	},
	planning: {
		agentic: 0.25,
		instructionFollowing: 0.2,
		knowledge: 0.1,
		reasoning: 0.45,
	},
	writing: {
		instructionFollowing: 0.45,
		knowledge: 0.3,
		multilingual: 0.15,
		reasoning: 0.1,
	},
};

const CREATOR_NORMALIZATION = {
	alibaba: "alibaba",
	anthropic: "anthropic",
	deepseek: "deepseek",
	google: "google",
	meta: "meta",
	mistral: "mistral",
	"moonshot ai": "moonshotai",
	nvidia: "nvidia",
	openai: "openai",
	xiaomi: "xiaomi",
	z: "zai",
	"z.ai": "zai",
	zai: "zai",
};

const MANUAL_BENCH_ALIASES = {
	"Alibaba::Qwen2.5-1M": ["qwen2.5 1m", "qwen2 5 1m"],
	"Alibaba::Qwen2.5-72B": ["qwen2.5 72b", "qwen2 5 72b"],
	"Alibaba::Qwen3 235B 2507 (Reasoning)": ["qwen3 235b", "qwen3 235b 2507"],
	"Alibaba::Qwen3.5 397B (Reasoning)": ["qwen3 5 397b", "qwen3.5:397b", "qwen3.5-397b"],
	"Anthropic::Claude Mythos Preview": ["claude mythos"],
	"DeepSeek::DeepSeek Coder 2.0": ["deepseek coder 2", "deepseek coder 2.0"],
	"DeepSeek::DeepSeek LLM 2.0": ["deepseek 2", "deepseek llm 2"],
	"DeepSeek::DeepSeek V3.1 (Reasoning)": ["deepseek v3.1", "deepseek v3 1"],
	"DeepSeek::DeepSeekMath V2": ["deepseek math 2", "deepseekmath v2"],
	"Google::Gemini 1.0 Pro": ["gemini 1 0 pro", "gemini 1.0 pro"],
	"Google::Gemini 3 Pro Deep Think": ["gemini 3 pro", "gemini 3 pro deep think"],
	"Meta::Llama 3.1 405B": ["llama 3 1 405b", "llama 3.1 405b"],
	"Mistral::Mistral 7B v0.3": ["mistral 7b", "mistral 7b v0 3"],
	"Mistral::Mistral 8x7B": ["mistral 8x7b", "mixtral 8x7b"],
	"Mistral::Mistral 8x7B v0.2": ["mistral 8x7b", "mixtral 8x7b v0 2"],
	"Mistral::Mistral Large 2": ["mistral large 2"],
	"Mistral::Mixtral 8x22B Instruct v0.1": ["mixtral 8x22b", "mixtral 8x22b instruct"],
	"Moonshot AI::Kimi K2.5 (Reasoning)": ["kimi k2 5", "kimi k2.5"],
	"OpenAI::GPT-5 (high)": ["gpt 5"],
	"OpenAI::GPT-5 (medium)": ["gpt 5"],
	"Z.AI::GLM-5 (Reasoning)": ["glm 5"],
};

async function fetchJson(url) {
	const response = await fetch(url, {
		headers: {
			"user-agent": "oh-pi model intelligence snapshot generator",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
	}

	return await response.json();
}

function normalizeCreator(value) {
	const normalized = String(value ?? "")
		.toLowerCase()
		.replaceAll(/\s+/g, " ")
		.trim();
	return CREATOR_NORMALIZATION[normalized] ?? normalized.replaceAll(/[^a-z0-9]+/g, "");
}

function normalizeAlias(value) {
	return String(value ?? "")
		.toLowerCase()
		.replaceAll(/\((reasoning|thinking|high|medium|low)\)/g, " ")
		.replaceAll(/\bpreview\b/g, " ")
		.replaceAll(/\bdeep think\b/g, " ")
		.replaceAll(/\bv0\./g, "v0 ")
		.replaceAll(/\bv(\d)/g, " v$1")
		.replaceAll(/[^a-z0-9]+/g, " ")
		.replaceAll(/\s+/g, " ")
		.trim();
}

function canonicalSlug(creator, model) {
	return `${normalizeCreator(creator)}--${normalizeAlias(model).replaceAll(/\s+/g, "-")}`;
}

function parseContextWindow(value) {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value !== "string") {
		return null;
	}

	const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*([kKmM])$/);
	if (!match) {
		const numeric = Number(value.replaceAll(/[^\d.]/g, ""));
		return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
	}

	const base = Number(match[1]);
	const unit = match[2]?.toLowerCase();
	if (!Number.isFinite(base)) {
		return null;
	}

	if (unit === "m") {
		return Math.round(base * 1_000_000);
	}

	return Math.round(base * 1000);
}

function roundScore(value) {
	if (!Number.isFinite(value)) {
		return null;
	}
	return Math.round(value * 10) / 10;
}

function uniqueSorted(values) {
	return [...new Set(values.filter(Boolean))].toSorted((left, right) => left.localeCompare(right));
}

function deriveTaskScore(model, taskName, weights) {
	let weightedTotal = 0;
	let totalWeight = 0;
	const metricsUsed = [];

	for (const [metric, weight] of Object.entries(weights)) {
		const rawValue = metric === "overallScore" ? model.overallScore : model.categoryScores?.[metric];
		if (typeof rawValue !== "number") {
			continue;
		}

		weightedTotal += rawValue * weight;
		totalWeight += weight;
		metricsUsed.push(metric);
	}

	if (totalWeight === 0) {
		return {
			confidence: 0,
			metricsUsed,
			score: null,
			task: taskName,
		};
	}

	return {
		confidence: roundScore(metricsUsed.length / Object.keys(weights).length),
		metricsUsed,
		score: roundScore(weightedTotal / totalWeight),
		task: taskName,
	};
}

function addAlias(index, alias, value) {
	if (!alias) {
		return;
	}

	const items = index.get(alias) ?? [];
	items.push(value);
	index.set(alias, items);
}

function buildCatalogAliasIndex(modelsDevCatalog) {
	const aliasIndex = new Map();
	let providerCount = 0;
	let providerModelCount = 0;

	for (const [providerId, provider] of Object.entries(modelsDevCatalog)) {
		providerCount += 1;
		for (const model of Object.values(provider.models ?? {})) {
			providerModelCount += 1;
			const aliases = new Set([
				normalizeAlias(model.id),
				normalizeAlias(model.name),
				normalizeAlias(`${providerId} ${model.id}`),
				normalizeAlias(`${providerId} ${model.name}`),
			]);

			for (const alias of aliases) {
				addAlias(aliasIndex, alias, {
					contextWindowTokens: typeof model.limit?.context === "number" ? model.limit.context : null,
					id: model.id,
					maxOutputTokens: typeof model.limit?.output === "number" ? model.limit.output : null,
					multimodal: Boolean(model.attachment || model.modalities?.input?.includes("image")),
					name: model.name,
					openWeights: Boolean(model.open_weights),
					providerId,
					reasoning: Boolean(model.reasoning),
					structuredOutput: Boolean(model.structured_output),
					toolCall: Boolean(model.tool_call),
				});
			}
		}
	}

	return {
		aliasIndex,
		summary: {
			providerCount,
			providerModelCount,
		},
	};
}

function resolveCatalogCoverage(aliasIndex, creator, model) {
	const benchKey = `${creator}::${model}`;
	const aliases = new Set([
		normalizeAlias(model),
		normalizeAlias(`${normalizeCreator(creator)} ${model}`),
		...(MANUAL_BENCH_ALIASES[benchKey] ?? []).map((entry) => normalizeAlias(entry)),
	]);

	const matches = new Map();
	for (const alias of aliases) {
		for (const item of aliasIndex.get(alias) ?? []) {
			matches.set(`${item.providerId}/${item.id}`, item);
		}
	}

	return [...matches.values()].toSorted((left, right) => {
		const providerDiff = left.providerId.localeCompare(right.providerId);
		if (providerDiff !== 0) {
			return providerDiff;
		}
		return left.id.localeCompare(right.id);
	});
}

function buildRuntimeSnapshot(snapshot) {
	return {
		generatedAt: snapshot.generatedAt,
		models: snapshot.models.map((model) => ({
			id: model.id,
			creator: model.creator,
			model: model.model,
			sourceType: model.sourceType,
			overallScore: model.overallScore,
			taskScores: model.taskScores,
			inputPriceUsdPerMillion: model.pricing.inputPriceUsdPerMillion,
			outputPriceUsdPerMillion: model.pricing.outputPriceUsdPerMillion,
			contextWindowTokens: model.contextWindow.tokens,
			providerModelRefs: model.catalog.providerModelRefs,
			openWeights: model.catalog.openWeights,
			reasoning: model.catalog.reasoning,
			multimodal: model.catalog.multimodal,
			toolCall: model.catalog.toolCall,
			structuredOutput: model.catalog.structuredOutput,
		})),
		version: snapshot.version,
	};
}

function formatGeneratedRuntimeModule(runtimeSnapshot) {
	return [
		"/* This file is auto-generated by scripts/generate-model-intelligence-snapshot.mjs. */",
		'import type { ModelIntelligenceRuntimeSnapshot } from "./model-intelligence.js";',
		"",
		`export const MODEL_INTELLIGENCE_RUNTIME_SNAPSHOT: ModelIntelligenceRuntimeSnapshot = ${JSON.stringify(
			runtimeSnapshot,
			null,
			2,
		)};`,
		"",
	].join("\n");
}

async function main() {
	const [modelsDevCatalog, benchLeaderboard, benchPricing] = await Promise.all([
		fetchJson(DATA_SOURCES.modelsDev),
		fetchJson(DATA_SOURCES.benchLmLeaderboard),
		fetchJson(DATA_SOURCES.benchLmPricing),
	]);

	const { aliasIndex, summary } = buildCatalogAliasIndex(modelsDevCatalog);
	const pricingByBenchKey = new Map(
		(benchPricing.models ?? []).map((entry) => [`${entry.creator}::${entry.model}`, entry]),
	);

	const models = (benchLeaderboard.models ?? [])
		.map((entry) => {
			const pricing = pricingByBenchKey.get(`${entry.creator}::${entry.model}`) ?? null;
			const coverage = resolveCatalogCoverage(aliasIndex, entry.creator, entry.model);
			const taskScores = Object.fromEntries(
				Object.entries(TASK_SCORE_WEIGHTS).map(([taskName, weights]) => [
					taskName,
					deriveTaskScore(entry, taskName, weights),
				]),
			);
			const providers = uniqueSorted(coverage.map((item) => item.providerId));
			const catalogContextWindows = coverage
				.map((item) => item.contextWindowTokens)
				.filter((value) => typeof value === "number");
			const catalogOutputTokens = coverage
				.map((item) => item.maxOutputTokens)
				.filter((value) => typeof value === "number");
			const anyMultimodal = coverage.some((item) => item.multimodal);
			const anyReasoning = coverage.some((item) => item.reasoning);
			const anyToolCall = coverage.some((item) => item.toolCall);
			const anyStructuredOutput = coverage.some((item) => item.structuredOutput);
			const openWeightsCatalog = coverage.some((item) => item.openWeights);

			return {
				catalog: {
					contextWindowTokens: catalogContextWindows.length > 0 ? Math.max(...catalogContextWindows) : null,
					matched: coverage.length > 0,
					maxOutputTokens: catalogOutputTokens.length > 0 ? Math.max(...catalogOutputTokens) : null,
					multimodal: anyMultimodal,
					openWeights: openWeightsCatalog,
					providerCount: providers.length,
					providerModelRefs: coverage.map((item) => `${item.providerId}/${item.id}`),
					providers,
					reasoning: anyReasoning,
					structuredOutput: anyStructuredOutput,
					toolCall: anyToolCall,
				},
				categoryScores: entry.categoryScores ?? {},
				contextWindow: {
					raw: typeof pricing?.contextWindow === "string" ? pricing.contextWindow : null,
					tokens: parseContextWindow(pricing?.contextWindow),
				},
				creator: entry.creator,
				id: canonicalSlug(entry.creator, entry.model),
				model: entry.model,
				overallScore: entry.overallScore,
				pricing: {
					inputPriceUsdPerMillion: typeof entry.inputPrice === "number" ? entry.inputPrice : null,
					outputPriceUsdPerMillion: typeof entry.outputPrice === "number" ? entry.outputPrice : null,
				},
				sourceType: entry.sourceType,
				taskScores,
			};
		})
		.toSorted((left, right) => {
			const scoreDiff = (right.overallScore ?? 0) - (left.overallScore ?? 0);
			if (scoreDiff !== 0) {
				return scoreDiff;
			}
			return left.id.localeCompare(right.id);
		});

	const snapshot = {
		generatedAt: new Date().toISOString(),
		methodology: {
			notes: [
				"design, planning, writing, coding, and all are derived routing scores for task selection, not official benchmark labels.",
				"Provider coverage comes from matching BenchLM model names against models.dev provider catalogs using normalized aliases plus a small manual override list.",
				"When a model is missing from the benchmark snapshot, the router should fall back to live catalog metadata plus name-based heuristics instead of excluding the model.",
			],
			taskScoreWeights: TASK_SCORE_WEIGHTS,
		},
		models,
		sources: {
			benchLm: {
				lastUpdated: benchLeaderboard.lastUpdated ?? benchPricing.lastUpdated ?? null,
				leaderboardUrl: DATA_SOURCES.benchLmLeaderboard,
				pricingUrl: DATA_SOURCES.benchLmPricing,
				rankedModelCount: models.length,
			},
			modelsDev: {
				providerCount: summary.providerCount,
				providerModelCount: summary.providerModelCount,
				url: DATA_SOURCES.modelsDev,
			},
			optionalFutureEnrichment: {
				artificialAnalysis: {
					note: "Artificial Analysis exposes speed, latency, and additional eval metrics via a free API, but it requires an API key. This snapshot intentionally sticks to unauthenticated public sources.",
					url: "https://artificialanalysis.ai/api-reference",
				},
			},
		},
		summary: {
			modelsWithCatalogCoverage: models.filter((item) => item.catalog.matched).length,
			modelsWithoutCatalogCoverage: models.filter((item) => !item.catalog.matched).length,
			openWeightModelCount: models.filter((item) => item.sourceType === "Open Weight").length,
		},
		version: 1,
	};

	const runtimeSnapshot = buildRuntimeSnapshot(snapshot);

	await mkdir(path.dirname(outputPath), { recursive: true });
	await mkdir(path.dirname(runtimeOutputPath), { recursive: true });
	await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
	await writeFile(runtimeOutputPath, formatGeneratedRuntimeModule(runtimeSnapshot), "utf8");

	console.log(`Wrote ${outputPath}`);
	console.log(`Wrote ${runtimeOutputPath}`);
	console.log(
		JSON.stringify(
			{
				modelsWithCatalogCoverage: snapshot.summary.modelsWithCatalogCoverage,
				openWeightModelCount: snapshot.summary.openWeightModelCount,
				providerCount: snapshot.sources.modelsDev.providerCount,
				providerModelCount: snapshot.sources.modelsDev.providerModelCount,
				rankedModelCount: snapshot.sources.benchLm.rankedModelCount,
			},
			null,
			2,
		),
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? (error.stack ?? error.message) : error);
	process.exitCode = 1;
});
