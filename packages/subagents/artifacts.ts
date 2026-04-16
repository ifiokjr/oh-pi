import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getSessionsBaseDir } from "./paths.js";
import type { ArtifactPaths } from "./types.js";

const TEMP_ARTIFACTS_DIR = path.join(os.tmpdir(), "pi-subagent-artifacts");
const CLEANUP_MARKER_FILE = ".last-cleanup";

export function getArtifactsDir(sessionFile: string | null): string {
	if (sessionFile) {
		const sessionDir = path.dirname(sessionFile);
		return path.join(sessionDir, "subagent-artifacts");
	}
	return TEMP_ARTIFACTS_DIR;
}

export function getArtifactPaths(artifactsDir: string, runId: string, agent: string, index?: number): ArtifactPaths {
	const suffix = index !== undefined ? `_${index}` : "";
	const safeAgent = agent.replace(/[^\w.-]/g, "_");
	const base = `${runId}_${safeAgent}${suffix}`;
	return {
		inputPath: path.join(artifactsDir, `${base}_input.md`),
		outputPath: path.join(artifactsDir, `${base}_output.md`),
		jsonlPath: path.join(artifactsDir, `${base}.jsonl`),
		metadataPath: path.join(artifactsDir, `${base}_meta.json`),
	};
}

export function ensureArtifactsDir(dir: string): void {
	fs.mkdirSync(dir, { recursive: true });
}

export function writeArtifact(filePath: string, content: string): void {
	fs.writeFileSync(filePath, content, "utf-8");
}

export function writeMetadata(filePath: string, metadata: object): void {
	fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), "utf-8");
}

export function appendJsonl(filePath: string, line: string): void {
	fs.appendFileSync(filePath, `${line}\n`);
}

export async function cleanupOldArtifacts(dir: string, maxAgeDays: number): Promise<void> {
	try {
		await fs.promises.access(dir, fs.constants.F_OK);
	} catch {
		return;
	}

	const markerPath = path.join(dir, CLEANUP_MARKER_FILE);
	const now = Date.now();

	try {
		const stat = await fs.promises.stat(markerPath);
		if (now - stat.mtimeMs < 24 * 60 * 60 * 1000) {
			return;
		}
	} catch {}

	const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
	const cutoff = now - maxAgeMs;

	let files: string[];
	try {
		files = await fs.promises.readdir(dir);
	} catch {
		return;
	}

	for (const file of files) {
		if (file === CLEANUP_MARKER_FILE) {
			continue;
		}

		const filePath = path.join(dir, file);
		try {
			const stat = await fs.promises.stat(filePath);
			if (stat.mtimeMs < cutoff) {
				await fs.promises.unlink(filePath);
			}
		} catch {}
	}

	try {
		await fs.promises.writeFile(markerPath, String(now));
	} catch {}
}

export async function cleanupAllArtifactDirs(maxAgeDays: number): Promise<void> {
	await cleanupOldArtifacts(TEMP_ARTIFACTS_DIR, maxAgeDays);

	const sessionsBase = getSessionsBaseDir();
	let dirs: string[];
	try {
		dirs = await fs.promises.readdir(sessionsBase);
	} catch {
		return;
	}

	for (const dir of dirs) {
		const artifactsDir = path.join(sessionsBase, dir, "subagent-artifacts");
		try {
			await cleanupOldArtifacts(artifactsDir, maxAgeDays);
		} catch {}
	}
}
