import { execSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readlinkSync,
	rmSync,
	statSync,
	symlinkSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { resolvePiAgentDir } from "@ifi/oh-pi-core";
import type { OhPConfigWithRouting } from "../types.js";
import {
	writeAdaptiveRoutingConfig,
	writeAgents,
	writeExtensions,
	writeKeybindings,
	writeModelConfig,
	writePrompts,
	writeProviderEnv,
	writeSkills,
	writeTheme,
} from "./writers.js";

const MANAGED_CONFIG_ENTRIES = [
	"auth.json",
	"settings.json",
	"models.json",
	"keybindings.json",
	"AGENTS.md",
	"extensions",
	"prompts",
	"skills",
	"themes",
];

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export function ensureDir(dir: string) {
	mkdirSync(dir, { recursive: true });
}

function syncSymlink(srcPath: string, destPath: string) {
	const linkTarget = readlinkSync(srcPath);
	try {
		const destStat = lstatSync(destPath);
		if (destStat.isSymbolicLink() && readlinkSync(destPath) === linkTarget) {
			return;
		}
	} catch {
		/* Recreate below */
	}
	rmSync(destPath, { force: true, recursive: true });
	symlinkSync(linkTarget, destPath);
}

/**
 * Incrementally sync a directory: copy changed files, delete files not in source.
 */
export function syncDir(src: string, dest: string) {
	ensureDir(dest);
	const srcEntries = new Set<string>();
	for (const entry of readdirSync(src, { withFileTypes: true })) {
		srcEntries.add(entry.name);
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);
		if (entry.isDirectory()) {
			syncDir(srcPath, destPath);
			continue;
		}
		if (entry.isSymbolicLink()) {
			syncSymlink(srcPath, destPath);
			continue;
		}
		try {
			if (existsSync(destPath) && statSync(destPath).size === statSync(srcPath).size) {
				continue;
			}
		} catch {
			/* Copy anyway */
		}
		copyFileSync(srcPath, destPath);
	}
	try {
		for (const entry of readdirSync(dest, { withFileTypes: true })) {
			if (!srcEntries.has(entry.name)) {
				rmSync(join(dest, entry.name), { recursive: true });
			}
		}
	} catch {
		/* Skip */
	}
}

/**
 * Recursively copy a directory and all its contents.
 */
function copyDir(src: string, dest: string) {
	ensureDir(dest);
	for (const entry of readdirSync(src, { withFileTypes: true })) {
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDir(srcPath, destPath);
			continue;
		}
		if (entry.isSymbolicLink()) {
			syncSymlink(srcPath, destPath);
			continue;
		}
		copyFileSync(srcPath, destPath);
	}
}

/**
 * Apply an OhPConfig by generating and writing all config files to pi's resolved agent dir.
 */
export function applyConfig(config: OhPConfigWithRouting) {
	const agentDir = resolvePiAgentDir();
	ensureDir(agentDir);
	if ((config.providerStrategy ?? "replace") === "replace") {
		cleanupManagedConfig(agentDir);
	}

	writeProviderEnv(agentDir, config);
	writeModelConfig(agentDir, config);
	writeKeybindings(agentDir, config);
	writeAgents(agentDir, config);
	writeExtensions(agentDir, config);
	writeAdaptiveRoutingConfig(agentDir, config);
	writePrompts(agentDir, config);
	writeSkills(agentDir, config);
	writeTheme(agentDir, config);
}

/**
 * Remove all files/dirs managed by oh-pi before strict replace apply.
 */
export function cleanupManagedConfig(agentDir: string) {
	for (const entry of MANAGED_CONFIG_ENTRIES) {
		rmSync(join(agentDir, entry), { force: true, recursive: true });
	}
}

/**
 * Install pi-coding-agent globally. Throws on failure.
 */
export function installPi() {
	try {
		execSync("npm install -g @mariozechner/pi-coding-agent", { stdio: "pipe", timeout: 120_000 });
	} catch {
		throw new Error("Failed to install pi-coding-agent");
	}
}

/**
 * Back up the resolved pi agent dir to a sibling `.bak-{timestamp}` directory.
 * @returns Backup directory path, or empty string if source doesn't exist.
 */
export function backupConfig(): string {
	const agentDir = resolvePiAgentDir();
	if (!existsSync(agentDir)) {
		return "";
	}
	const ts = new Date().toISOString().replaceAll(/[:.]/g, "-").slice(0, 19);
	const backupDir = join(dirname(agentDir), `${basename(agentDir)}.bak-${ts}`);
	copyDir(agentDir, backupDir);
	return backupDir;
}
