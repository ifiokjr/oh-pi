/**
<!-- {=sharedQnaPiTuiLoaderOverview} -->

`@ifi/pi-shared-qna` centralizes `@mariozechner/pi-tui` loading so first-party packages reuse one
fallback strategy instead of embedding Bun-global lookup logic in multiple runtime modules.

The shared loader tries the normal package resolution path first, then falls back to Bun global
install locations when a project is running outside a conventional dependency layout.

<!-- {/sharedQnaPiTuiLoaderOverview} -->
*/
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

export type PiTuiRequire = (specifier: string) => unknown;

export interface PiTuiLoaderOptions {
	homeDir?: string;
	bunInstallDir?: string | undefined;
	requireFn?: PiTuiRequire;
}

/**
<!-- {=sharedQnaGetPiTuiFallbackPathsDocs} -->

Return the ordered list of Bun global fallback paths to try for `@mariozechner/pi-tui`.

The list prefers an explicit `BUN_INSTALL` root when provided and always includes the default
`~/.bun/install/global/node_modules/@mariozechner/pi-tui` fallback without duplicates.

<!-- {/sharedQnaGetPiTuiFallbackPathsDocs} -->
*/
export function getPiTuiFallbackPaths(options: Omit<PiTuiLoaderOptions, "requireFn"> = {}): string[] {
	const homeDir = options.homeDir ?? os.homedir();
	const roots = new Set<string>();
	if (options.bunInstallDir) {
		roots.add(options.bunInstallDir);
	}
	roots.add(path.join(homeDir, ".bun"));
	return [...roots].map((root) => path.join(root, "install", "global", "node_modules", "@mariozechner", "pi-tui"));
}

/**
<!-- {=sharedQnaRequirePiTuiModuleDocs} -->

Load `@mariozechner/pi-tui` with a shared fallback strategy.

The loader first tries the normal package import path, then walks the Bun-global fallback list, and
finally throws a helpful error that names every checked location when none of them resolve.

<!-- {/sharedQnaRequirePiTuiModuleDocs} -->
*/
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
