/**
 * External Agent Protocol Resolution
 *
 * Resolves agent definitions from standard external configuration locations.
 * Supports three external agent protocols:
 *
 * 1. **VS Code method** — .vscode/agents.json with structured agent definitions
 * 2. **Claude Code method** — .claude/agents/<name>.md with agent system prompts
 * 3. **Open Code method** — .opencode/agents/<name>.md with agent system prompts
 *
 * Also checks .pi/agents/<name>.md for pi-specific project agents.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { AgentConfig } from "./agents.js";
import type { DynamicAgentSpec } from "./dynamic-agent.js";

import { createDynamicAgent } from "./dynamic-agent.js";

// ---------------------------------------------------------------------------
// External agent resolution cache (bounded LRU)
// ---------------------------------------------------------------------------

interface CacheEntry {
	result: ExternalAgentResult | null;
	mtime: number;
	filePath: string;
}

const MAX_CACHE_SIZE = 100;
const MAX_WATCHED_DIRS = 128;
const WATCH_DEBOUNCE_MS = 1_000;
const resolutionCache = new Map<string, CacheEntry>();
const autoSavedAgents = new Set<string>(); // key: name:cwd

interface WatchEntry {
	watcher: fs.FSWatcher;
	timer: ReturnType<typeof setTimeout> | null;
}

type WatchFactory = (dirPath: string, listener: fs.WatchListener<string>) => fs.FSWatcher;

function defaultWatchFactory(dirPath: string, listener: fs.WatchListener<string>): fs.FSWatcher {
	return fs.watch(dirPath, { persistent: false }, listener);
}

let watchFactory: WatchFactory = defaultWatchFactory;
const externalAgentWatchers = new Map<string, WatchEntry>();

function cacheKey(name: string, cwd: string): string {
	return `${name}:${path.resolve(cwd)}`;
}

function isCacheValid(entry: CacheEntry): boolean {
	try {
		const stats = fs.statSync(entry.filePath);
		return stats.mtimeMs === entry.mtime;
	} catch {
		return false;
	}
}

function getCachedResult(name: string, cwd: string): ExternalAgentResult | null | undefined {
	const key = cacheKey(name, cwd);
	const entry = resolutionCache.get(key);
	if (!entry) return undefined;
	if (!isCacheValid(entry)) {
		resolutionCache.delete(key);
		return undefined;
	}
	return entry.result;
}

function setCachedResult(name: string, cwd: string, result: ExternalAgentResult | null, filePath: string) {
	const key = cacheKey(name, cwd);
	let mtime = 0;
	try {
		mtime = fs.statSync(filePath).mtimeMs;
	} catch {}

	// Evict oldest if at capacity
	if (resolutionCache.size >= MAX_CACHE_SIZE && !resolutionCache.has(key)) {
		const firstKey = resolutionCache.keys().next().value;
		if (firstKey !== undefined) resolutionCache.delete(firstKey);
	}

	resolutionCache.set(key, { result, mtime, filePath });
}

/**
 * Clear the external agent resolution cache.
 * Useful for testing or when config files change externally.
 */
export function clearExternalAgentCache(): void {
	resolutionCache.clear();
	autoSavedAgents.clear();
}

/** Inspect cache size in tests without exposing mutable cache internals. */
export function getExternalAgentCacheSizeForTests(): number {
	return resolutionCache.size;
}

function isPathWithinDir(filePath: string, dirPath: string): boolean {
	const resolvedFile = path.resolve(filePath);
	const resolvedDir = path.resolve(dirPath);
	return resolvedFile === resolvedDir || resolvedFile.startsWith(`${resolvedDir}${path.sep}`);
}

function invalidateExternalAgentCacheForDir(dirPath: string): void {
	const deleteKeys: string[] = [];
	for (const [key, entry] of resolutionCache) {
		if (entry.filePath && isPathWithinDir(entry.filePath, dirPath)) {
			deleteKeys.push(key);
		}
	}
	for (const key of deleteKeys) resolutionCache.delete(key);
	if (deleteKeys.length > 0) autoSavedAgents.clear();
}

function closeExternalAgentWatcher(dirPath: string, entry: WatchEntry): void {
	if (entry.timer) clearTimeout(entry.timer);
	try {
		entry.watcher.close();
	} catch {}
	externalAgentWatchers.delete(dirPath);
}

