import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type OllamaProviderModel, toOllamaModel } from "./models.js";

const CACHE_VERSION = 1;
const DEFAULT_CACHE_PATH = join(homedir(), ".pi", "agent", "cache", "ollama-cloud-models.json");
const CACHE_PATH_ENV = "PI_OLLAMA_CLOUD_CACHE_PATH";

interface OllamaCloudModelCache {
	version?: number;
	refreshedAt?: number;
	models?: unknown;
}

export function getOllamaCloudModelCachePath(): string {
	return process.env[CACHE_PATH_ENV]?.trim() || DEFAULT_CACHE_PATH;
}

export function loadCachedOllamaCloudModels(): OllamaProviderModel[] {
	const cachePath = getOllamaCloudModelCachePath();
	try {
		// Startup-only sync I/O: provider registration must have cached models before pi resolves model scopes.
		if (!existsSync(cachePath)) return [];
		const payload = JSON.parse(readFileSync(cachePath, "utf8")) as OllamaCloudModelCache;
		return sanitizeCachedModels(payload.models);
	} catch {
		return [];
	}
}

export async function saveCachedOllamaCloudModels(models: readonly OllamaProviderModel[]): Promise<void> {
	const sanitized = sanitizeCachedModels(models);
	if (sanitized.length === 0) return;

	const cachePath = getOllamaCloudModelCachePath();
	const payload: OllamaCloudModelCache = {
		models: sanitized,
		refreshedAt: Date.now(),
		version: CACHE_VERSION,
	};
	await mkdir(dirname(cachePath), { recursive: true });
	await writeFile(cachePath, `${JSON.stringify(payload, null, "\t")}\n`, "utf8");
}

function sanitizeCachedModels(models: unknown): OllamaProviderModel[] {
	if (!Array.isArray(models)) return [];
	const sanitized: OllamaProviderModel[] = [];
	for (const model of models) {
		if (!model || typeof model !== "object") continue;
		const id = (model as { id?: unknown }).id;
		if (typeof id !== "string" || id.trim().length === 0) continue;
		sanitized.push(
			toOllamaModel({
				...(model as Partial<OllamaProviderModel>),
				id: id.trim(),
				source: "cloud",
			}),
		);
	}
	return sanitized;
}
