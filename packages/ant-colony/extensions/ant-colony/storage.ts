/**
<!-- {=antColonySharedStorageOverview} -->

Ant-colony stores runtime state outside the repository by default under the shared pi agent
directory, mirroring the workspace path so each repo gets its own isolated storage root.
Project-local `.ant-colony/` storage remains available as an explicit opt-in for legacy workflows.

<!-- {/antColonySharedStorageOverview} -->
*/
import * as fs from "node:fs";
import * as path from "node:path";
import { expandHomeDir } from "@ifi/oh-pi-core";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { getManagedWorktreeParentDir } from "./worktree-registry.js";

export type ColonyStorageMode = "shared" | "project";

export interface ColonyStorageOptions {
	mode?: ColonyStorageMode;
	sharedRoot?: string;
}

interface AntColonyConfig {
	storageMode?: ColonyStorageMode;
	sharedRoot?: string;
}

const STORAGE_MODE_ENV_FLAG = "PI_ANT_COLONY_STORAGE_MODE";
const STORAGE_ROOT_ENV_FLAG = "PI_ANT_COLONY_STORAGE_ROOT";
const DEFAULT_SHARED_ROOT = path.join(getAgentDir(), "ant-colony");
const CONFIG_PATH = path.join(getAgentDir(), "extensions", "ant-colony", "config.json");

function parseStorageMode(value: unknown): ColonyStorageMode | undefined {
	if (value !== "shared" && value !== "project") {
		return undefined;
	}
	return value;
}

function expandTilde(value: string): string {
	return expandHomeDir(value);
}

export function loadAntColonyConfig(): AntColonyConfig {
	try {
		if (!fs.existsSync(CONFIG_PATH)) {
			return {};
		}
		const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as AntColonyConfig;
		return {
			storageMode: parseStorageMode(parsed.storageMode),
			sharedRoot:
				typeof parsed.sharedRoot === "string" && parsed.sharedRoot.trim() ? expandTilde(parsed.sharedRoot) : undefined,
		};
	} catch {
		return {};
	}
}

/**
<!-- {=antColonyResolveStorageOptionsDocs} -->

Resolve the effective ant-colony storage mode and shared root. Explicit options win, then
environment variables, then extension config, and shared storage is the default when no override is
provided.

<!-- {/antColonyResolveStorageOptionsDocs} -->
*/
export function resolveColonyStorageOptions(options?: ColonyStorageOptions): Required<ColonyStorageOptions> {
	const config = loadAntColonyConfig();
	const envMode = parseStorageMode(process.env[STORAGE_MODE_ENV_FLAG]);
	const envRoot = process.env[STORAGE_ROOT_ENV_FLAG]?.trim();
	const mode = options?.mode ?? envMode ?? config.storageMode ?? "shared";
	const sharedRoot = path.resolve(
		options?.sharedRoot ?? (envRoot ? expandTilde(envRoot) : (config.sharedRoot ?? DEFAULT_SHARED_ROOT)),
	);
	return { mode, sharedRoot };
}

export function getLegacyProjectColonyStorageRoot(cwd: string): string {
	return path.join(path.resolve(cwd), ".ant-colony");
}

function getMirroredWorkspacePath(cwd: string): string {
	const resolved = path.resolve(cwd);
	const parsed = path.parse(resolved);
	const relativeSegments = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
	const rootSegment = parsed.root
		? parsed.root
				.replaceAll(/[^a-zA-Z0-9]+/g, "-")
				.replaceAll(/^-+|-+$/g, "")
				.toLowerCase() || "root"
		: "root";
	return path.join(rootSegment, ...relativeSegments);
}

export function getSharedColonyStorageRoot(options?: ColonyStorageOptions): string {
	return resolveColonyStorageOptions(options).sharedRoot;
}

export function getSharedColonyWorkspaceRoot(cwd: string, options?: ColonyStorageOptions): string {
	return path.join(getSharedColonyStorageRoot(options), getMirroredWorkspacePath(cwd));
}

/**
<!-- {=antColonyGetColonyStateParentDirDocs} -->

Resolve the parent directory for persisted colony state. Shared mode stores state under the
workspace-mirrored shared root in `colonies/`, while project mode keeps using the legacy local
`.ant-colony/` directory.

<!-- {/antColonyGetColonyStateParentDirDocs} -->
*/
export function getColonyStateParentDir(cwd: string, options?: ColonyStorageOptions): string {
	const resolved = resolveColonyStorageOptions(options);
	if (resolved.mode === "project") {
		return getLegacyProjectColonyStorageRoot(cwd);
	}
	return path.join(getSharedColonyWorkspaceRoot(cwd, resolved), "colonies");
}

