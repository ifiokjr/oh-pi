import { existsSync, readFileSync } from "node:fs";

export interface NormalizedConfigResult<T> {
	value: T;
	warnings?: string[];
}

export interface LoadJsonConfigFileOptions<T> {
	path: string;
	fallback: T;
	normalize: (raw: unknown) => NormalizedConfigResult<T>;
	warn?: (message: string) => void;
}

export function loadJsonConfigFile<T>({ path, fallback, normalize, warn }: LoadJsonConfigFileOptions<T>): T {
	if (!existsSync(path)) {
		return structuredClone(fallback);
	}

	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		warn?.(`Failed to parse config ${path}: ${detail}`);
		return structuredClone(fallback);
	}

	try {
		const normalized = normalize(raw);
		for (const message of normalized.warnings ?? []) {
			warn?.(message);
		}
		return normalized.value;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		warn?.(`Failed to normalize config ${path}: ${detail}`);
		return structuredClone(fallback);
	}
}
