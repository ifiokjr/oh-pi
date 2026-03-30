/**
 * oh-pi Auto Update Extension
 *
 * Checks for new oh-pi versions on session start (at most once every 24h).
 * If a newer version is found, shows a toast notification with upgrade instructions.
 * The check runs in a `setTimeout` to avoid blocking session startup.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ExtensionAPI, getAgentDir } from "@mariozechner/pi-coding-agent";

/** Minimum interval between version checks (24 hours). */
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;

/** Stamp file path — stores the timestamp of the last version check. */
const STAMP_FILE = join(getAgentDir(), ".update-check");

/** Read the last-check timestamp from the stamp file. Returns 0 if missing or unreadable. */
function readStamp(): number {
	try {
		return Number(readFileSync(STAMP_FILE, "utf8").trim()) || 0;
	} catch {
		// Stamp file doesn't exist yet — treat as never checked
		return 0;
	}
}

/** Persist the current timestamp to the stamp file. Silently ignores write errors. */
function writeStamp(): void {
	try {
		writeFileSync(STAMP_FILE, String(Date.now()));
	} catch {
		// Non-critical — next session will re-check
	}
}

/** Query the npm registry for the latest published version of oh-pi. */
function getLatestVersion(): string | null {
	try {
		return execSync("npm view oh-pi version", { encoding: "utf8", timeout: 8000 }).trim();
	} catch {
		return null;
	}
}

/**
 * Determine the currently installed oh-pi version.
 * Tries reading the local package.json first, falls back to `npm list -g`.
 */
function getCurrentVersion(): string | null {
	try {
		const currentDir = dirname(fileURLToPath(import.meta.url));
		const pkgPath = join(currentDir, "..", "..", "package.json");
		if (existsSync(pkgPath)) {
			return JSON.parse(readFileSync(pkgPath, "utf8")).version;
		}
	} catch {
		// package.json not found at expected location
	}
	try {
		const out = JSON.parse(execSync("npm list -g oh-pi --json --depth=0", { encoding: "utf8", timeout: 8000 }));
		return out.dependencies?.["oh-pi"]?.version ?? null;
	} catch {
		return null;
	}
}

/**
 * Compare two semver strings. Returns `true` if `latest` is strictly newer than `current`.
 *
 * @example
 * ```ts
 * isNewer("1.2.0", "1.1.9") // true
 * isNewer("1.1.9", "1.2.0") // false
 * isNewer("1.0.0", "1.0.0") // false
 * ```
 */
export function isNewer(latest: string, current: string): boolean {
	const a = latest.split(".").map(Number);
	const b = current.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if ((a[i] ?? 0) > (b[i] ?? 0)) {
			return true;
		}
		if ((a[i] ?? 0) < (b[i] ?? 0)) {
			return false;
		}
	}
	return false;
}

/**
 * Extension entry point — registers a `session_start` hook that performs a
 * deferred, non-blocking version check and notifies the user if an update is available.
 */
export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		// Non-blocking: run check in background after a short delay
		setTimeout(() => {
			try {
				if (Date.now() - readStamp() < CHECK_INTERVAL) {
					return;
				}
				writeStamp();

				const current = getCurrentVersion();
				const latest = getLatestVersion();
				if (!(current && latest && isNewer(latest, current))) {
					return;
				}

				const msg = `oh-pi ${latest} available (current: ${current}). Run: npx @ifi/oh-pi@latest`;
				if (ctx.hasUI) {
					ctx.ui.notify(msg, "info");
				}
			} catch {
				// Version check is best-effort — never crash the session
			}
		}, 2000);
	});
}
