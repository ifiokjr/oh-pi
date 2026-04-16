import * as p from "@clack/prompts";
import type { AdaptiveRoutingModeConfig, AdaptiveRoutingSetupConfig, ProviderConfig } from "@ifi/oh-pi-core";

const ROUTING_CATEGORIES = [
	{ name: "quick-discovery", label: "Quick discovery", recommended: ["groq", "ollama-cloud", "ollama", "openai"] },
	{ name: "planning-default", label: "Planning", recommended: ["openai", "ollama-cloud", "ollama", "groq"] },
	{
		name: "implementation-default",
		label: "Implementation",
		recommended: ["openai", "ollama-cloud", "ollama", "groq"],
	},
	{ name: "research-default", label: "Research", recommended: ["openai", "groq", "ollama-cloud", "ollama"] },
	{
		name: "review-critical",
		label: "Review / critical validation",
		recommended: ["openai", "ollama-cloud", "ollama", "groq"],
	},
	{
		name: "visual-engineering",
		label: "Visual / design work",
		recommended: ["ollama-cloud", "ollama", "openai", "groq"],
	},
	{
		name: "multimodal-default",
		label: "Multimodal media work",
		recommended: ["ollama-cloud", "ollama", "openai", "groq"],
	},
] as const;

function uniqueProviderNames(providers: ProviderConfig[]): string[] {
	return [...new Set(providers.map((provider) => provider.name.trim()).filter(Boolean))];
}

function orderProviders(preferred: string, providers: string[]): string[] {
	return [preferred, ...providers.filter((provider) => provider !== preferred)];
}

function suggestedProvider(category: (typeof ROUTING_CATEGORIES)[number], providers: string[]): string {
	for (const provider of category.recommended) {
		if (providers.includes(provider)) {
			return provider;
		}
	}
	return providers[0] ?? "";
}

export async function setupAdaptiveRouting(
	providers: ProviderConfig[],
): Promise<AdaptiveRoutingSetupConfig | undefined> {
	const providerNames = uniqueProviderNames(providers);
	if (providerNames.length === 0) {
		return undefined;
	}

	const shouldConfigure = await p.confirm({
		message:
			providerNames.length > 1
				? "Configure startup provider assignments for subagents and ant-colony?"
				: `Use ${providerNames[0]} for delegated subagent and colony routing?`,
		initialValue: providerNames.length > 1,
	});
	if (p.isCancel(shouldConfigure)) {
		p.cancel("Cancelled.");
		process.exit(0);
	}
	if (!shouldConfigure) {
		return undefined;
	}

	const mode = await p.select<AdaptiveRoutingModeConfig>({
		message: "Prompt routing mode for the optional adaptive-routing package:",
		options: [
			{ value: "off", label: "Off", hint: "Only delegated startup assignments; no per-prompt auto routing" },
			{ value: "shadow", label: "Shadow", hint: "Suggest routes without switching models automatically" },
			{ value: "auto", label: "Auto", hint: "Automatically switch models before each turn" },
		],
		initialValue: "off",
	});
	if (p.isCancel(mode)) {
		p.cancel("Cancelled.");
		process.exit(0);
	}

	const categories: Record<string, string[]> = {};
	for (const category of ROUTING_CATEGORIES) {
		const preferred = await p.select<string>({
			message: `${category.label} should prefer which provider?`,
			options: providerNames.map((provider) => ({
				value: provider,
				label: provider,
				hint: `Fallback order: ${orderProviders(provider, providerNames).join(" → ")}`,
			})),
			initialValue: suggestedProvider(category, providerNames),
		});
		if (p.isCancel(preferred)) {
			p.cancel("Cancelled.");
			process.exit(0);
		}
		categories[category.name] = orderProviders(preferred, providerNames);
	}

	return { mode, categories };
}

export function summarizeAdaptiveRouting(config: AdaptiveRoutingSetupConfig | undefined): string {
	if (!config) {
		return "not configured";
	}
	return `${config.mode} · ${Object.keys(config.categories).length} categories`;
}