/** Close all external-agent config directory watchers. */
export function closeExternalAgentWatchers(): void {
	const entries = Array.from(externalAgentWatchers.entries());
	for (const [dirPath, entry] of entries) closeExternalAgentWatcher(dirPath, entry);
}

/** Override watcher construction in tests. */
export function setExternalAgentWatchFactoryForTests(factory: WatchFactory | null): void {
	closeExternalAgentWatchers();
	watchFactory = factory ?? defaultWatchFactory;
}

function scheduleExternalAgentCacheInvalidation(dirPath: string): void {
	const entry = externalAgentWatchers.get(dirPath);
	if (!entry) return;
	if (entry.timer) clearTimeout(entry.timer);
	entry.timer = setTimeout(() => {
		entry.timer = null;
		invalidateExternalAgentCacheForDir(dirPath);
	}, WATCH_DEBOUNCE_MS);
	entry.timer.unref?.();
}

function isDirectoryPath(dirPath: string): boolean {
	try {
		return fs.statSync(dirPath).isDirectory();
	} catch {
		return false;
	}
}

function discoverExternalAgentWatchDirs(cwd: string): string[] {
	const dirs: string[] = [];
	for (const dir of searchUp(cwd, ".vscode")) dirs.push(path.join(dir, ".vscode"));
	for (const dir of searchUp(cwd, ".claude")) dirs.push(path.join(dir, ".claude", "agents"));
	for (const dir of searchUp(cwd, ".opencode")) dirs.push(path.join(dir, ".opencode", "agents"));
	for (const dir of searchUp(cwd, ".pi")) dirs.push(path.join(dir, ".pi", "agents"));
	return dirs;
}

/** Watch existing external-agent config directories and debounce cache invalidation. */
export function watchExternalAgentConfigDirs(cwd: string): void {
	for (const dirPath of discoverExternalAgentWatchDirs(cwd)) {
		const resolvedDir = path.resolve(dirPath);
		if (externalAgentWatchers.has(resolvedDir) || !isDirectoryPath(resolvedDir)) continue;
		if (externalAgentWatchers.size >= MAX_WATCHED_DIRS) return;
		try {
			const watcher = watchFactory(resolvedDir, () => scheduleExternalAgentCacheInvalidation(resolvedDir));
			externalAgentWatchers.set(resolvedDir, { watcher, timer: null });
		} catch {
			// Best-effort watcher registration; cache mtime checks still protect reads.
		}
	}
}

// ---------------------------------------------------------------------------
// Auto-save discovered external agents to .pi/agents/
// ---------------------------------------------------------------------------

function maybeAutoSaveAgent(name: string, cwd: string, result: ExternalAgentResult): void {
	if (result.source === "pi-project") return; // Already in pi project

	const key = `${name}:${path.resolve(cwd)}`;
	if (autoSavedAgents.has(key)) return;
	autoSavedAgents.add(key);

	try {
		const agentsDir = path.join(cwd, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });

		const config = result.config;
		const lines: string[] = [];
		lines.push("---");
		if (config.description) lines.push(`description: ${config.description}`);
		if (config.tools?.length) lines.push(`tools: [${config.tools.join(", ")}]`);
		if (config.skills?.length) lines.push(`skills: [${config.skills.join(", ")}]`);
		if (config.model) lines.push(`model: ${config.model}`);
		if (config.thinking) lines.push(`thinking: ${config.thinking}`);
		lines.push(`autoSavedFrom: ${result.source}`);
		lines.push("---");
		lines.push("");
		lines.push(config.systemPrompt || "");

		const filePath = path.join(agentsDir, `${name}.md`);
		fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
	} catch {
		// Best-effort auto-save; ignore failures
	}
}

/**
 * Supported external agent sources.
 */
export type ExternalAgentSource = "vscode" | "claude-code" | "open-code" | "pi-project";

/**
 * Result of external agent resolution.
 */
export interface ExternalAgentResult {
	config: AgentConfig;
	source: ExternalAgentSource;
	filePath: string;
}

// ---------------------------------------------------------------------------
// Hoisted regex for frontmatter parsing (perf rule 1)
// ---------------------------------------------------------------------------
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

