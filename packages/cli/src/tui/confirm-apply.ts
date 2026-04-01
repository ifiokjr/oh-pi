import * as p from "@clack/prompts";
import { type OhPConfig, resolvePiAgentDir, t } from "@ifi/oh-pi-core";
import chalk from "chalk";
import type { EnvInfo } from "../utils/detect.js";
import { applyConfig, backupConfig, installPi } from "../utils/install.js";

/**
 * Count the number of existing config files under a given directory prefix.
 * @param env - Environment info
 * @param dir - Directory name prefix
 * @returns number of matching files
 */
export function countExisting(env: EnvInfo, dir: string): number {
	return env.existingFiles.filter((f) => f.startsWith(`${dir}/`)).length;
}

/**
 * Display the configuration summary, handle backup/overwrite of existing config, install pi if needed, and apply the final configuration.
 * @param config - the user's selected configuration
 * @param env - current environment info
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Interactive wizard confirmation flow with many user branches.
export async function confirmApply(config: OhPConfig, env: EnvInfo) {
	const keepProviders = config.providerStrategy === "keep";
	const addProviders = config.providerStrategy === "add";
	const providerNames =
		keepProviders || addProviders
			? t("confirm.skipped")
			: config.providers.length > 0
				? config.providers.map((p) => p.name).join(", ")
				: t("confirm.none");
	const primaryModel = keepProviders
		? t("confirm.skipped")
		: addProviders
			? t("confirm.skipped")
			: config.providers[0]?.defaultModel || t("confirm.none");
	const fallbackProviders = keepProviders
		? t("confirm.skipped")
		: addProviders
			? config.providers.length > 0
				? config.providers.map((p) => p.name).join(", ")
				: t("confirm.none")
			: config.providers.length > 1
				? config.providers
						.slice(1)
						.map((p) => p.name)
						.join(", ")
				: t("confirm.none");
	const providerStrategy = keepProviders
		? t("confirm.providerStrategyKeep")
		: addProviders
			? t("confirm.providerStrategyAdd")
			: t("confirm.providerStrategyReplace");

	// ═══ Summary ═══
	const summary = [
		`${t("confirm.providerStrategy")} ${chalk.cyan(providerStrategy)}`,
		`${t("confirm.providers")}  ${chalk.cyan(providerNames)}`,
		`${t("confirm.model")}      ${chalk.cyan(primaryModel)}`,
		`${t("confirm.fallbackProviders")} ${chalk.cyan(fallbackProviders)}`,
		`${t("confirm.theme")}      ${chalk.cyan(config.theme)}`,
		`${t("confirm.keybindings")}${chalk.cyan(config.keybindings)}`,
		`${t("confirm.thinking")}   ${chalk.cyan(config.thinking)}`,
		`${t("confirm.compaction")} ${chalk.cyan("auto")}`,
		`${t("confirm.extensions")} ${chalk.cyan(config.extensions.join(", ") || t("confirm.none"))}`,
		`${t("confirm.prompts")}    ${chalk.cyan(t("confirm.promptsValue", { count: config.prompts.length }))}`,
		`${t("confirm.agents")}     ${chalk.cyan(config.agents)}`,
	].join("\n");

	p.note(summary, t("confirm.title"));

	// ═══ Diff (if existing) ═══
	if (env.hasExistingConfig) {
		const diff = [
			`Extensions:  ${chalk.dim(countExisting(env, "extensions"))} ${chalk.yellow("→")} ${chalk.green(config.extensions.length)}`,
			`Prompts:     ${chalk.dim(countExisting(env, "prompts"))} ${chalk.yellow("→")} ${chalk.green(config.prompts.length)}`,
		].join("\n");
		p.note(diff, t("confirm.changes"));
	}

	// ═══ Backup prompt ═══
	if (env.hasExistingConfig) {
		const action = await p.select({
			message: t("confirm.existingDetected"),
			options: [
				{ value: "backup", label: t("confirm.backup"), hint: t("confirm.backupHint") },
				{ value: "overwrite", label: t("confirm.overwrite"), hint: t("confirm.overwriteHint") },
				{ value: "cancel", label: t("confirm.cancel"), hint: t("confirm.cancelHint") },
			],
		});
		if (p.isCancel(action) || action === "cancel") {
			p.cancel(t("confirm.noChanges"));
			return;
		}

		if (action === "backup") {
			const s = p.spinner();
			s.start(t("confirm.backingUp"));
			const backupDir = backupConfig();
			s.stop(t("confirm.backedUp", { dir: chalk.dim(backupDir) }));
		}
	} else {
		// New user — skip confirmation, apply directly
	}

	// ═══ Install pi if needed ═══
	if (!env.piInstalled) {
		const s = p.spinner();
		s.start(t("confirm.installingPi"));
		try {
			installPi();
			s.stop(t("confirm.piInstalled"));
		} catch (e) {
			s.stop(t("confirm.piFailed", { error: String(e) }));
			p.log.warn(t("confirm.piManual"));
		}
	}

	// ═══ Apply ═══
	const s = p.spinner();
	s.start(t("confirm.writing"));
	applyConfig(config);
	s.stop(t("confirm.applied"));

	// ═══ Result ═══
	const tree = [
		`${chalk.gray(`${resolvePiAgentDir()}/`)}`,
		`${chalk.gray("├── ")}auth.json ${chalk.dim("")}`,
		`${chalk.gray("├── ")}settings.json`,
		...(config.keybindings === "default" ? [] : [`${chalk.gray("├── ")}keybindings.json`]),
		`${chalk.gray("├── ")}AGENTS.md ${chalk.dim(config.agents)}`,
		...(config.extensions.length > 0
			? [`${chalk.gray("├── ")}extensions/ ${chalk.dim(`${config.extensions.length} items`)}`]
			: []),
		...(config.prompts.length > 0
			? [`${chalk.gray("├── ")}prompts/ ${chalk.dim(`${config.prompts.length} templates`)}`]
			: []),
		`${chalk.gray("├── ")}skills/ ${chalk.dim("auto-discovered")}`,
		...(["dark", "light"].includes(config.theme) ? [] : [`${chalk.gray("└── ")}themes/ ${chalk.dim(config.theme)}`]),
	].join("\n");

	p.note(tree, t("confirm.installed"));

	p.outro(t("confirm.run", { cmd: chalk.cyan.bold("pi") }));
}
