import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

export type PiTuiRequire = (specifier: string) => unknown;

export interface PiTuiLoaderOptions {
	homeDir?: string;
	bunInstallDir?: string | undefined;
	requireFn?: PiTuiRequire;
}

export function getPiTuiFallbackPaths(options: Omit<PiTuiLoaderOptions, "requireFn"> = {}): string[] {
	const homeDir = options.homeDir ?? os.homedir();
	const roots = new Set<string>();
	if (options.bunInstallDir) {
		roots.add(options.bunInstallDir);
	}
	roots.add(path.join(homeDir, ".bun"));
	return [...roots].map((root) =>
		path.join(root, "install", "global", "node_modules", "@mariozechner", "pi-tui"),
	);
}

export function requirePiTuiModule(options: PiTuiLoaderOptions = {}): unknown {
	const requireFn = options.requireFn ?? createRequire(import.meta.url);
	try {
		return requireFn("@mariozechner/pi-tui");
	} catch (error) {
		const code = (error as { code?: string }).code;
		if (code !== "MODULE_NOT_FOUND") {
			throw error;
		}

		const fallbackPaths = getPiTuiFallbackPaths(options);
		for (const fallbackPath of fallbackPaths) {
			try {
				return requireFn(fallbackPath);
			} catch (fallbackError) {
				const fallbackCode = (fallbackError as { code?: string }).code;
				if (fallbackCode !== "MODULE_NOT_FOUND") {
					throw fallbackError;
				}
			}
		}

		throw new Error(
			`Unable to load @mariozechner/pi-tui. Checked the local dependency and Bun global fallbacks: ${fallbackPaths.join(", ")}`,
			{ cause: error },
		);
	}
}