// ---------------------------------------------------------------------------
// VS Code agents.json resolver
// ---------------------------------------------------------------------------

/** Shape of .vscode/agents.json entries. */
interface VSCodeAgentEntry {
	name: string;
	systemPrompt: string;
	description?: string;
	tools?: string[];
	skills?: string[];
	extensions?: string[];
	model?: string;
	thinking?: string;
}

interface VSCodeAgentsConfig {
	agents: VSCodeAgentEntry[];
}

/**
 * Resolve an agent from .vscode/agents.json.
 * Supports structured JSON config where each agent has name, systemPrompt, etc.
 *
 * Example .vscode/agents.json:
 * ```json
 * {
 *   "agents": [
 *     {
 *       "name": "devenv-scout",
 *       "systemPrompt": "You are an expert at exploring devenv configurations...",
 *       "tools": ["read", "bash", "grep", "find"]
 *     }
 *   ]
 * }
 * ```
 */
function resolveVSCodeAgent(name: string, cwd: string): ExternalAgentResult | undefined {
	const configPath = path.join(cwd, ".vscode", "agents.json");

	let raw: string;
	try {
		raw = fs.readFileSync(configPath, "utf-8");
	} catch {
		return undefined;
	}

	let config: VSCodeAgentsConfig;
	try {
		config = JSON.parse(raw) as VSCodeAgentsConfig;
	} catch {
		return undefined;
	}

	const agents = config.agents;
	if (!Array.isArray(agents)) return undefined;

	const entry = agents.find((a) => a.name === name);
	if (!entry) return undefined;

	const spec: DynamicAgentSpec = {
		name: entry.name,
		systemPrompt: entry.systemPrompt,
		description: entry.description,
		tools: entry.tools,
		skills: entry.skills,
		extensions: entry.extensions,
		model: entry.model,
		thinking: entry.thinking,
	};

	return {
		config: createDynamicAgent(spec),
		source: "vscode",
		filePath: configPath,
	};
}

// ---------------------------------------------------------------------------
// Markdown agent file resolver (Claude Code, Open Code, pi-project)
// ---------------------------------------------------------------------------

/**
 * Parse a markdown agent file.
 * The file can be:
 * - A plain system prompt (the entire content)
 * - YAML frontmatter with `systemPrompt` key + optional metadata
 *
 * Example (with frontmatter):
 * ```markdown
 * ---
 * description: Devenv configuration expert
 * tools: [read, bash, grep, find]
 * ---
 * You are an expert at exploring devenv configurations...
 * ```
 *
 * Without frontmatter, the entire markdown content is the system prompt.
 */
function parseMarkdownAgentFile(name: string, filePath: string): DynamicAgentSpec | undefined {
	let raw: string;
	try {
		raw = fs.readFileSync(filePath, "utf-8");
	} catch {
		return undefined;
	}

	// Try frontmatter parsing
	const fmMatch = raw.match(FRONTMATTER_RE);
	if (fmMatch) {
		// Simple YAML-like frontmatter parsing (avoid yaml dependency)
		const frontmatter = parseSimpleFrontmatter(fmMatch[1]);
		const systemPrompt = fmMatch[2]?.trim() || frontmatter.systemPrompt || "";

		if (!systemPrompt) return undefined;

		return {
			name,
			description: frontmatter.description,
			systemPrompt,
			tools: frontmatter.tools ? parseStringList(frontmatter.tools) : undefined,
			skills: frontmatter.skills ? parseStringList(frontmatter.skills) : undefined,
			extensions: frontmatter.extensions ? parseStringList(frontmatter.extensions) : undefined,
			model: frontmatter.model,
			thinking: frontmatter.thinking,
		};
	}

	// No frontmatter — entire content is the system prompt
	return {
		name,
		systemPrompt: raw.trim(),
	};
}

/** Very basic frontmatter parser — handles key: value pairs and arrays like [a, b]. */
function parseSimpleFrontmatter(raw: string): Record<string, string> {
	const result: Record<string, string> = {};
	const lines = raw.split("\n");
	for (const line of lines) {
		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) continue;
		const key = line.slice(0, colonIdx).trim();
		const value = line.slice(colonIdx + 1).trim();
		if (key && value) result[key] = value;
	}
	return result;
}

