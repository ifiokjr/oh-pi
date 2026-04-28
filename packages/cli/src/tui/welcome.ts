import * as p from "@clack/prompts";
import { t } from "@ifi/oh-pi-core";
import chalk from "chalk";
import type { EnvInfo } from "../utils/detect.js";

/**
 * Show the welcome screen with pi installation status, environment info, and existing config summary.
 * @param {EnvInfo} env - Detected environment info
 */
export function welcome(env: EnvInfo) {
	// Clear terminal without using console APIs (lint-safe).
	process.stdout.write("\u001Bc");
	p.intro(chalk.cyan.bold(" oh-pi ") + chalk.dim(t("welcome.title")));

	if (env.piInstalled) {
		p.log.success(t("welcome.piDetected", { version: env.piVersion ?? "" }));
	} else {
		p.log.warn(t("welcome.piNotFound"));
	}

	p.log.info(
		t("welcome.envInfo", {
			node: process.version,
			os: env.os,
			terminal: env.terminal,
		}),
	);

	if (env.existingProviders.length > 0) {
		p.log.info(
			t("welcome.existingProviders", {
				providers: env.existingProviders.join(", "),
			}),
		);
	}

	if (env.hasExistingConfig) {
		p.note(
			`${t("welcome.existingConfigDetail", {
				count: env.existingFiles.length,
				size: env.configSizeKB,
			})}\n${categorize(env.existingFiles)}`,
			t("welcome.existingConfig"),
		);
	}
}

/**
 * Group files by top-level directory and return a formatted count string.
 * @param {string[]} files - List of relative file paths
 * @returns {string} Categorized count string, e.g. "extensions (3)  prompts (5)"
 */
export function categorize(files: string[]): string {
	const cats: Record<string, number> = {};
	for (const f of files) {
		const cat = f.includes("/") ? f.split("/")[0] : f;
		cats[cat] = (cats[cat] || 0) + 1;
	}
	return Object.entries(cats)
		.map(([k, v]) => `${k} (${v})`)
		.join("  ");
}
