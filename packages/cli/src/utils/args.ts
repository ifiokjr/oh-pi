/**
 * Minimal CLI argument parser for `npx oh-pi`.
 *
 * Recognises:
 *   -y, --yes    Non-interactive / skip confirmation mode
 */
export interface ParsedArgs {
	yes: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
	let yes = false;
	for (const arg of argv) {
		if (arg === "-y" || arg === "--yes") {
			yes = true;
		}
	}
	return { yes };
}
