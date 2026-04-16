import type { ProviderConfig } from "@ifi/oh-pi-core";
import type { AdaptiveRoutingSetupConfig } from "../types.js";
import type { PiPackageInstallScope, PiPackageInstallState } from "../utils/pi-packages.js";
import { detectPiPackageInstallScopes } from "../utils/pi-packages.js";

export const ROUTING_CATEGORIES = [
	{
		name: "quick-discovery",
		label: "Quick discovery",
		recommended: ["groq", "ollama-cloud", "ollama", "openai"],
		subagents: ["scout"],
		colony: ["scout"],
	},
	{
		name: "planning-default",
		label: "Planning",
		recommended: ["openai", "ollama-cloud", "ollama", "groq"],
		subagents: ["planner", "context-builder"],
		colony: [],
	},
	{
		name: "implementation-default",
		label: "Implementation",
		recommended: ["openai", "ollama-cloud", "ollama", "groq"],
		subagents: ["worker"],
		colony: ["worker", "drone", "backend"],
	},
	{
		name: "research-default",
		label: "Research",
		recommended: ["openai", "groq", "ollama-cloud", "ollama"],
		subagents: ["researcher"],
		colony: [],
	},
	{
		name: "review-critical",
		label: "Review / critical validation",
		recommended: ["openai", "ollama-cloud", "ollama", "groq"],
		subagents: ["reviewer"],
		colony: ["soldier", "review"],
	},
	{
		name: "visual-engineering",
		label: "Visual / design work",
		recommended: ["ollama-cloud", "ollama", "openai", "groq"],
		subagents: ["artist", "frontend-designer"],
		colony: ["design"],
	},
	{
		name: "multimodal-default",
		label: "Multimodal media work",
		recommended: ["ollama-cloud", "ollama", "openai", "groq"],
		subagents: ["multimodal-summariser"],
		colony: ["multimodal"],
	},
] as const;

const OPTIONAL_ROUTING_PACKAGES = [
	{
		packageName: "@ifi/pi-extension-adaptive-routing",
		label: "Adaptive routing package",
		hint: "Optional /route command and per-prompt auto routing",
	},
	{
		packageName: "@ifi/pi-provider-ollama",
		label: "Ollama provider package",
		hint: "Ollama local and Ollama Cloud model support",
	},
	{
		packageName: "@ifi/pi-provider-cursor",
		label: "Cursor provider package",
		hint: "cursor-agent provider support",
	},
	{
		packageName: "@ifi/pi-provider-catalog",
		label: "Provider catalog package",
		hint: "Catalog-backed provider and model discovery helpers",
	},
] as const;

export interface OptionalRoutingPackageState {
	packageName: string;
	label: string;
	hint: string;
	scope: PiPackageInstallScope;
	installed: boolean;
	selected: boolean;
}

interface RoutingDashboardOptions {
	providers: ProviderConfig[];
	config?: AdaptiveRoutingSetupConfig;
	packageStates?: OptionalRoutingPackageState[];
}

export function detectOptionalRoutingPackages(
	detectStates: (packageNames: string[]) => PiPackageInstallState[] = detectPiPackageInstallScopes,
	selectedPackages: string[] = [],
): OptionalRoutingPackageState[] {
	const selected = new Set(selectedPackages);
	const states = new Map(
		detectStates(OPTIONAL_ROUTING_PACKAGES.map((pkg) => pkg.packageName)).map((pkg) => [pkg.packageName, pkg]),
	);
	return OPTIONAL_ROUTING_PACKAGES.map((pkg) => {
		const state = states.get(pkg.packageName);
		const scope = state?.scope ?? "none";
		return {
			...pkg,
			scope,
			installed: scope !== "none",
			selected: selected.has(pkg.packageName),
		};
	});
}

export function suggestOptionalRoutingPackages(providerNames: string[], config?: AdaptiveRoutingSetupConfig): string[] {
	const packages: string[] = [];
	if (config && config.mode !== "off") {
		packages.push("@ifi/pi-extension-adaptive-routing");
	}
	if (providerNames.some((provider) => provider === "ollama" || provider === "ollama-cloud")) {
		packages.push("@ifi/pi-provider-ollama");
	}
	if (providerNames.some((provider) => provider === "cursor" || provider === "cursor-agent")) {
		packages.push("@ifi/pi-provider-cursor");
	}
	return [...new Set(packages)];
}

