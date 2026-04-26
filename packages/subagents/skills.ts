/**
 * Skill resolution and caching for subagent extension
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { expandHomeDir } from "@ifi/oh-pi-core";
import { loadSkills } from "@mariozechner/pi-coding-agent";
import type { Skill } from "@mariozechner/pi-coding-agent";
import { resolveAgentDir } from "./paths.js";

export type SkillSource =
	| "project"
	| "user"
	| "project-package"
	| "user-package"
	| "project-settings"
	| "user-settings"
	| "extension"
	| "builtin"
	| "unknown";

export interface ResolvedSkill {
	name: string;
	path: string;
	content: string;
	source: SkillSource;
}

interface SkillCacheEntry {
	mtime: number;
	skill: ResolvedSkill;
}

interface CachedSkillEntry {
	name: string;
	filePath: string;
	source: SkillSource;
	description?: string;
	order: number;
}

const skillCache = new Map<string, SkillCacheEntry>();
const MAX_CACHE_SIZE = 50;

let loadSkillsCache: { cwd: string; skills: CachedSkillEntry[]; timestamp: number } | null = null;
const LOAD_SKILLS_CACHE_TTL_MS = 5000;

const CONFIG_DIR = ".pi";
const AGENT_DIR = resolveAgentDir();

const SOURCE_PRIORITY: Record<SkillSource, number> = {
	builtin: 100,
	extension: 150,
	project: 700,
	"project-package": 600,
	"project-settings": 650,
	unknown: 0,
	user: 300,
	"user-package": 200,
	"user-settings": 250,
};

function stripSkillFrontmatter(content: string): string {
	const normalized = content.replaceAll(/\r\n/g, "\n");
	if (!normalized.startsWith("---")) {
		return normalized;
	}

	const endIndex = normalized.indexOf("\n---", 3);
	if (endIndex === -1) {
		return normalized;
	}

	return normalized.slice(endIndex + 4).trim();
}

function isWithinPath(filePath: string, dir: string): boolean {
	const relative = path.relative(dir, filePath);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function getPackageSkillPaths(packageRoot: string): string[] {
	const pkgJsonPath = path.join(packageRoot, "package.json");
	try {
		const content = fs.readFileSync(pkgJsonPath, "utf8");
		const pkg = JSON.parse(content);
		const piSkills = pkg?.pi?.skills;
		if (!Array.isArray(piSkills)) {
			return [];
		}
		return piSkills.filter((s: unknown) => typeof s === "string").map((s: string) => path.resolve(packageRoot, s));
	} catch {
		return [];
	}
}

let cachedGlobalNpmRoot: string | null = null;

function getGlobalNpmRoot(): string | null {
	if (cachedGlobalNpmRoot !== null) {
		return cachedGlobalNpmRoot;
	}
	try {
		cachedGlobalNpmRoot = execSync("npm root -g", { encoding: "utf8", timeout: 5000 }).trim();
		return cachedGlobalNpmRoot;
	} catch {
		cachedGlobalNpmRoot = ""; // Empty string means "tried but failed"
		return null;
	}
}

function collectPackageSkillPaths(cwd: string): string[] {
	const dirs = [path.join(cwd, CONFIG_DIR, "npm", "node_modules"), path.join(AGENT_DIR, "npm", "node_modules")];

	// Add global npm root if available (where pi installs global packages)
	const globalRoot = getGlobalNpmRoot();
	if (globalRoot) {
		dirs.push(globalRoot);
	}

	const results: string[] = [];

	for (const dir of dirs) {
		if (!fs.existsSync(dir)) {
			continue;
		}
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (entry.name.startsWith(".")) {
				continue;
			}
			if (!entry.isDirectory() && !entry.isSymbolicLink()) {
				continue;
			}

			if (entry.name.startsWith("@")) {
				const scopeDir = path.join(dir, entry.name);
				let scopeEntries: fs.Dirent[];
				try {
					scopeEntries = fs.readdirSync(scopeDir, { withFileTypes: true });
				} catch {
					continue;
				}
				for (const scopeEntry of scopeEntries) {
					if (scopeEntry.name.startsWith(".")) {
						continue;
					}
					if (!scopeEntry.isDirectory() && !scopeEntry.isSymbolicLink()) {
						continue;
					}
					const pkgRoot = path.join(scopeDir, scopeEntry.name);
					results.push(...getPackageSkillPaths(pkgRoot));
				}
				continue;
			}

			const pkgRoot = path.join(dir, entry.name);
			results.push(...getPackageSkillPaths(pkgRoot));
		}
	}

	return results;
}

function collectSettingsSkillPaths(cwd: string): string[] {
	const results: string[] = [];
	const settingsFiles = [
		{ base: path.join(cwd, CONFIG_DIR), file: path.join(cwd, CONFIG_DIR, "settings.json") },
		{ base: AGENT_DIR, file: path.join(AGENT_DIR, "settings.json") },
	];

	for (const { file, base } of settingsFiles) {
		try {
			const content = fs.readFileSync(file, "utf8");
			const settings = JSON.parse(content);
			const skills = settings?.skills;
			if (!Array.isArray(skills)) {
				continue;
			}
			for (const entry of skills) {
				if (typeof entry !== "string") {
					continue;
				}
				let resolved = entry;
				if (resolved.startsWith("~/")) {
					resolved = expandHomeDir(resolved);
				} else if (!path.isAbsolute(resolved)) {
					resolved = path.resolve(base, resolved);
				}
				results.push(resolved);
			}
		} catch {}
	}

	return results;
}

function buildSkillPaths(cwd: string): string[] {
	const defaultSkillPaths = [path.join(cwd, CONFIG_DIR, "skills"), path.join(AGENT_DIR, "skills")];
	const packagePaths = collectPackageSkillPaths(cwd);
	const settingsPaths = collectSettingsSkillPaths(cwd);
	return [...new Set([...defaultSkillPaths, ...packagePaths, ...settingsPaths])];
}

function inferSkillSource(rawSource: unknown, filePath: string, cwd: string): SkillSource {
	const source = typeof rawSource === "string" ? rawSource : "";
	const projectRoot = path.resolve(cwd, CONFIG_DIR);
	const isProjectScoped = isWithinPath(filePath, projectRoot);
	const isUserScoped = isWithinPath(filePath, AGENT_DIR);
	const globalRoot = getGlobalNpmRoot();
	const isGlobalPackage = globalRoot ? isWithinPath(filePath, globalRoot) : false;

	if (source === "project") {
		return "project";
	}
	if (source === "user") {
		return "user";
	}
	if (source === "settings") {
		if (isProjectScoped) {
			return "project-settings";
		}
		if (isUserScoped) {
			return "user-settings";
		}
		return "unknown";
	}
	if (source === "package") {
		if (isProjectScoped) {
			return "project-package";
		}
		if (isUserScoped || isGlobalPackage) {
			return "user-package";
		}
		return "unknown";
	}
	if (source === "extension") {
		return "extension";
	}
	if (source === "builtin") {
		return "builtin";
	}

	if (isProjectScoped) {
		return "project";
	}
	if (isUserScoped) {
		return "user";
	}
	if (isGlobalPackage) {
		return "user-package";
	}
	return "unknown";
}

function chooseHigherPrioritySkill(
	existing: CachedSkillEntry | undefined,
	candidate: CachedSkillEntry,
): CachedSkillEntry {
	if (!existing) {
		return candidate;
	}
	const existingPriority = SOURCE_PRIORITY[existing.source] ?? 0;
	const candidatePriority = SOURCE_PRIORITY[candidate.source] ?? 0;
	if (candidatePriority > existingPriority) {
		return candidate;
	}
	if (candidatePriority < existingPriority) {
		return existing;
	}
	return candidate.order < existing.order ? candidate : existing;
}

function getCachedSkills(cwd: string): CachedSkillEntry[] {
	const now = Date.now();
	if (loadSkillsCache && loadSkillsCache.cwd === cwd && now - loadSkillsCache.timestamp < LOAD_SKILLS_CACHE_TTL_MS) {
		return loadSkillsCache.skills;
	}

	const skillPaths = buildSkillPaths(cwd);
	const loaded = loadSkills({ cwd, includeDefaults: false, skillPaths });
	const dedupedByName = new Map<string, CachedSkillEntry>();

	for (let i = 0; i < loaded.skills.length; i++) {
		const skill = loaded.skills[i] as Skill;
		const entry: CachedSkillEntry = {
			description: skill.description,
			filePath: skill.filePath,
			name: skill.name,
			order: i,
			source: inferSkillSource((skill as { source?: unknown }).source, skill.filePath, cwd),
		};
		const current = dedupedByName.get(entry.name);
		dedupedByName.set(entry.name, chooseHigherPrioritySkill(current, entry));
	}

	const skills = [...dedupedByName.values()].toSorted((a, b) => a.order - b.order);
	loadSkillsCache = { cwd, skills, timestamp: now };
	return skills;
}

export function resolveSkillPath(skillName: string, cwd: string): { path: string; source: SkillSource } | undefined {
	const skills = getCachedSkills(cwd);
	const skill = skills.find((s) => s.name === skillName);
	if (!skill) {
		return undefined;
	}
	return { path: skill.filePath, source: skill.source };
}

export function readSkill(skillName: string, skillPath: string, source: SkillSource): ResolvedSkill | undefined {
	try {
		const stat = fs.statSync(skillPath);
		const cached = skillCache.get(skillPath);
		if (cached && cached.mtime === stat.mtimeMs) {
			return cached.skill;
		}

		const raw = fs.readFileSync(skillPath, "utf8");
		const content = stripSkillFrontmatter(raw);
		const skill: ResolvedSkill = {
			content,
			name: skillName,
			path: skillPath,
			source,
		};

		skillCache.set(skillPath, { mtime: stat.mtimeMs, skill });
		if (skillCache.size > MAX_CACHE_SIZE) {
			const firstKey = skillCache.keys().next().value;
			if (firstKey) {
				skillCache.delete(firstKey);
			}
		}

		return skill;
	} catch {
		return undefined;
	}
}

export function resolveSkills(skillNames: string[], cwd: string): { resolved: ResolvedSkill[]; missing: string[] } {
	const resolved: ResolvedSkill[] = [];
	const missing: string[] = [];

	for (const name of skillNames) {
		const trimmed = name.trim();
		if (!trimmed) {
			continue;
		}

		const location = resolveSkillPath(trimmed, cwd);
		if (!location) {
			missing.push(trimmed);
			continue;
		}

		const skill = readSkill(trimmed, location.path, location.source);
		if (skill) {
			resolved.push(skill);
		} else {
			missing.push(trimmed);
		}
	}

	return { missing, resolved };
}

export function buildSkillInjection(skills: ResolvedSkill[]): string {
	if (skills.length === 0) {
		return "";
	}

	return skills.map((s) => `<skill name="${s.name}">\n${s.content}\n</skill>`).join("\n\n");
}

export function normalizeSkillInput(input: string | string[] | boolean | undefined): string[] | false | undefined {
	if (input === false) {
		return false;
	}
	if (input === true || input === undefined) {
		return undefined;
	}
	if (Array.isArray(input)) {
		return [...new Set(input.map((s) => s.trim()).filter((s) => s.length > 0))];
	}
	// Guard against JSON-encoded arrays arriving as strings (e.g. '["a","b"]').
	// Models sometimes serialise the skill parameter as a JSON string instead of
	// A native array, and naively splitting on "," would embed brackets/quotes
	// Into the skill names, causing resolution to silently fail.
	const trimmed = input.trim();
	if (trimmed.startsWith("[")) {
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) {
				return normalizeSkillInput(parsed);
			}
		} catch {
			// Not valid JSON – fall through to comma-split
		}
	}
	return [
		...new Set(
			input
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s.length > 0),
		),
	];
}

export function discoverAvailableSkills(cwd: string): {
	name: string;
	source: SkillSource;
	description?: string;
}[] {
	const skills = getCachedSkills(cwd);
	return skills
		.map((s) => ({
			description: s.description,
			name: s.name,
			source: s.source,
		}))
		.toSorted((a, b) => a.name.localeCompare(b.name));
}

export function clearSkillCache(): void {
	skillCache.clear();
	loadSkillsCache = null;
}
