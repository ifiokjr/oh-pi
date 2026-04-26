import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface ChangelogEntry {
	version: string;
	date: string;
	lines: string[];
}

const VERSION_RE = /^##\s+(\d+\.\d+\.\d+)\s+\((\d{4}-\d{2}-\d{2})\)/;

/** Parse a CHANGELOG.md content into versioned entries. */
export function parseChangelog(content: string): ChangelogEntry[] {
	const entries: ChangelogEntry[] = [];
	const lines = content.split("\n");
	let current: ChangelogEntry | null = null;

	for (const line of lines) {
		const match = VERSION_RE.exec(line);
		if (match) {
			if (current) {
				entries.push(current);
			}
			current = { date: match[2], lines: [], version: match[1] };
		} else if (current) {
			current.lines.push(line);
		}
	}
	if (current) {
		entries.push(current);
	}
	return entries;
}

/** Read CHANGELOG.md from the monorepo root relative to this package. */
export function readChangelog(): string {
	// In dist, this file is under packages/cli/dist/utils/changelog.js
	// Monorepo root is at packages/cli/../../
	const here = import.meta.dirname;
	const root = join(here, "..", "..", "..", "..");
	return readFileSync(join(root, "CHANGELOG.md"), "utf8");
}

/**
 * Extract entries between `fromVersion` (exclusive, if provided) and `toVersion` (inclusive).
 * Versions are compared as semver tuples.
 */
export function entriesBetween(
	entries: ChangelogEntry[],
	fromVersion: string | null,
	toVersion: string,
): ChangelogEntry[] {
	const toIdx = entries.findIndex((e) => e.version === toVersion);
	if (toIdx === -1) {
		return [];
	}
	if (!fromVersion) {
		return entries.slice(0, toIdx + 1);
	}
	const fromIdx = entries.findIndex((e) => e.version === fromVersion);
	if (fromIdx === -1) {
		return entries.slice(0, toIdx + 1);
	}
	return entries.slice(fromIdx + 1, toIdx + 1);
}

function parseSemver(v: string): [number, number, number] {
	const [major, minor, patch] = v.split(".").map(Number);
	return [major ?? 0, minor ?? 0, patch ?? 0];
}

export function compareVersion(a: string, b: string): number {
	const av = parseSemver(a);
	const bv = parseSemver(b);
	for (let i = 0; i < 3; i++) {
		if (av[i] !== bv[i]) {
			return av[i] - bv[i];
		}
	}
	return 0;
}

/**
 * Format a list of changelog entries for terminal display.
 * Strips markdown heading markers and limits length.
 */
export function renderChangelog(entries: ChangelogEntry[]): string {
	if (entries.length === 0) {
		return "No changes found.";
	}
	const out: string[] = [];
	for (const entry of entries) {
		out.push(`## ${entry.version} (${entry.date})`);
		for (const line of entry.lines) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}
			if (trimmed.startsWith("### ")) {
				out.push(`  ${trimmed.replace(/^###\s+/, "")}`);
			} else if (trimmed.startsWith("- ")) {
				out.push(`    ${trimmed}`);
			}
		}
		out.push("");
	}
	return out.join("\n").trim();
}
