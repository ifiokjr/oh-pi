import * as p from "@clack/prompts";
import { t } from "@ifi/oh-pi-core";
import { EXTENSIONS } from "@ifi/oh-pi-core";
import type { OhPConfig } from "@ifi/oh-pi-core";
import chalk from "chalk";
import type { EnvInfo } from "../utils/detect.js";
import { selectAgents } from "./agents-select.js";
import { selectExtensions } from "./extension-select.js";
import { selectKeybindings } from "./keybinding-select.js";
import { type ProviderSetupResult, setupProviders } from "./provider-setup.js";
import { selectTheme } from "./theme-select.js";

export type WizardBaseConfig = Pick<
	OhPConfig,
	"theme" | "keybindings" | "extensions" | "prompts" | "agents" | "thinking"
>;
type WizardStep = "providers" | "appearance" | "features" | "agents" | "finish";

interface WizardState {
	providerSetup: ProviderSetupResult | null;
	theme: string;
	keybindings: string;
	extensions: string[];
	prompts: string[];
	agents: string;
	thinking: string;
}

function sectionLabel(label: string, done: boolean): string {
	return done ? `${label} ${chalk.green("✓")}` : `${label} ${chalk.yellow("•")}`;
}

function summarizeAppearance(theme: string, keybindings: string): string {
	return `${t("confirm.theme")} ${theme} · ${t("confirm.keybindings")} ${keybindings}`;
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
			value: "providers" as const,
			label: sectionLabel(t("custom.tabProviders"), !!state.providerSetup),
			hint: summarizeProviders(state.providerSetup),
		},
		{
			value: "appearance" as const,
			label: sectionLabel(t("custom.tabAppearance"), true),
			hint: summarizeAppearance(state.theme, state.keybindings),
		},
		{
			value: "features" as const,
			label: sectionLabel(t("custom.tabFeatures"), true),
			hint: summarizeFeatures(state.extensions),
		},
		{
			value: "agents" as const,
			label: sectionLabel(t("custom.tabAgents"), true),
			hint: summarizeAgents(state.agents),
		},
		{
			value: "finish" as const,
			label: sectionLabel(t("custom.tabFinish"), !!state.providerSetup),
			hint: state.providerSetup ? t("custom.finishReady") : t("custom.needProviders"),
		},
	];
}

export async function runConfigWizard(env: EnvInfo, initial: WizardBaseConfig): Promise<OhPConfig> {
	const defaultExtensions = EXTENSIONS.filter((e) => e.default).map((e) => e.name);
	const state: WizardState = {
		providerSetup: null,
		theme: initial.theme,
		keybindings: initial.keybindings,
		extensions: initial.extensions.length > 0 ? [...initial.extensions] : defaultExtensions,
		prompts: initial.prompts,
		agents: initial.agents,
		thinking: initial.thinking,
	};

	let nextStep: WizardStep = "providers";
	while (true) {
		const step = await p.select({
			message: t("custom.tabPrompt"),
			options: buildWizardOptions(state),
			initialValue: nextStep,
		});
		if (p.isCancel(step)) {
			p.cancel(t("cancelled"));
			process.exit(0);
		}

		if (step === "providers") {
			state.providerSetup = await setupProviders(env);
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
			providers: state.providerSetup.providers,
			providerStrategy: state.providerSetup.providerStrategy,
			theme: state.theme,
			keybindings: state.keybindings,
			extensions: state.extensions,
			prompts: state.prompts,
			agents: state.agents,
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
