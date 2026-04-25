/**
 * Agent discovery and configuration
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { KNOWN_FIELDS } from "./agent-serializer.js";
import { mergeAgentsForScope } from "./agent-selection.js";
import { parseChain } from "./chain-serializer.js";
import { getUserAgentsDir } from "./paths.js";
import { findNearestProjectAgentsDir } from "./project-agents-storage.js";

export type AgentScope = "user" | "project" | "both";

export type AgentSource = "builtin" | "user" | "project";

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	mcpDirectTools?: string[];
	model?: string;
	thinking?: string;
	systemPrompt: string;
	source: AgentSource;
	filePath: string;
	skills?: string[];
	extensions?: string[];
	// Chain behavior fields
	output?: string;
	defaultReads?: string[];
	defaultProgress?: boolean;
	interactive?: boolean;
	extraFields?: Record<string, string>;
}

export interface ChainStepConfig {
	agent: string;
	task: string;
	output?: string | false;
	reads?: string[] | false;
	model?: string;
	skills?: string[] | false;
	progress?: boolean;
}

export interface ChainConfig {
	name: string;
	description: string;
	source: AgentSource;
	filePath: string;
	steps: ChainStepConfig[];
	extraFields?: Record<string, string>;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
	const frontmatter: Record<string, string> = {};
	const normalized = content.replace(/\r\n/g, "\n");

	if (!normalized.startsWith("---")) {
		return { frontmatter, body: normalized };
	}

	const endIndex = normalized.indexOf("\n---", 3);
	if (endIndex === -1) {
		return { frontmatter, body: normalized };
	}

	const frontmatterBlock = normalized.slice(4, endIndex);
	const body = normalized.slice(endIndex + 4).trim();

	for (const line of frontmatterBlock.split("\n")) {
		const match = line.match(/^([\w-]+):\s*(.*)$/);
		if (match) {
			let value = match[2].trim();
			if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1);
			}
			frontmatter[match[1]] = value;
		}
	}

	return { frontmatter, body };
}

function loadAgentsFromDir(dir: string, source: AgentSource): AgentConfig[] {
	const agents: AgentConfig[] = [];

	if (!fs.existsSync(dir)) {
		return agents;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (entry.name.endsWith(".chain.md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter(content);

		if (!frontmatter.name || !frontmatter.description) {
			continue;
		}

		const rawTools = frontmatter.tools
			?.split(",")
			.map((t) => t.trim())
			.filter(Boolean);

		const mcpDirectTools: string[] = [];
		const tools: string[] = [];
		if (rawTools) {
			for (const tool of rawTools) {
				if (tool.startsWith("mcp:")) {
					mcpDirectTools.push(tool.slice(4));
				} else {
					tools.push(tool);
				}
			}
		}

		// Parse defaultReads as comma-separated list (like tools)
		const defaultReads = frontmatter.defaultReads
			?.split(",")
			.map((f) => f.trim())
			.filter(Boolean);

		const skillStr = frontmatter.skill || frontmatter.skills;
		const skills = skillStr
			?.split(",")
			.map((s) => s.trim())
			.filter(Boolean);

		let extensions: string[] | undefined;
		if (frontmatter.extensions !== undefined) {
			extensions = frontmatter.extensions
				.split(",")
				.map((e) => e.trim())
				.filter(Boolean);
		}

		const extraFields: Record<string, string> = {};
		for (const [key, value] of Object.entries(frontmatter)) {
			if (!KNOWN_FIELDS.has(key)) extraFields[key] = value;
		}

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: tools.length > 0 ? tools : undefined,
			mcpDirectTools: mcpDirectTools.length > 0 ? mcpDirectTools : undefined,
			model: frontmatter.model,
			thinking: frontmatter.thinking,
			systemPrompt: body,
			source,
			filePath,
			skills: skills && skills.length > 0 ? skills : undefined,
			extensions,
			// Chain behavior fields
			output: frontmatter.output,
			defaultReads: defaultReads && defaultReads.length > 0 ? defaultReads : undefined,
			defaultProgress: frontmatter.defaultProgress === "true",
			interactive: frontmatter.interactive === "true",
			extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
		});
	}

	return agents;
}

function loadChainsFromDir(dir: string, source: AgentSource): ChainConfig[] {
	const chains: ChainConfig[] = [];

	if (!fs.existsSync(dir)) {
		return chains;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return chains;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".chain.md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		try {
			chains.push(parseChain(content, source, filePath));
		} catch {
			continue;
		}
	}

	return chains;
}

const BUILTIN_AGENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "agents");

/**
 * Resolve agent directories from a settings.json `agents` array.
 * Relative paths resolve against the settings file's parent directory.
 */
