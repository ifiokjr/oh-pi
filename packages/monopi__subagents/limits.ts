import fs from "node:fs/promises";
import path from "node:path";

import { resolveAgentDir } from "./paths.js";
import { MAX_CONCURRENCY, MAX_PARALLEL } from "./types.js";

export interface SubagentLimitSettings {
	maxConcurrency?: number;
	maxParallel?: number;
}

export interface SubagentLimits {
	maxConcurrency: number;
	maxParallel: number;
}

interface ResolveSubagentLimitsOptions {
	agentDir?: string;
	cwd: string;
	env?: NodeJS.ProcessEnv;
}

const ENV_MAX_PARALLEL = "PI_SUBAGENT_MAX_PARALLEL";
const ENV_MAX_CONCURRENCY = "PI_SUBAGENT_MAX_CONCURRENCY";

function parsePositiveInteger(value: unknown): number | undefined {
	const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		return undefined;
	}
	return parsed;
}

async function readSubagentSettings(settingsPath: string): Promise<SubagentLimitSettings> {
	try {
		const settings = JSON.parse(await fs.readFile(settingsPath, "utf8")) as {
			subagent?: SubagentLimitSettings;
		};
		return settings.subagent ?? {};
	} catch {
		return {};
	}
}

function resolveLimit(options: {
	defaultValue: number;
	envValue: unknown;
	projectValue: unknown;
	userValue: unknown;
}): number {
	const envLimit = parsePositiveInteger(options.envValue);
	if (envLimit !== undefined) {
		return envLimit;
	}

	const userLimit = parsePositiveInteger(options.userValue);
	if (userLimit !== undefined) {
		return userLimit;
	}

	const projectLimit = parsePositiveInteger(options.projectValue);
	if (projectLimit !== undefined) {
		return Math.min(projectLimit, options.defaultValue);
	}

	return options.defaultValue;
}

/** Resolve subagent fan-out limits with project-safe caps.
 *
 * Precedence per limit:
 * 1. Environment variables can raise or lower.
 * 2. User settings (`~/.pi/agent/settings.json`) can raise or lower.
 * 3. Project settings (`.pi/settings.json`) can only lower defaults.
 * 4. Built-in defaults apply otherwise.
 */
export async function resolveSubagentLimits(options: ResolveSubagentLimitsOptions): Promise<SubagentLimits> {
	const env = options.env ?? process.env;
	const agentDir = options.agentDir ?? resolveAgentDir();
	const [userSettings, projectSettings] = await Promise.all([
		readSubagentSettings(path.join(agentDir, "settings.json")),
		readSubagentSettings(path.join(options.cwd, ".pi", "settings.json")),
	]);

	return {
		maxConcurrency: resolveLimit({
			defaultValue: MAX_CONCURRENCY,
			envValue: env[ENV_MAX_CONCURRENCY],
			projectValue: projectSettings.maxConcurrency,
			userValue: userSettings.maxConcurrency,
		}),
		maxParallel: resolveLimit({
			defaultValue: MAX_PARALLEL,
			envValue: env[ENV_MAX_PARALLEL],
			projectValue: projectSettings.maxParallel,
			userValue: userSettings.maxParallel,
		}),
	};
}
