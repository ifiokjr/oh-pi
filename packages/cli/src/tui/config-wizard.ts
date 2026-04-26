import * as p from "@clack/prompts";
import { EXTENSIONS, t } from "@ifi/oh-pi-core";
import chalk from "chalk";
import type { OhPConfigWithRouting } from "../types.js";
import type { EnvInfo } from "../utils/detect.js";
import { selectAgents } from "./agents-select.js";
import { selectExtensions } from "./extension-select.js";
import { selectKeybindings } from "./keybinding-select.js";
import { setupProviders } from "./provider-setup.js";
import type { ProviderSetupResult } from "./provider-setup.js";
import { setupAdaptiveRouting, summarizeAdaptiveRouting } from "./routing-setup.js";
import { selectTheme } from "./theme-select.js";

export type WizardBaseConfig = Pick<
	OhPConfigWithRouting,
	"theme" | "keybindings" | "extensions" | "prompts" | "agents" | "thinking"
>;
type WizardStep = "providers" | "routing" | "appearance" | "features" | "agents" | "finish";

interface WizardState {
	providerSetup: ProviderSetupResult | null;
	adaptiveRouting: OhPConfigWithRouting["adaptiveRouting"];
	theme: string;
	keybindings: string;
	extensions: string[];
	prompts: string[];
	agents: string;
	thinking: string;
}

function sectionLabel(label: string, done: boolean): string {
	return done ? `${label} ${chalk.green("+")}` : `${label} ${chalk.yellow("•")}`;
}

function summarizeAppearance(theme: string, keybindings: string): string {
	return `${t("confirm.theme")} ${theme} · ${t("confirm.keybindings")} ${keybindings}`;
}

function summarizeRouting(config: OhPConfigWithRouting["adaptiveRouting"]): string {
	return `Routing ${summarizeAdaptiveRouting(config)}`;
}

function summarizeFeatures(extensions: string[]): string {
	return t("custom.tabFeaturesHint", { count: extensions.length });
}

function summarizeAgents(agents: string): string {
	return `${t("confirm.agents")} ${agents}`;
}

function buildWizardOptions(state: WizardState) {
	return [
		{
			hint: summarizeProviders(state.providerSetup),
			label: sectionLabel(t("custom.tabProviders"), !!state.providerSetup),
			value: "providers" as const,
		},
		{
			hint: summarizeRouting(state.adaptiveRouting),
			label: sectionLabel("Routing Dashboard", !!state.providerSetup),
			value: "routing" as const,
		},
		{
			hint: summarizeAppearance(state.theme, state.keybindings),
			label: sectionLabel(t("custom.tabAppearance"), true),
			value: "appearance" as const,
		},
		{
			hint: summarizeFeatures(state.extensions),
			label: sectionLabel(t("custom.tabFeatures"), true),
			value: "features" as const,
		},
		{
			hint: summarizeAgents(state.agents),
			label: sectionLabel(t("custom.tabAgents"), true),
			value: "agents" as const,
		},
		{
			hint: state.providerSetup ? t("custom.finishReady") : t("custom.needProviders"),
			label: sectionLabel(t("custom.tabFinish"), !!state.providerSetup),
			value: "finish" as const,
		},
	];
}

export async function runConfigWizard(env: EnvInfo, initial: WizardBaseConfig): Promise<OhPConfigWithRouting> {
	const defaultExtensions = EXTENSIONS.filter((e) => e.default).map((e) => e.name);
	const state: WizardState = {
		adaptiveRouting: undefined,
		agents: initial.agents,
		extensions: initial.extensions.length > 0 ? [...initial.extensions] : defaultExtensions,
		keybindings: initial.keybindings,
		prompts: initial.prompts,
		providerSetup: null,
		theme: initial.theme,
		thinking: initial.thinking,
	};

	let nextStep: WizardStep = "providers";
	while (true) {
		const step = await p.select({
			initialValue: nextStep,
			message: t("custom.tabPrompt"),
			options: buildWizardOptions(state),
		});
		if (p.isCancel(step)) {
			p.cancel(t("cancelled"));
			process.exit(0);
		}

		if (step === "providers") {
			state.providerSetup = await setupProviders(env);
			state.adaptiveRouting = await setupAdaptiveRouting(
				[...(env.existingProviders ?? []).map((name) => ({ apiKey: "none", name })), ...state.providerSetup.providers],
				state.adaptiveRouting,
			);
			nextStep = "routing";
			continue;
		}

		if (step === "routing") {
			if (!state.providerSetup) {
				p.log.warn(t("custom.needProviders"));
				nextStep = "providers";
				continue;
			}
			state.adaptiveRouting = await setupAdaptiveRouting(
				[...(env.existingProviders ?? []).map((name) => ({ apiKey: "none", name })), ...state.providerSetup.providers],
				state.adaptiveRouting,
			);
			nextStep = "appearance";
			continue;
		}

		if (step === "appearance") {
			state.theme = await selectTheme(state.theme);
			state.keybindings = await selectKeybindings(state.keybindings);
			nextStep = "features";
			continue;
		}

		if (step === "features") {
			state.extensions = await selectExtensions(state.extensions);
			nextStep = "agents";
			continue;
		}

		if (step === "agents") {
			state.agents = await selectAgents(state.agents);
			nextStep = "finish";
			continue;
		}

		if (!state.providerSetup) {
			p.log.warn(t("custom.needProviders"));
			nextStep = "providers";
			continue;
		}

		return {
			adaptiveRouting: state.adaptiveRouting,
			agents: state.agents,
			extensions: state.extensions,
			keybindings: state.keybindings,
			prompts: state.prompts,
			providerStrategy: state.providerSetup.providerStrategy,
			providers: state.providerSetup.providers,
			theme: state.theme,
			thinking: state.thinking,
		};
	}
}

export function summarizeProviders(setup: ProviderSetupResult | null): string {
	if (!setup) {
		return t("custom.providersUnset");
	}

	if (setup.providerStrategy === "keep") {
		return t("confirm.providerStrategyKeep");
	}

	if (setup.providerStrategy === "add") {
		return setup.providers.length > 0
			? t("custom.providersAdd", { list: setup.providers.map((p) => p.name).join(", ") })
			: t("confirm.providerStrategyAdd");
	}

	if (setup.providers.length === 0) {
		return t("confirm.providerStrategyReplace");
	}

	return t("custom.providersReplace", { list: setup.providers.map((p) => p.name).join(", ") });
}
