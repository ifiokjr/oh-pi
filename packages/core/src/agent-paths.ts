import { homedir } from "node:os";
import path from "node:path";

export interface AgentPathOptions {
	env?: NodeJS.ProcessEnv;
	homeDir?: string;
}

function defaultHomeDir(options?: AgentPathOptions): string {
	return options?.homeDir ?? homedir();
}

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

export function resolvePiAgentDir(options?: AgentPathOptions): string {
	const envPath = options?.env?.PI_CODING_AGENT_DIR?.trim();
	if (envPath) {
		return path.resolve(expandHomeDir(envPath, options));
	}
	return path.join(defaultHomeDir(options), ".pi", "agent");
}

export function getExtensionConfigPath(
	extensionName: string,
	fileName = "config.json",
	options?: AgentPathOptions,
): string {
	return path.join(resolvePiAgentDir(options), "extensions", extensionName, fileName);
}

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
