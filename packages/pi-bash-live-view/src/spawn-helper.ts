import { access, chmod } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SPAWN_HELPER_BASENAME = process.platform === "win32" ? "spawn-helper.exe" : "spawn-helper";
const NODE_PTY_PREBUILD_DIR = `${process.platform}-${process.arch}`;
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = path.resolve(MODULE_DIR, "..");

export interface EnsureSpawnHelperOptions {
	explicitPath?: string;
	accessFn?: typeof access;
	chmodFn?: typeof chmod;
}

function uniquePaths(candidates: Array<string | undefined>): string[] {
	const seen = new Set<string>();
	const deduped: string[] = [];
	for (const candidate of candidates) {
		if (!candidate || seen.has(candidate)) {
			continue;
		}

		seen.add(candidate);
		deduped.push(candidate);
	}
	return deduped;
}

function getNodePtySpawnHelperCandidates(nodePtyPackageDir: string): string[] {
	return [
		path.join(nodePtyPackageDir, "prebuilds", NODE_PTY_PREBUILD_DIR, SPAWN_HELPER_BASENAME),
		path.join(nodePtyPackageDir, "build", "Release", SPAWN_HELPER_BASENAME),
	];
}

export function getSpawnHelperCandidates(explicitPath?: string): string[] {
	return uniquePaths([
		explicitPath,
		process.env.NODE_PTY_SPAWN_HELPER,
		...getNodePtySpawnHelperCandidates(path.join(PACKAGE_DIR, "node_modules", "node-pty")),
		...getNodePtySpawnHelperCandidates(path.join(PACKAGE_DIR, "..", "node_modules", "node-pty")),
		...getNodePtySpawnHelperCandidates(path.join(PACKAGE_DIR, "..", "..", "node_modules", "node-pty")),
		path.join(PACKAGE_DIR, "build", "Release", SPAWN_HELPER_BASENAME),
	]);
}

async function isExecutable(candidate: string, accessFn: typeof access): Promise<boolean> {
	try {
		await accessFn(candidate, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

export async function ensureSpawnHelperExecutable(options: EnsureSpawnHelperOptions = {}): Promise<string | null> {
	if (process.platform === "win32") {
		return options.explicitPath ?? process.env.NODE_PTY_SPAWN_HELPER ?? null;
	}

	const accessFn = options.accessFn ?? access;
	const chmodFn = options.chmodFn ?? chmod;

	for (const candidate of getSpawnHelperCandidates(options.explicitPath)) {
		try {
			await accessFn(candidate, constants.F_OK);
		} catch {
			continue;
		}

		if (await isExecutable(candidate, accessFn)) {
			return candidate;
		}

		try {
			await chmodFn(candidate, 0o755);
		} catch {
			continue;
		}

		if (await isExecutable(candidate, accessFn)) {
			return candidate;
		}
	}

	return null;
}

export const spawnHelperInternals = {
	uniquePaths,
	isExecutable,
};
