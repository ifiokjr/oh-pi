import * as p from "@clack/prompts";
import type { ProviderConfig } from "@ifi/oh-pi-core";
import type { AdaptiveRoutingModeConfig, AdaptiveRoutingSetupConfig } from "../types.js";
import { installPiPackages } from "../utils/pi-packages.js";
import {
	buildRoutingDashboard,
	detectOptionalRoutingPackages,
	ROUTING_CATEGORIES,
	suggestOptionalRoutingPackages,
} from "./routing-dashboard.js";

interface SetupAdaptiveRoutingOptions {
	piInstalled?: boolean;
}

function uniqueProviderNames(providers: ProviderConfig[]): string[] {
	return [...new Set(providers.map((provider) => provider.name.trim()).filter(Boolean))];
}

function exitOnCancel<T>(value: T): Exclude<T, symbol> {
	if (p.isCancel(value)) {
		p.cancel("Cancelled.");
		process.exit(0);
	}
	return value as Exclude<T, symbol>;
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

async function maybeInstallOptionalPackages(
	providers: ProviderConfig[],
	config: AdaptiveRoutingSetupConfig | undefined,
	providerNames: string[],
	options: SetupAdaptiveRoutingOptions,
): Promise<void> {
	const packageStates = detectOptionalRoutingPackages();
	const missingPackages = packageStates.filter((pkg) => !pkg.installed);
	if (missingPackages.length === 0) {
		return;
	}

	if (options.piInstalled === false) {
		p.note(
			"pi is not installed yet. Finish setup first, then reopen the routing dashboard to install optional routing packages.",
			"Optional Packages",
		);
		return;
	}

	const suggestedPackages = new Set(suggestOptionalRoutingPackages(providerNames, config));
	const shouldInstall = exitOnCancel(
		await p.confirm({
			message: "Install missing optional routing/provider packages from this dashboard?",
			initialValue: suggestedPackages.size > 0,
		}),
	);
	if (!shouldInstall) {
		return;
	}

	const selectedPackages = exitOnCancel(
		await p.multiselect<string>({
			message: "Select optional packages to install",
			options: missingPackages.map((pkg) => ({
				value: pkg.packageName,
				label: pkg.label,
				hint: pkg.hint,
			})),
			initialValues: missingPackages
				.filter((pkg) => suggestedPackages.has(pkg.packageName))
				.map((pkg) => pkg.packageName),
		}),
	);
	if (selectedPackages.length === 0) {
		return;
	}

	const spinner = p.spinner();
	spinner.start("Installing optional routing packages");
	try {
		installPiPackages(selectedPackages);
		spinner.stop(`Installed ${selectedPackages.length} optional package(s). Restart pi after setup to load them.`);
	} catch (error) {
		spinner.stop("Optional package install failed.");
		p.log.warn(String(error));
	}

	p.note(
		buildRoutingDashboard({
			providers,
			config,
		}),
		"Provider & Routing Dashboard",
	);
}

export async function setupAdaptiveRouting(
	providers: ProviderConfig[],
	currentConfig?: AdaptiveRoutingSetupConfig,
	options: SetupAdaptiveRoutingOptions = {},
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

	await maybeInstallOptionalPackages(providers, currentConfig, providerNames, options);

	const shouldConfigure = exitOnCancel(
		await p.confirm({
			message: currentConfig
				? "Edit startup provider assignments for session, subagents, and ant-colony?"
				: providerNames.length > 1
					? "Configure startup provider assignments for session, subagents, and ant-colony?"
					: `Use ${providerNames[0]} for delegated subagent and colony routing?`,
			initialValue: currentConfig ? true : providerNames.length > 1,
		}),
	);
	if (!shouldConfigure) {
		return currentConfig;
	}

	const mode = exitOnCancel(
		await p.select<AdaptiveRoutingModeConfig>({
			initialValue: currentConfig?.mode ?? "off",
			message: "Prompt routing mode for the optional adaptive-routing package:",
			options: [
				{ value: "off", label: "Off", hint: "Only delegated startup assignments; no per-prompt auto routing" },
				{ value: "shadow", label: "Shadow", hint: "Suggest routes without switching models automatically" },
				{ value: "auto", label: "Auto", hint: "Automatically switch models before each turn" },
			],
		}),
	);

	const categories: Record<string, string[]> = {};
	for (const category of ROUTING_CATEGORIES) {
		const preferred = exitOnCancel(
			await p.select<string>({
				message: `${category.label} should prefer which provider?`,
				options: providerNames.map((provider) => ({
					value: provider,
					label: provider,
					hint: `Fallback order: ${orderProviders(provider, providerNames).join(" → ")}`,
				})),
				initialValue: currentConfig?.categories[category.name]?.[0] ?? suggestedProvider(category, providerNames),
			}),
		);
		categories[category.name] = orderProviders(preferred, providerNames);
	}

	const config = { mode, categories };
	await maybeInstallOptionalPackages(providers, config, providerNames, options);

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