/** Parse a string like "[read, bash, grep]" or "read, bash, grep" into an array. */
export function parseStringList(raw: string): string[] {
	const stripped = raw.replace(/^\[|\]$/g, "").trim();
	if (!stripped) return [];
	return stripped
		.split(",")
		.map((s) => s.trim().replace(/^["']|["']$/g, ""))
		.filter(Boolean);
}

/**
 * Resolve an agent from a markdown file in a given directory.
 */
function resolveMarkdownDirAgent(
	name: string,
	dirPath: string,
	source: ExternalAgentSource,
): ExternalAgentResult | undefined {
	const filePath = path.join(dirPath, `${name}.md`);
	const spec = parseMarkdownAgentFile(name, filePath);
	if (!spec) return undefined;

	return {
		config: createDynamicAgent(spec),
		source,
		filePath,
	};
}

// ---------------------------------------------------------------------------
// Unified resolver
// ---------------------------------------------------------------------------

/**
 * Try to resolve an agent from external configuration files.
 *
 * Search order (first match wins):
 * 1. .pi/agents/<name>.md — pi-specific project agents
 * 2. .vscode/agents.json — VS Code structured agent config
 * 3. .claude/agents/<name>.md — Claude Code agent prompts
 * 4. .opencode/agents/<name>.md — Open Code agent prompts
 *
 * Returns undefined if no external definition is found.
 */
export function resolveExternalAgent(name: string, cwd: string): ExternalAgentResult | undefined {
	// Check cache first
	const cached = getCachedResult(name, cwd);
	if (cached !== undefined) {
		if (cached) maybeAutoSaveAgent(name, cwd, cached);
		return cached ?? undefined;
	}

	watchExternalAgentConfigDirs(cwd);

	let filePathForCache = "";

	// 1. .pi/agents/<name>.md
	for (const dir of searchUp(cwd, ".pi")) {
		const agentsDir = path.join(dir, ".pi", "agents");
		const result = resolveMarkdownDirAgent(name, agentsDir, "pi-project");
		if (result) {
			setCachedResult(name, cwd, result, result.filePath);
			return result;
		}
		filePathForCache = path.join(agentsDir, `${name}.md`);
	}

	// 2. .vscode/agents.json
	for (const dir of searchUp(cwd, ".vscode")) {
		const result = resolveVSCodeAgent(name, dir);
		if (result) {
			setCachedResult(name, cwd, result, result.filePath);
			maybeAutoSaveAgent(name, cwd, result);
			return result;
		}
		filePathForCache = path.join(dir, ".vscode", "agents.json");
	}

	// 3. .claude/agents/<name>.md
	for (const dir of searchUp(cwd, ".claude")) {
		const agentsDir = path.join(dir, ".claude", "agents");
		const result = resolveMarkdownDirAgent(name, agentsDir, "claude-code");
		if (result) {
			setCachedResult(name, cwd, result, result.filePath);
			maybeAutoSaveAgent(name, cwd, result);
			return result;
		}
		filePathForCache = path.join(agentsDir, `${name}.md`);
	}

	// 4. .opencode/agents/<name>.md
	for (const dir of searchUp(cwd, ".opencode")) {
		const agentsDir = path.join(dir, ".opencode", "agents");
		const result = resolveMarkdownDirAgent(name, agentsDir, "open-code");
		if (result) {
			setCachedResult(name, cwd, result, result.filePath);
			maybeAutoSaveAgent(name, cwd, result);
			return result;
		}
		filePathForCache = path.join(agentsDir, `${name}.md`);
	}

	// Cache miss
	setCachedResult(name, cwd, null, filePathForCache || path.join(cwd, ".vscode", "agents.json"));
	return undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk up the directory tree looking for a directory with the given name.
 * Returns all matching directories from cwd up to root.
 */
function searchUp(startDir: string, targetName: string): string[] {
	const results: string[] = [];
	let current = path.resolve(startDir);

	while (true) {
		const candidate = path.join(current, targetName);
		try {
			if (fs.statSync(candidate).isDirectory()) {
				results.push(current);
			}
		} catch {
			// stat failed — dir doesn't exist at this level
		}

		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}

	return results;
}