function mergeProviderConfigs(providers: ProviderConfig[]): ProviderConfig[] {
	const merged = new Map<string, ProviderConfig>();
	for (const provider of providers) {
		const name = provider.name.trim();
		if (!name) {
			continue;
		}
		const previous = merged.get(name);
		merged.set(name, {
			...previous,
			...provider,
			name,
			defaultModel: provider.defaultModel ?? previous?.defaultModel,
			discoveredModels: provider.discoveredModels ?? previous?.discoveredModels,
		});
	}
	return [...merged.values()];
}

function primaryModel(provider: ProviderConfig): string | undefined {
	return provider.defaultModel ?? provider.discoveredModels?.[0]?.id;
}

function formatProviderModel(provider: ProviderConfig): string {
	const model = primaryModel(provider);
	return model ? `${provider.name}/${model}` : `${provider.name}/<configured externally>`;
}

function resolveCategoryTarget(
	categoryName: string,
	providers: ProviderConfig[],
	config?: AdaptiveRoutingSetupConfig,
): string {
	if (!config) {
		return "session default";
	}
	const providerOrder = config.categories[categoryName] ?? [];
	for (const providerName of providerOrder) {
		const provider = providers.find((entry) => entry.name === providerName);
		if (provider) {
			return formatProviderModel(provider);
		}
	}
	return "session default";
}

function formatPackageState(pkg: OptionalRoutingPackageState): string {
	if (pkg.installed) {
		return `installed (${pkg.scope})`;
	}
	if (pkg.selected) {
		return "selected for install";
	}
	return "not installed";
}

function buildOptionalPackageLines(packageStates: OptionalRoutingPackageState[]): string[] {
	return packageStates.map((pkg) => {
		const installHint = pkg.installed || pkg.selected ? "" : ` · install with pi install npm:${pkg.packageName}`;
		return `- ${pkg.label}: ${formatPackageState(pkg)} — ${pkg.hint}${installHint}`;
	});
}

function buildProviderLines(providers: ProviderConfig[]): string[] {
	if (providers.length === 0) {
		return ["- none selected yet"];
	}
	return providers.map((provider) => {
		const discoveredCount = provider.discoveredModels?.length ?? 0;
		const discoveredSuffix = discoveredCount > 1 ? ` · ${discoveredCount} discovered models` : "";
		return `- ${formatProviderModel(provider)}${discoveredSuffix}`;
	});
}

function buildDelegatedAssignmentLines(config: AdaptiveRoutingSetupConfig | undefined): string[] {
	if (!config) {
		return ["- delegated startup assignments not configured"];
	}
	return ROUTING_CATEGORIES.map((category) => {
		const order = config.categories[category.name]?.join(" → ") ?? "session default";
		return `- ${category.label}: ${order}`;
	});
}

function buildConsumerLines(
	title: string,
	providers: ProviderConfig[],
	config: AdaptiveRoutingSetupConfig | undefined,
	consumerKey: "subagents" | "colony",
): string[] {
	const lines = [`${title}:`];
	for (const category of ROUTING_CATEGORIES) {
		const consumers = category[consumerKey];
		if (consumers.length === 0) {
			continue;
		}
		lines.push(
			`- ${consumers.join(", ")} → ${resolveCategoryTarget(category.name, providers, config)} (${category.label})`,
		);
	}
	return lines;
}

export function buildRoutingDashboard({
	providers,
	config,
	packageStates = detectOptionalRoutingPackages(),
}: RoutingDashboardOptions): string {
	const mergedProviders = mergeProviderConfigs(providers);
	const sessionDefault = mergedProviders[0] ? formatProviderModel(mergedProviders[0]) : "not configured";

	return [
		"Optional routing / provider packages:",
		...buildOptionalPackageLines(packageStates),
		"",
		"Available providers / models:",
		...buildProviderLines(mergedProviders),
		"",
		"Delegated assignments:",
		...buildDelegatedAssignmentLines(config),
		"",
		"Effective routing:",
		`Session default: ${sessionDefault}`,
		...buildConsumerLines("Subagents", mergedProviders, config, "subagents"),
		...buildConsumerLines("Ant colony", mergedProviders, config, "colony"),
	].join("\n");
}