function resolveAgentPaths(agentPaths: string[], settingsBaseDir: string): string[] {
	return agentPaths
		.map((p: string) => {
			let resolved = p;
			if (p.startsWith("~/")) {
				resolved = p.replace("~", os.homedir());
			}
			if (!resolved.startsWith("/")) {
				resolved = path.resolve(settingsBaseDir, resolved);
			}
			return resolved;
		})
		.filter((p: string) => {
			try {
				return fs.statSync(p).isDirectory();
			} catch {
				return false;
			}
		});
}

/**
 * Read the `agents` array from a project's `.pi/settings.json`.
 * Returns undefined if no project settings or no agents field.
 */
function readProjectAgentPaths(cwd: string): { paths: string[]; baseDir: string } | undefined {
	let current = path.resolve(cwd);
	const home = os.homedir();
	for (let i = 0; i < 30; i++) {
		const settingsPath = path.join(current, ".pi", "settings.json");
		try {
			const raw = fs.readFileSync(settingsPath, "utf-8");
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed.agents) && parsed.agents.length > 0) {
				return { paths: parsed.agents as string[], baseDir: current };
			}
		} catch {
			// no settings or invalid JSON — continue walking up
		}
		const parent = path.dirname(current);
		if (parent === current || current === home) break;
		current = parent;
	}
	return undefined;
}

export function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	const userDir = getUserAgentsDir();

	// Check for explicit agent paths in project settings
	const projectAgentsConfig = scope !== "user" ? readProjectAgentPaths(cwd) : undefined;

	let projectAgents: AgentConfig[] = [];
	let builtinAgents: AgentConfig[] = [];
	let userAgents: AgentConfig[] = [];

	if (projectAgentsConfig) {
		// Explicit agent paths — ONLY load from these (no builtins, no user agents)
		const dirs = resolveAgentPaths(projectAgentsConfig.paths, projectAgentsConfig.baseDir);
		for (const dir of dirs) {
			projectAgents = [...projectAgents, ...loadAgentsFromDir(dir, "project")];
		}
	} else {
		// No explicit config — fall back to standard discovery
		const projectAgentsDir = findNearestProjectAgentsDir(cwd);
		if (projectAgentsDir) {
			projectAgents = loadAgentsFromDir(projectAgentsDir, "project");
		}
		if (scope !== "project") {
			builtinAgents = loadAgentsFromDir(BUILTIN_AGENTS_DIR, "builtin");
			userAgents = loadAgentsFromDir(userDir, "user");
		}
	}

	const agents = mergeAgentsForScope(scope, userAgents, projectAgents, builtinAgents);

	return { agents, projectAgentsDir: projectAgentsConfig?.baseDir ?? findNearestProjectAgentsDir(cwd) };
}

export function discoverAgentsAll(cwd: string): {
	builtin: AgentConfig[];
	user: AgentConfig[];
	project: AgentConfig[];
	chains: ChainConfig[];
	userDir: string;
	projectDir: string;
} {
	const userDir = getUserAgentsDir();

	// Check for explicit agent paths in project settings
	const projectAgentsConfig = readProjectAgentPaths(cwd);

	let project: AgentConfig[] = [];
	let builtin: AgentConfig[] = [];
	let user: AgentConfig[] = [];

	if (projectAgentsConfig) {
		const dirs = resolveAgentPaths(projectAgentsConfig.paths, projectAgentsConfig.baseDir);
		for (const dir of dirs) {
			project = [...project, ...loadAgentsFromDir(dir, "project")];
		}
	} else {
		const projectDir = findNearestProjectAgentsDir(cwd);
		if (projectDir) {
			project = loadAgentsFromDir(projectDir, "project");
		}
		builtin = loadAgentsFromDir(BUILTIN_AGENTS_DIR, "builtin");
		user = loadAgentsFromDir(userDir, "user");
	}

	const chains: ChainConfig[] = [];
	const chainDirs: string[] = [];
	if (projectAgentsConfig) {
		// With explicit config, only load chains from user dir
		chainDirs.push(userDir);
	} else {
		// Without explicit config, load chains from user dir and project dir
		chainDirs.push(userDir);
		const projDir = findNearestProjectAgentsDir(cwd);
		if (projDir) chainDirs.push(projDir);
	}
	for (const dir of chainDirs) {
		const loaded = loadChainsFromDir(dir, dir === userDir ? "user" : "project");
		chains.push(...loaded);
	}

	return { builtin, user, project, chains, userDir, projectDir: projectAgentsConfig?.baseDir ?? findNearestProjectAgentsDir(cwd) };
}
