import * as fs from "node:fs";
import * as path from "node:path";
import {
	expandHomeDir,
	getExtensionConfigPath,
	getMirroredWorkspacePathSegments,
	resolvePiAgentDir,
} from "@ifi/oh-pi-core";

export type ProjectAgentStorageMode = "shared" | "project";

export interface ProjectAgentStorageOptions {
	mode?: ProjectAgentStorageMode;
	sharedRoot?: string;
}

interface SubagentStorageConfig {
	projectAgentStorageMode?: ProjectAgentStorageMode;
	projectAgentSharedRoot?: string;
}

const STORAGE_MODE_ENV_FLAG = "PI_SUBAGENT_PROJECT_AGENTS_MODE";
const STORAGE_ROOT_ENV_FLAG = "PI_SUBAGENT_PROJECT_AGENTS_ROOT";
const CONFIG_PATH = getExtensionConfigPath("subagent");
const DEFAULT_SHARED_ROOT = path.join(resolvePiAgentDir(), "subagents", "project-agents");

function parseStorageMode(value: unknown): ProjectAgentStorageMode | undefined {
	if (value !== "shared" && value !== "project") {
		return undefined;
	}
	return value;
}

function expandTilde(value: string): string {
	return expandHomeDir(value);
}

function loadStorageConfig(): SubagentStorageConfig {
	try {
		if (!fs.existsSync(CONFIG_PATH)) {
			return {};
		}
		const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as SubagentStorageConfig;
		return {
			projectAgentStorageMode: parseStorageMode(parsed.projectAgentStorageMode),
			projectAgentSharedRoot:
				typeof parsed.projectAgentSharedRoot === "string" && parsed.projectAgentSharedRoot.trim()
					? expandTilde(parsed.projectAgentSharedRoot)
					: undefined,
		};
	} catch {
		return {};
	}
}

/**
<!-- {=subagentsResolveProjectAgentStorageOptionsDocs} -->

Resolve the effective project-agent storage mode and shared root. Explicit options take precedence,
then environment variables, then extension config, and shared storage is the default when no
override is provided.

<!-- {/subagentsResolveProjectAgentStorageOptionsDocs} -->
*/
export function resolveProjectAgentStorageOptions(
	options?: ProjectAgentStorageOptions,
): Required<ProjectAgentStorageOptions> {
	const config = loadStorageConfig();
	const envMode = parseStorageMode(process.env[STORAGE_MODE_ENV_FLAG]);
	const envRoot = process.env[STORAGE_ROOT_ENV_FLAG]?.trim();
	const mode = options?.mode ?? envMode ?? config.projectAgentStorageMode ?? "shared";
	const sharedRoot = path.resolve(
		options?.sharedRoot ?? (envRoot ? expandTilde(envRoot) : config.projectAgentSharedRoot ?? DEFAULT_SHARED_ROOT),
	);
	return { mode, sharedRoot };
}


function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function parentDirs(cwd: string): string[] {
	const dirs: string[] = [];
	let currentDir = path.resolve(cwd);
	while (true) {
		dirs.push(currentDir);
		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			break;
		}
		currentDir = parentDir;
	}
	return dirs;
}

export function getLegacyProjectAgentsDir(cwd: string): string {
	return path.join(path.resolve(cwd), ".pi", "agents");
}

/**
<!-- {=subagentsGetSharedProjectAgentsDirDocs} -->

Build the shared directory for project-scope agent and chain definitions. The path combines the
shared root, a mirrored workspace path, and the trailing `agents/` directory so different projects
stay isolated from one another.

<!-- {/subagentsGetSharedProjectAgentsDirDocs} -->
*/
export function getSharedProjectAgentsDir(cwd: string, options?: ProjectAgentStorageOptions): string {
	const resolved = resolveProjectAgentStorageOptions(options);
	return path.join(resolved.sharedRoot, ...getMirroredWorkspacePathSegments(cwd), "agents");
}

function cleanupLegacyPiDir(cwd: string): void {
	const piDir = path.join(path.resolve(cwd), ".pi");
	try {
		if (fs.readdirSync(piDir).length === 0) {
			fs.rmdirSync(piDir);
		}
	} catch {
		// ignore cleanup failures
	}
}

/**
<!-- {=subagentsMigrateLegacyProjectAgentsDocs} -->

Best-effort migration for legacy repo-local project agents. When shared mode is active, discovered
`.pi/agents/` directories are copied into shared storage and the empty legacy `.pi/` directory is
removed when possible.

<!-- {/subagentsMigrateLegacyProjectAgentsDocs} -->
*/
export function migrateLegacyProjectAgents(cwd: string, options?: ProjectAgentStorageOptions): void {
	const resolved = resolveProjectAgentStorageOptions(options);
	if (resolved.mode !== "shared") {
		return;
	}

	for (const dir of parentDirs(cwd)) {
		const legacyDir = getLegacyProjectAgentsDir(dir);
		if (!isDirectory(legacyDir)) {
			continue;
		}
		const sharedDir = getSharedProjectAgentsDir(dir, resolved);
		if (fs.existsSync(sharedDir)) {
			continue;
		}
		try {
			fs.mkdirSync(path.dirname(sharedDir), { recursive: true });
			fs.cpSync(legacyDir, sharedDir, { recursive: true, errorOnExist: true });
			fs.rmSync(legacyDir, { recursive: true, force: true });
			cleanupLegacyPiDir(dir);
		} catch {
			// Best-effort migration. If anything fails, keep the project-local copy.
		}
	}
}

/**
<!-- {=subagentsFindNearestProjectAgentsDirDocs} -->

Find the highest-priority project agents directory for the current workspace. The resolver walks up
parent workspaces, migrates legacy storage when needed, and preserves the same nearest-parent lookup
semantics in both shared and project storage modes.

<!-- {/subagentsFindNearestProjectAgentsDirDocs} -->
*/
export function findNearestProjectAgentsDir(cwd: string, options?: ProjectAgentStorageOptions): string {
	const resolved = resolveProjectAgentStorageOptions(options);
	migrateLegacyProjectAgents(cwd, resolved);

	for (const dir of parentDirs(cwd)) {
		const candidate =
			resolved.mode === "project" ? getLegacyProjectAgentsDir(dir) : getSharedProjectAgentsDir(dir, resolved);
		if (isDirectory(candidate)) {
			return candidate;
		}
	}

	return resolved.mode === "project" ? getLegacyProjectAgentsDir(cwd) : getSharedProjectAgentsDir(cwd, resolved);
}
