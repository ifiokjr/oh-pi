import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolvePiAgentDir } from "@ifi/oh-pi-core";

export interface EnvInfo {
	piInstalled: boolean;
	piVersion: string | null;
	hasExistingConfig: boolean;
	agentDir: string;
	terminal: string;
	os: string;
	existingFiles: string[];
	configSizeKB: number;
	existingProviders: string[];
}

/**
 * Recursively scan a directory and return all file paths relative to it.
 * @param dir - Directory path to scan
 * @param prefix - Path prefix for recursive concatenation
 * @returns Array of relative file paths
 */
function scanDir(dir: string, prefix = ""): string[] {
	if (!existsSync(dir)) {
		return [];
	}
	const files: string[] = [];
	try {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const rel = prefix ? `${prefix}/${e.name}` : e.name;
			if (e.isDirectory()) {
				files.push(...scanDir(join(dir, e.name), rel));
			} else {
				files.push(rel);
			}
		}
	} catch {
		/* Skip */
	}
	return files;
}

/**
 * Calculate the total size of a directory in KB.
 * @param dir - Directory path
 * @returns Directory size in KB (rounded)
 */
function dirSizeKB(dir: string): number {
	if (!existsSync(dir)) {
		return 0;
	}
	let bytes = 0;
	try {
		for (const f of scanDir(dir)) {
			try {
				bytes += statSync(join(dir, f)).size;
			} catch {
				/* Skip */
			}
		}
	} catch {
		/* Skip */
	}
	return Math.round(bytes / 1024);
}

/**
 * Detect configured provider names from auth.json, settings.json, and models.json.
 * @param agentDir - Agent configuration directory path
 * @returns Array of configured provider names
 */
function detectProviders(agentDir: string): string[] {
	const providers = new Set<string>();

	// From auth.json keys
	try {
		const auth = JSON.parse(readFileSync(join(agentDir, "auth.json"), "utf8"));
		for (const key of Object.keys(auth)) {
			providers.add(key);
		}
	} catch {
		/* Skip */
	}

	// From settings.json defaultProvider
	try {
		const settings = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8"));
		if (settings.defaultProvider) {
			providers.add(settings.defaultProvider);
		}
	} catch {
		/* Skip */
	}

	// From models.json custom providers
	try {
		const models = JSON.parse(readFileSync(join(agentDir, "models.json"), "utf8"));
		const providerKeys = models.providers ? Object.keys(models.providers) : Object.keys(models);
		for (const key of providerKeys) {
			providers.add(key);
		}
	} catch {
		/* Skip */
	}

	return [...providers];
}

/**
 * Detect current environment info including pi installation, version, config directory, and providers.
 * @returns Environment info object {@link EnvInfo}
 */
export async function detectEnv(): Promise<EnvInfo> {
	const agentDir = resolvePiAgentDir();

	// Detect pi version and scan config in parallel
	const [versionResult, existingFiles] = await Promise.all([
		new Promise<{ installed: boolean; version: string | null }>((resolve) => {
			try {
				const v = execSync("pi --version", { encoding: "utf8", timeout: 3000 }).trim();
				resolve({ installed: true, version: v });
			} catch {
				resolve({ installed: false, version: null });
			}
		}),
		Promise.resolve(scanDir(agentDir)),
	]);

	return {
		agentDir,
		configSizeKB: dirSizeKB(agentDir),
		existingFiles,
		existingProviders: detectProviders(agentDir),
		hasExistingConfig: existsSync(join(agentDir, "settings.json")),
		os: process.platform,
		piInstalled: versionResult.installed,
		piVersion: versionResult.version,
		terminal: process.env.TERM_PROGRAM ?? process.env.TERM ?? "unknown",
	};
}
