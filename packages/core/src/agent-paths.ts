/**
<!-- {=ohPiCoreAgentPathsOverview} -->

`@ifi/oh-pi-core` exposes a small set of path helpers for packages that need to resolve the pi
agent directory, extension config locations, and shared workspace-scoped storage paths without
hardcoding `~/.pi/agent` throughout the codebase.

Use these helpers when a package needs to:

- honor `PI_CODING_AGENT_DIR`
- expand `~` consistently across platforms
- mirror a workspace path into shared storage
- compute stable extension config file locations

<!-- {/ohPiCoreAgentPathsOverview} -->
*/
import { homedir } from "node:os";
import path from "node:path";

export interface AgentPathOptions {
	env?: NodeJS.ProcessEnv;
	homeDir?: string;
}

function defaultHomeDir(options?: AgentPathOptions): string {
	return options?.homeDir ?? homedir();
}

/**
<!-- {=ohPiCoreExpandHomeDirDocs} -->

Expand a leading `~` in a path using the configured home directory override when present.

This helper leaves non-home-relative paths unchanged so callers can safely normalize optional user
input before resolving it further.

<!-- {/ohPiCoreExpandHomeDirDocs} -->
*/
export function expandHomeDir(inputPath: string, options?: AgentPathOptions): string {
	const homeDir = defaultHomeDir(options);
	if (inputPath === "~") {
		return homeDir;
	}
	if (inputPath.startsWith("~/") || inputPath.startsWith(`~${path.sep}`)) {
		return path.join(homeDir, inputPath.slice(2));
	}
	return inputPath;
}

/**
<!-- {=ohPiCoreResolvePiAgentDirDocs} -->

Resolve the effective pi agent directory.

The resolver prefers `PI_CODING_AGENT_DIR` when it is set, expands `~` consistently, and otherwise
falls back to the standard `~/.pi/agent` location.

<!-- {/ohPiCoreResolvePiAgentDirDocs} -->
*/
export function resolvePiAgentDir(options?: AgentPathOptions): string {
	const envPath = options?.env?.PI_CODING_AGENT_DIR?.trim();
	if (envPath) {
		return path.resolve(expandHomeDir(envPath, options));
	}
	return path.join(defaultHomeDir(options), ".pi", "agent");
}

/**
<!-- {=ohPiCoreGetExtensionConfigPathDocs} -->

Build the config file path for a named extension under the resolved pi agent directory.

Use this helper instead of manually concatenating `extensions/<name>/config.json` so every package
shares the same config-root resolution behavior.

<!-- {/ohPiCoreGetExtensionConfigPathDocs} -->
*/
export function getExtensionConfigPath(
	extensionName: string,
	fileName = "config.json",
	options?: AgentPathOptions,
): string {
	return path.join(resolvePiAgentDir(options), "extensions", extensionName, fileName);
}

/**
<!-- {=ohPiCoreGetMirroredWorkspacePathSegmentsDocs} -->

Convert a workspace path into stable mirrored path segments for shared storage.

The first segment encodes the filesystem root and the remaining segments mirror the resolved
workspace path, which keeps shared state unique across repositories and drives.

<!-- {/ohPiCoreGetMirroredWorkspacePathSegmentsDocs} -->
*/
export function getMirroredWorkspacePathSegments(cwd: string): string[] {
	const resolved = path.resolve(cwd);
	const parsed = path.parse(resolved);
	const relativeSegments = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
	const rootSegment = parsed.root
		? parsed.root
				.replaceAll(/[^a-zA-Z0-9]+/g, "-")
				.replaceAll(/^-+|-+$/g, "")
				.toLowerCase() || "root"
		: "root";
	return [rootSegment, ...relativeSegments];
}

/**
<!-- {=ohPiCoreGetSharedStoragePathDocs} -->

Build a shared storage path inside the pi agent directory for a workspace-scoped namespace.

This helper combines the resolved pi agent directory, a package namespace, the mirrored workspace
segments, and any additional relative path segments into one canonical storage location.

<!-- {/ohPiCoreGetSharedStoragePathDocs} -->
*/
export function getSharedStoragePath(
	namespace: string,
	cwd: string,
	relativeSegments: string[] = [],
	options?: AgentPathOptions,
): string {
	return path.join(
		resolvePiAgentDir(options),
		namespace,
		...getMirroredWorkspacePathSegments(cwd),
		...relativeSegments,
	);
}
