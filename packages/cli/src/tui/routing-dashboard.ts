import type { ProviderConfig } from "@ifi/oh-pi-core";
import type { AdaptiveRoutingSetupConfig } from "../types.js";
import type {
	PiPackageInstallScope,
	PiPackageInstallState,
	WritablePiPackageInstallScope,
} from "../utils/pi-packages.js";
import { detectPiPackageInstallScopes } from "../utils/pi-packages.js";

export const ROUTING_CATEGORIES = [
	{
		colony: ["scout"],
		label: "Quick discovery",
		name: "quick-discovery",
		recommended: ["groq", "ollama-cloud", "ollama", "openai"],
		subagents: ["scout"],
	},
	{
		colony: [],
		label: "Planning",
		name: "planning-default",
		recommended: ["openai", "ollama-cloud", "ollama", "groq"],
		subagents: ["planner", "context-builder"],
	},
	{
		colony: ["worker", "drone", "backend"],
		label: "Implementation",
		name: "implementation-default",
		recommended: ["openai", "ollama-cloud", "ollama", "groq"],
		subagents: ["worker"],
	},
	{
		colony: [],
		label: "Research",
		name: "research-default",
		recommended: ["openai", "groq", "ollama-cloud", "ollama"],
		subagents: ["researcher"],
	},
	{
		colony: ["soldier", "review"],
		label: "Review / critical validation",
		name: "review-critical",
		recommended: ["openai", "ollama-cloud", "ollama", "groq"],
		subagents: ["reviewer"],
	},
	{
		colony: ["design"],
		label: "Visual / design work",
		name: "visual-engineering",
		recommended: ["ollama-cloud", "ollama", "openai", "groq"],
		subagents: ["artist", "frontend-designer"],
	},
	{
		colony: ["multimodal"],
		label: "Multimodal media work",
		name: "multimodal-default",
		recommended: ["ollama-cloud", "ollama", "openai", "groq"],
		subagents: ["multimodal-summariser"],
	},
] as const;

const OPTIONAL_ROUTING_PACKAGES = [
	{
		hint: "Optional /route command and per-prompt auto routing",
		label: "Adaptive routing package",
		packageName: "@ifi/pi-extension-adaptive-routing",
	},
	{
		hint: "Ollama local and Ollama Cloud model support",
		label: "Ollama provider package",
		packageName: "@ifi/pi-provider-ollama",
	},
	{
		hint: "cursor-agent provider support",
		label: "Cursor provider package",
		packageName: "@ifi/pi-provider-cursor",
	},
	{
		hint: "Catalog-backed provider and model discovery helpers",
		label: "Provider catalog package",
		packageName: "@ifi/pi-provider-catalog",
	},
] as const;

export interface OptionalRoutingPackageState {
	packageName: string;
	label: string;
	hint: string;
	scope: PiPackageInstallScope;
	installed: boolean;
	selected: boolean;
	selectedScope?: WritablePiPackageInstallScope;
}

export interface PendingOptionalRoutingPackageSelection {
	packageName: string;
	scope: WritablePiPackageInstallScope;
}

interface RoutingDashboardOptions {
	providers: ProviderConfig[];
	config?: AdaptiveRoutingSetupConfig;
	packageStates?: OptionalRoutingPackageState[];
}

export function detectOptionalRoutingPackages(
	detectStates: (packageNames: string[]) => PiPackageInstallState[] = detectPiPackageInstallScopes,
	selectedPackages: PendingOptionalRoutingPackageSelection[] = [],
): OptionalRoutingPackageState[] {
	const selected = new Map(selectedPackages.map((pkg) => [pkg.packageName, pkg.scope]));
	const states = new Map(
		detectStates(OPTIONAL_ROUTING_PACKAGES.map((pkg) => pkg.packageName)).map((pkg) => [pkg.packageName, pkg]),
	);
	return OPTIONAL_ROUTING_PACKAGES.map((pkg) => {
		const state = states.get(pkg.packageName);
		const scope = state?.scope ?? "none";
		const selectedScope = selected.get(pkg.packageName);
		return {
			...pkg,
			installed: scope !== "none",
			scope,
			selected: selectedScope !== undefined,
			selectedScope,
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
			defaultModel: provider.defaultModel ?? previous?.defaultModel,
			discoveredModels: provider.discoveredModels ?? previous?.discoveredModels,
			name,
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
	if (pkg.selectedScope) {
		return `selected for install (${pkg.selectedScope})`;
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
