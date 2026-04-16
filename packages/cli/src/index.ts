import type { OhPConfig } from "@ifi/oh-pi-core";
import { EXTENSIONS, getLocale, selectLanguage } from "@ifi/oh-pi-core";
import { runConfigWizard, type WizardBaseConfig } from "./tui/config-wizard.js";
import { confirmApply } from "./tui/confirm-apply.js";
import { selectMode } from "./tui/mode-select.js";
import { selectPreset } from "./tui/preset-select.js";
import { setupProviders } from "./tui/provider-setup.js";
import { setupAdaptiveRouting } from "./tui/routing-setup.js";
import { welcome } from "./tui/welcome.js";
import { detectEnv, type EnvInfo } from "./utils/detect.js";

/**
 * Main entry point — orchestrates the full oh-pi setup flow:
 * detect environment → select language → welcome → choose mode → configure → apply.
 */
export async function run() {
	const env = await detectEnv();
	await selectLanguage();
	welcome(env);

	const mode = await selectMode(env);
	let config: OhPConfig;

	if (mode === "quick") {
		config = await quickFlow(env);
	} else if (mode === "preset") {
		config = await presetFlow(env);
	} else {
		config = await customFlow(env);
	}

	config.locale = getLocale();
	await confirmApply(config, env);
}

/**
 * Quick mode — only ask for provider setup, use sensible defaults for everything else.
 * @param env - Detected environment info
 * @returns Generated config with recommended defaults
 */
async function quickFlow(env: EnvInfo): Promise<OhPConfig> {
	const providerSetup = await setupProviders(env);
	const adaptiveRouting = await setupAdaptiveRouting([
		...(env.existingProviders ?? []).map((name) => ({ name, apiKey: "none" })),
		...providerSetup.providers,
	]);
	return {
		...providerSetup,
		adaptiveRouting,
		theme: "dark",
		keybindings: "default",
		extensions: ["git-guard", "auto-session-name", "custom-footer", "compact-header", "auto-update"],
		prompts: ["review", "fix", "explain", "commit", "test"],
		agents: "general-developer",
		thinking: "medium",
	};
}

/**
 * Preset mode — user picks a role-based preset, then configures providers.
 * @param env - Detected environment info
 * @returns Generated config based on selected preset
 */
async function presetFlow(env: EnvInfo): Promise<OhPConfig> {
	const preset = await selectPreset();
	return runConfigWizard(env, preset);
}

/**
 * Custom mode — user picks theme, keybindings, extensions, agents, and advanced options.
 * @param env - Detected environment info
 * @returns Fully customized config
 */
function customFlow(env: EnvInfo): Promise<OhPConfig> {
	const defaultExtensions = EXTENSIONS.filter((e) => e.default).map((e) => e.name);
	const initial: WizardBaseConfig = {
		theme: "dark",
		keybindings: "default",
		extensions: defaultExtensions,
		prompts: ["review", "fix", "explain", "commit", "test", "refactor", "optimize", "security", "document", "pr"],
		agents: "general-developer",
		thinking: "medium",
	};
	return runConfigWizard(env, initial);
}
