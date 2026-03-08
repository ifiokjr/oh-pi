/**
 * oh-pi Safe Guard Extension
 *
 * Two-layer protection for dangerous operations:
 * 1. **Command guard** — detects destructive bash patterns (rm -rf, DROP TABLE, etc.)
 *    and prompts for confirmation in interactive mode
 * 2. **Path guard** — blocks writes to sensitive paths (.env, .git/, .ssh/, etc.)
 *    with user confirmation in interactive mode, or outright blocking in headless mode
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/** Regex patterns that match potentially destructive bash commands. */
export const DANGEROUS_PATTERNS = [
	/\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|.*-rf\b|.*--force\b)/,
	/\bsudo\s+rm\b/,
	/\b(DROP|TRUNCATE|DELETE\s+FROM)\b/i,
	/\bchmod\s+777\b/,
	/\bmkfs\b/,
	/\bdd\s+if=/,
	/>\s*\/dev\/sd[a-z]/,
];

/** File paths that should never be written to without explicit confirmation. */
export const PROTECTED_PATHS = [".env", ".git/", "node_modules/", ".pi/", "id_rsa", ".ssh/"];

/**
 * Extension entry point — registers a `tool_call` hook that intercepts
 * dangerous bash commands and writes to protected paths.
 */
export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		// Check bash commands for dangerous patterns
		if (event.toolName === "bash") {
			const cmd = (event.input as { command?: string }).command ?? "";
			const match = DANGEROUS_PATTERNS.find((p) => p.test(cmd));
			if (match && ctx.hasUI) {
				const ok = await ctx.ui.confirm("⚠️ Dangerous Command", `Execute: ${cmd}?`);
				if (!ok) {
					return { block: true, reason: "Blocked by user" };
				}
			}
		}

		// Check write/edit for protected paths
		if (event.toolName === "write" || event.toolName === "edit") {
			const filePath = (event.input as { path?: string }).path ?? "";
			const hit = PROTECTED_PATHS.find((p) => filePath.includes(p));
			if (hit) {
				if (ctx.hasUI) {
					const ok = await ctx.ui.confirm("🛡️ Protected Path", `Allow write to ${filePath}?`);
					if (!ok) {
						return { block: true, reason: `Protected path: ${hit}` };
					}
				} else {
					return { block: true, reason: `Protected path: ${hit}` };
				}
			}
		}
	});
}
