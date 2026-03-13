import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { resolvePlanFilePath } from "./utils";

export function getPlanFilePathForSession(ctx: ExtensionContext): string {
	const sessionFile = ctx.sessionManager.getSessionFile();
	if (!sessionFile) {
		return path.join(ctx.sessionManager.getSessionDir(), `${ctx.sessionManager.getSessionId()}.plan.md`);
	}

	const parsed = path.parse(sessionFile);
	return path.join(parsed.dir, `${parsed.name}.plan.md`);
}

export function resolveActivePlanFilePath(ctx: ExtensionContext, planFilePath: string | undefined): string {
	if (planFilePath && planFilePath.trim().length > 0) {
		return planFilePath;
	}
	return getPlanFilePathForSession(ctx);
}

export function buildTimestampedPlanFilename(sessionId: string): string {
	const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
	const safeSessionId = sessionId.replace(/[^a-zA-Z0-9._-]/g, "-");
	return `${timestamp}-${safeSessionId}.plan.md`;
}

export async function createFreshPlanFilePath(ctx: ExtensionContext, baseDir: string): Promise<string> {
	const baseFilename = buildTimestampedPlanFilename(ctx.sessionManager.getSessionId());
	let candidate = path.join(baseDir, baseFilename);
	if (!(await pathExists(candidate))) {
		return candidate;
	}

	const parsed = path.parse(baseFilename);
	for (let counter = 1; counter <= 999; counter++) {
		candidate = path.join(baseDir, `${parsed.name}-${counter}${parsed.ext}`);
		if (!(await pathExists(candidate))) {
			return candidate;
		}
	}

	return path.join(baseDir, `${parsed.name}-${Date.now()}${parsed.ext}`);
}

export async function resolvePlanLocationInput(ctx: ExtensionContext, rawLocation: string): Promise<string | null> {
	const trimmed = rawLocation.trim();
	if (!trimmed) {
		return null;
	}

	const resolvedPath = resolvePlanFilePath(ctx.cwd, trimmed);
	if (!resolvedPath) {
		return null;
	}

	let isDirectory = /[\\/]$/.test(trimmed);
	try {
		const pathStats = await stat(resolvedPath);
		if (pathStats.isDirectory()) {
			isDirectory = true;
		}
	} catch (error) {
		const code = (error as { code?: string }).code;
		if (code !== "ENOENT") {
			throw error;
		}
	}

	if (isDirectory) {
		return path.join(resolvedPath, buildTimestampedPlanFilename(ctx.sessionManager.getSessionId()));
	}

	return resolvedPath;
}

export async function movePlanFile(sourcePath: string | undefined, targetPath: string): Promise<void> {
	await mkdir(path.dirname(targetPath), { recursive: true });

	if (!sourcePath) {
		await ensurePlanFileExists(targetPath);
		return;
	}

	if (sourcePath === targetPath) {
		await ensurePlanFileExists(targetPath);
		return;
	}

	try {
		await rename(sourcePath, targetPath);
		return;
	} catch (error) {
		const code = (error as { code?: string }).code;
		if (code === "ENOENT") {
			await ensurePlanFileExists(targetPath);
			return;
		}
		if (code === "EXDEV") {
			const existingContent = await readFile(sourcePath, "utf8");
			await writeFile(targetPath, existingContent, "utf8");
			try {
				await unlink(sourcePath);
			} catch (unlinkError) {
				const unlinkCode = (unlinkError as { code?: string }).code;
				if (unlinkCode !== "ENOENT") {
					throw unlinkError;
				}
			}
			return;
		}
		throw error;
	}
}

export async function ensurePlanFileExists(planFilePath: string): Promise<void> {
	await mkdir(path.dirname(planFilePath), { recursive: true });
	await writeFile(planFilePath, "", { encoding: "utf8", flag: "a" });
}

export async function resetPlanFile(planFilePath: string): Promise<void> {
	await mkdir(path.dirname(planFilePath), { recursive: true });
	await writeFile(planFilePath, "", "utf8");
}

export async function readPlanFile(planFilePath: string | undefined): Promise<string | undefined> {
	if (!planFilePath) {
		return undefined;
	}
	try {
		return await readFile(planFilePath, "utf8");
	} catch {
		return undefined;
	}
}

export async function pathExists(filePath: string | undefined): Promise<boolean> {
	if (!filePath) {
		return false;
	}
	try {
		await stat(filePath);
		return true;
	} catch (error) {
		const code = (error as { code?: string }).code;
		if (code === "ENOENT") {
			return false;
		}
		throw error;
	}
}
