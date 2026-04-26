import * as p from "@clack/prompts";
import type { OhPConfig } from "@ifi/oh-pi-core";
import { t } from "@ifi/oh-pi-core";

interface Preset extends Omit<OhPConfig, "providers"> {}

/**
 * Registry of built-in configuration presets (Full Power / Clean / Colony).
 * Each entry maps a preset key to its i18n label/hint keys and a full {@link Preset} config object.
 */
export const PRESETS: Record<string, { labelKey: string; hintKey: string; config: Preset }> = {
	clean: {
		config: {
			agents: "general-developer",
			extensions: [],
			keybindings: "default",
			prompts: [],
			theme: "dark",
			thinking: "off",
		},
		hintKey: "preset.cleanHint",
		labelKey: "preset.clean",
	},
	colony: {
		config: {
			agents: "colony-operator",
			extensions: ["ant-colony", "auto-session-name", "compact-header"],
			keybindings: "default",
			prompts: ["review", "fix", "explain", "commit"],
			theme: "dark",
			thinking: "medium",
		},
		hintKey: "preset.colonyHint",
		labelKey: "preset.colony",
	},
	full: {
		config: {
			agents: "colony-operator",
			extensions: [
				"git-guard",
				"auto-session-name",
				"custom-footer",
				"compact-header",
				"ant-colony",
				"auto-update",
				"bg-process",
			],
			keybindings: "default",
			prompts: ["review", "fix", "explain", "commit", "test", "refactor", "optimize", "security", "document", "pr"],
			theme: "dark",
			thinking: "high",
		},
		hintKey: "preset.fullHint",
		labelKey: "preset.full",
	},
};

/**
 * Prompts the user to select a configuration preset via an interactive TUI menu.
 * Exits the process if the user cancels the selection.
 * @returns The {@link Preset} configuration object for the chosen preset.
 */
export async function selectPreset(): Promise<Preset> {
	const key = await p.select({
		message: t("preset.select"),
		options: Object.entries(PRESETS).map(([k, v]) => ({
			hint: t(v.hintKey),
			label: t(v.labelKey),
			value: k,
		})),
	});
	if (p.isCancel(key)) {
		p.cancel(t("cancelled"));
		process.exit(0);
	}
	return PRESETS[key]?.config;
}