/**
<!-- {=antColonyGetColonyWorktreeParentDirDocs} -->

Resolve the parent directory for isolated colony worktrees. Shared mode keeps them under the
workspace-mirrored shared root in `worktrees/`, while project mode places them under the legacy
project-local `.ant-colony/worktrees/` path.

<!-- {/antColonyGetColonyWorktreeParentDirDocs} -->
*/
export function getColonyWorktreeParentDir(cwd: string, options?: ColonyStorageOptions): string {
	const resolved = resolveColonyStorageOptions(options);
	if (resolved.mode === "project") {
		return path.join(getLegacyProjectColonyStorageRoot(cwd), "worktrees");
	}
	return getManagedWorktreeParentDir(cwd);
}

export function shouldManageProjectGitignore(options?: ColonyStorageOptions): boolean {
	return resolveColonyStorageOptions(options).mode === "project";
}

/**
<!-- {=antColonyMigrateLegacyProjectColoniesDocs} -->

Best-effort migration for legacy project-local colony state. When shared mode is active, existing
`.ant-colony/{colony-id}/` directories are copied into the shared store so resumable colonies keep
working without leaving runtime state in the repo.

<!-- {/antColonyMigrateLegacyProjectColoniesDocs} -->
*/
export function migrateLegacyProjectColonies(cwd: string, options?: ColonyStorageOptions): void {
	const resolved = resolveColonyStorageOptions(options);
	if (resolved.mode !== "shared") {
		return;
	}

	const legacyRoot = getLegacyProjectColonyStorageRoot(cwd);
	if (!fs.existsSync(legacyRoot)) {
		return;
	}

	const sharedParentDir = getColonyStateParentDir(cwd, resolved);
	for (const entry of fs.readdirSync(legacyRoot, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name === "worktrees") {
			continue;
		}
		const sourceDir = path.join(legacyRoot, entry.name);
		const stateFile = path.join(sourceDir, "state.json");
		if (!fs.existsSync(stateFile)) {
			continue;
		}
		const targetDir = path.join(sharedParentDir, entry.name);
		if (fs.existsSync(targetDir)) {
			continue;
		}
		try {
			fs.mkdirSync(sharedParentDir, { recursive: true });
			fs.cpSync(sourceDir, targetDir, { recursive: true, errorOnExist: true });
			fs.rmSync(sourceDir, { recursive: true, force: true });
		} catch {
			// Best-effort migration. Existing local state remains resumable via project mode if copy fails.
		}
	}
}

function isEmptyDir(dir: string): boolean {
	try {
		return fs.readdirSync(dir).length === 0;
	} catch {
		return false;
	}
}

export function cleanupEmptyColonyStorageDirs(cwd: string, options?: ColonyStorageOptions): void {
	const resolved = resolveColonyStorageOptions(options);
	if (resolved.mode === "project") {
		const projectRoot = getLegacyProjectColonyStorageRoot(cwd);
		if (isEmptyDir(projectRoot)) {
			try {
				fs.rmdirSync(projectRoot);
			} catch {
				// ignore cleanup failures
			}
		}
		return;
	}

	const stateParent = getColonyStateParentDir(cwd, resolved);
	if (isEmptyDir(stateParent)) {
		try {
			fs.rmdirSync(stateParent);
		} catch {
			// ignore cleanup failures
		}
	}

	const worktreeParent = getColonyWorktreeParentDir(cwd, resolved);
	if (isEmptyDir(worktreeParent)) {
		try {
			fs.rmdirSync(worktreeParent);
		} catch {
			// ignore cleanup failures
		}
	}

	const workspaceRoot = getSharedColonyWorkspaceRoot(cwd, resolved);
	let currentDir = workspaceRoot;
	const sharedRoot = getSharedColonyStorageRoot(resolved);
	while (currentDir.startsWith(sharedRoot) && currentDir !== sharedRoot) {
		if (!isEmptyDir(currentDir)) {
			break;
		}
		try {
			fs.rmdirSync(currentDir);
		} catch {
			break;
		}
		currentDir = path.dirname(currentDir);
	}
}
