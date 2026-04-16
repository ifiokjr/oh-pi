import * as p from "@clack/prompts";
import type { ProviderConfig } from "@ifi/oh-pi-core";
import type { AdaptiveRoutingModeConfig, AdaptiveRoutingSetupConfig } from "../types.js";
import { buildRoutingDashboard, ROUTING_CATEGORIES } from "./routing-dashboard.js";

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
	currentConfig?: AdaptiveRoutingSetupConfig,
): Promise<AdaptiveRoutingSetupConfig | undefined> {
	const providerNames = uniqueProviderNames(providers);
	if (providerNames.length === 0) {
		return undefined;
	}

	p.note(
		buildRoutingDashboard({
			providers,
			config: currentConfig,
		}),
		"Provider & Routing Dashboard",
	);

	const shouldConfigure = await p.confirm({
		message: currentConfig
			? "Edit startup provider assignments for session, subagents, and ant-colony?"
			: providerNames.length > 1
				? "Configure startup provider assignments for session, subagents, and ant-colony?"
				: `Use ${providerNames[0]} for delegated subagent and colony routing?`,
		initialValue: currentConfig ? true : providerNames.length > 1,
	});
	if (p.isCancel(shouldConfigure)) {
		p.cancel("Cancelled.");
		process.exit(0);
	}
	if (!shouldConfigure) {
		return currentConfig;
	}

	const mode = await p.select<AdaptiveRoutingModeConfig>({
		initialValue: currentConfig?.mode ?? "off",
		message: "Prompt routing mode for the optional adaptive-routing package:",
		options: [
			{ value: "off", label: "Off", hint: "Only delegated startup assignments; no per-prompt auto routing" },
			{ value: "shadow", label: "Shadow", hint: "Suggest routes without switching models automatically" },
			{ value: "auto", label: "Auto", hint: "Automatically switch models before each turn" },
		],
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
			initialValue: currentConfig?.categories[category.name]?.[0] ?? suggestedProvider(category, providerNames),
		});
		if (p.isCancel(preferred)) {
			p.cancel("Cancelled.");
			process.exit(0);
		}
		categories[category.name] = orderProviders(preferred, providerNames);
	}

	const config = { mode, categories };

	p.note(
		buildRoutingDashboard({
			providers,
			config,
		}),
		"Provider & Routing Dashboard",
	);

	return config;
}

export function summarizeAdaptiveRouting(config: AdaptiveRoutingSetupConfig | undefined): string {
	if (!config) {
		return "not configured";
	}
	return `${config.mode} · ${Object.keys(config.categories).length} categories`;
}
