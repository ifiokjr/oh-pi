/**
 * Oh-pi Auto Update Extension
 *
 * Checks for new oh-pi versions on session start (at most once every 24h).
 * If a newer version is found, shows a toast notification with upgrade instructions.
 * The check runs in a `setTimeout` to avoid blocking session startup.
 */
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const IS_WINDOWS = process.platform === "win32";

/** Minimum interval between version checks (24 hours). */
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;

/** Stamp file path — stores the timestamp of the last version check. */
const STAMP_FILE = join(getAgentDir(), ".update-check");

export interface AutoUpdateCheckDependencies {
	readStamp?: () => number;
	writeStamp?: () => void;
	getCurrentVersion?: () => Promise<string | null> | string | null;
	getLatestVersion?: () => Promise<string | null> | string | null;
	now?: () => number;
	notify?: (message: string) => void;
}

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

function execFileText(command: string, args: string[], timeout = 8000): Promise<string | null> {
	return new Promise((resolve) => {
		execFile(command, args, { encoding: "utf8", shell: IS_WINDOWS, timeout }, (error, stdout) => {
			if (error) {
				resolve(null);
				return;
			}

			const text = stdout.trim();
			resolve(text || null);
		});
	});
}

/** Query the npm registry for the latest published version of oh-pi. */
async function getLatestVersion(): Promise<string | null> {
	return execFileText("npm", ["view", "oh-pi", "version"]);
}

/**
 * Determine the currently installed oh-pi version.
 * Tries reading the local package.json first, falls back to `npm list -g`.
 */
async function getCurrentVersion(): Promise<string | null> {
	try {
		const currentDir = import.meta.dirname;
		const pkgPath = join(currentDir, "..", "..", "package.json");
		if (existsSync(pkgPath)) {
			const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
				version?: unknown;
			};
			return typeof pkg.version === "string" ? pkg.version : null;
		}
	} catch {
		// Package.json not found at expected location
	}

	const output = await execFileText("npm", ["list", "-g", "oh-pi", "--json", "--depth=0"]);
	if (!output) {
		return null;
	}

	try {
		const parsed = JSON.parse(output) as {
			dependencies?: {
				"oh-pi"?: {
					version?: unknown;
				};
			};
		};
		const version = parsed.dependencies?.["oh-pi"]?.version;
		return typeof version === "string" ? version : null;
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

export async function runAutoUpdateCheck(deps: AutoUpdateCheckDependencies = {}): Promise<string | null> {
	const now = deps.now ?? Date.now;
	const read = deps.readStamp ?? readStamp;
	const write = deps.writeStamp ?? writeStamp;
	const resolveCurrentVersion = deps.getCurrentVersion ?? getCurrentVersion;
	const resolveLatestVersion = deps.getLatestVersion ?? getLatestVersion;

	if (now() - read() < CHECK_INTERVAL) {
		return null;
	}

	write();

	const [current, latest] = await Promise.all([resolveCurrentVersion(), resolveLatestVersion()]);
	if (!(current && latest && isNewer(latest, current))) {
		return null;
	}

	const message = `oh-pi ${latest} available (current: ${current}). Run: npx @ifi/oh-pi@latest`;
	deps.notify?.(message);
	return message;
}

/**
 * Extension entry point — registers a `session_start` hook that performs a
 * deferred, non-blocking version check and notifies the user if an update is available.
 */
export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		// Non-blocking: run check in background after a short delay
		setTimeout(() => {
			runAutoUpdateCheck({
				notify: ctx.hasUI ? (message) => ctx.ui.notify(message, "info") : undefined,
			}).catch(() => {
				// Version check is best-effort — never crash the session
			});
		}, 2000);
	});
}
