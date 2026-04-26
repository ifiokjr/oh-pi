import { EXTENSIONS } from "@ifi/oh-pi-core";
import chalk from "chalk";
import type { OhPConfigWithRouting } from "../types.js";
import { compareVersion, entriesBetween, parseChangelog, readChangelog, renderChangelog } from "../utils/changelog.js";
import { detectEnv, type EnvInfo } from "../utils/detect.js";
import { applyConfig, backupConfig, installPi } from "../utils/install.js";
import { type ExtensionOption, pickExtensions } from "./extension-picker.js";
import { runWithProgress } from "./progress.js";

export interface InstallerDeps {
	detectEnv: () => Promise<EnvInfo>;
	readChangelog: () => string;
	pickExtensions: (options: ExtensionOption[]) => Promise<string[]>;
	applyConfig: (config: OhPConfigWithRouting) => void;
	installPi: () => void;
	backupConfig: () => string;
	stdout: NodeJS.WriteStream;
}

export const defaultInstallerDeps: InstallerDeps = {
	detectEnv,
	readChangelog,
	pickExtensions,
	applyConfig,
	installPi,
	backupConfig,
	stdout: process.stdout,
};

function getDefaultConfig(extensions: string[]): OhPConfigWithRouting {
	return {
		providers: [],
		theme: "dark",
		keybindings: "default",
		extensions,
		prompts: ["review", "fix", "explain", "commit", "test"],
		agents: "general-developer",
		thinking: "medium",
	};
}

export async function runInstaller(deps: InstallerDeps = defaultInstallerDeps): Promise<void> {
	const { stdout } = deps;

	// ═══ Environment ═══
	const env = await deps.detectEnv();

	// ═══ Version banner ═══
	const pkgVersion = "0.4.4"; // inline to avoid bundling package.json; changeset bumps this
	stdout.write("\n");
	stdout.write(chalk.bold.cyan("╔══════════════════════════════════════╗\n"));
	stdout.write(chalk.bold.cyan("║     oh-pi Interactive Installer     ║\n"));
	stdout.write(chalk.bold.cyan("╚══════════════════════════════════════╝\n"));
	stdout.write("\n");

	const installedVersion = env.piVersion;
	if (installedVersion) {
		const cmp = compareVersion(installedVersion, pkgVersion);
		if (cmp < 0) {
			stdout.write(
				`${chalk.yellow("▼ Update available")}  ${chalk.dim(installedVersion)} ${chalk.gray("→")} ${chalk.green.bold(pkgVersion)}\n`,
			);
		} else if (cmp > 0) {
			stdout.write(
				`${chalk.green("▲ Ahead")}  ${chalk.dim(installedVersion)} ${chalk.gray("→")} ${chalk.green.bold(pkgVersion)}\n`,
			);
		} else {
			stdout.write(`${chalk.green("● Up to date")}  ${chalk.bold(pkgVersion)}\n`);
		}
	} else {
		stdout.write(`${chalk.dim("No existing oh-pi installation detected")}\n`);
	}
	stdout.write("\n");

	// ═══ Changelog ═══
	let changelogText = "";
	try {
		const raw = deps.readChangelog();
		const entries = parseChangelog(raw);
		const relevant = entriesBetween(entries, installedVersion, pkgVersion);
		if (relevant.length > 0) {
			changelogText = renderChangelog(relevant);
		}
	} catch {
		/* skip changelog if unreadable */
	}

	if (changelogText) {
		stdout.write(chalk.bold("Changelog since your version:\n"));
		stdout.write(`${chalk.gray("─".repeat(50))}\n`);
		stdout.write(`${changelogText}\n`);
		stdout.write(`${chalk.gray("─".repeat(50))}\n`);
		stdout.write("\n");
	}

	// ═══ Extension picker ═══
	const options: ExtensionOption[] = EXTENSIONS.map((e) => ({
		value: e.name,
		label: e.label,
		default: e.default,
	}));
	const picked = await deps.pickExtensions(options);

	// ═══ Prepare config ═══
	const config = getDefaultConfig(picked);

	// ═══ Progress + apply ═══
	const tasks = [
		{
			label: "Backing up existing config",
			fn: () => {
				if (env.hasExistingConfig) {
					deps.backupConfig();
				}
			},
		},
		{
			label: "Installing pi-coding-agent",
			fn: () => {
				if (!env.piInstalled) {
					deps.installPi();
				}
			},
		},
		{
			label: "Writing configuration files",
			fn: () => {
				deps.applyConfig(config);
			},
		},
	];

	await runWithProgress(tasks, { stdout });

	stdout.write("\n");
	stdout.write(chalk.green.bold("✔ oh-pi installed successfully!\n"));
	stdout.write(chalk.dim(`Run ${chalk.cyan("pi")} to start.\n`));
	stdout.write("\n");
}
