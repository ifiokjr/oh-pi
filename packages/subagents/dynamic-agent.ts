/**
 * Dynamic Agent Creation — Ephemeral agents without on-disk .md files
 *
 * Host creates agents on-the-fly by specifying systemPrompt, tools, skills,
 * extensions, model, etc. The agent is injected into the existing subagent
 * runner (runSync) and cleaned up automatically.
 */

import { randomUUID } from "node:crypto";
import type { AgentConfig } from "./agents.js";
import { runSync } from "./execution.js";
import type { RunSyncOptions, SingleResult } from "./types.js";

let dynamicAgentCounter = 0;

export interface DynamicAgentSpec {
	/** Display name for logging (auto-generated if omitted) */
	name?: string;
	/** One-line description for observability */
	description?: string;
	/** Required system prompt */
	systemPrompt: string;
	/** Tool names to enable (builtin + extension paths) */
	tools?: string[];
	/** MCP direct tool names */
	mcpDirectTools?: string[];
	/** Skill names to inject */
	skills?: string[];
	/** Extension paths to load */
	extensions?: string[];
	/** Explicit model override (provider/id or just id) */
	model?: string;
	/** Thinking level suffix (e.g. "medium", "high") */
	thinking?: string;
	/** Idle timeout in ms (default: 15 min) */
	idleTimeoutMs?: number;
}

/**
 * Convert a dynamic spec into an AgentConfig compatible with the existing runner.
 * The resulting config is ephemeral — no .md file exists on disk.
 */
export function createDynamicAgent(spec: DynamicAgentSpec): AgentConfig {
	dynamicAgentCounter++;
	const name = spec.name || `dynamic-${dynamicAgentCounter}`;
	return {
		name,
		description: spec.description || `Ephemeral agent ${name}`,
		systemPrompt: spec.systemPrompt,
		tools: spec.tools,
		mcpDirectTools: spec.mcpDirectTools,
		skills: spec.skills,
		extensions: spec.extensions,
		model: spec.model,
		thinking: spec.thinking,
		idleTimeoutMs: spec.idleTimeoutMs,
		// Ephemeral agents are treated as builtin so they don't require disk presence
		source: "builtin",
		// Placeholder path since no .md file exists; runner only uses this for metadata
		filePath: "<dynamic>",
	};
}

export interface RunDynamicOptions extends Omit<RunSyncOptions, "modelOverride" | "skills"> {
	/** Called when usage data is finalized (for budget tracking across subagent calls) */
	onUsage?: (usage: SingleResult["usage"]) => void;
}

/**
 * Create an ephemeral agent from a spec and run it immediately via runSync.
 * The agent config is discarded after execution; only the result is returned.
 */
export async function runDynamicAgent(
	runtimeCwd: string,
	spec: DynamicAgentSpec,
	task: string,
	options: RunDynamicOptions = { runId: randomUUID() },
): Promise<SingleResult> {
	const agent = createDynamicAgent(spec);
	const result = await runSync(runtimeCwd, [agent], agent.name, task, {
		...options,
		// modelOverride and skills are baked into the dynamic agent config
	});

	if (options.onUsage) {
		options.onUsage(result.usage);
	}

	return result;
}
