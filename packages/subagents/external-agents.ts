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
function parseStringList(raw: string): string[] {
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
	// 1. .pi/agents/<name>.md
	for (const dir of searchUp(cwd, ".pi")) {
		const agentsDir = path.join(dir, ".pi", "agents");
		const result = resolveMarkdownDirAgent(name, agentsDir, "pi-project");
		if (result) return result;
	}

	// 2. .vscode/agents.json
	for (const dir of searchUp(cwd, ".vscode")) {
		const result = resolveVSCodeAgent(name, dir);
		if (result) return result;
	}

	// 3. .claude/agents/<name>.md
	for (const dir of searchUp(cwd, ".claude")) {
		const agentsDir = path.join(dir, ".claude", "agents");
		const result = resolveMarkdownDirAgent(name, agentsDir, "claude-code");
		if (result) return result;
	}

	// 4. .opencode/agents/<name>.md
	for (const dir of searchUp(cwd, ".opencode")) {
		const agentsDir = path.join(dir, ".opencode", "agents");
		const result = resolveMarkdownDirAgent(name, agentsDir, "open-code");
		if (result) return result;
	}

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
