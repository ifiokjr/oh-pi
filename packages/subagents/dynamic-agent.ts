/**
 * Dynamic Agent Creation — Ephemeral agents without on-disk .md files
 *
 * Host creates agents on-the-fly by specifying systemPrompt, tools, skills,
 * extensions, model, etc. The agent is injected into the existing subagent
 * runner (runSync) and cleaned up automatically.
 */

import { randomUUID } from "node:crypto";

import type { AgentConfig } from "./agents.js";
import type { AvailableModelRef } from "./model-routing.js";
import type { RunSyncOptions, SingleResult } from "./types.js";

import { runSync } from "./execution.js";
import { findAvailableModel } from "./model-routing.js";

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
	/** Model resolution policy */
	modelPolicy?: "inherit" | "scoped-only" | "adaptive";
	/** Thinking level suffix (e.g. "medium", "high") */
	thinking?: string;
	/** Idle timeout in ms (default: 15 min) */
	idleTimeoutMs?: number;
}

export interface RunDynamicOptions extends Omit<RunSyncOptions, "modelOverride" | "skills"> {
	/** List of models the host has scoped */
	availableModels?: AvailableModelRef[];
	/** The host's current model (e.g. "anthropic/claude-sonnet-4") */
	currentModel?: string;
	/** Called when usage data is finalized (for budget tracking across subagent calls) */
	onUsage?: (usage: SingleResult["usage"]) => void;
}

/**
 * Resolve a model for a dynamic agent based on spec and available models.
 *
 * | Policy | Behavior |
 * |---|---|
 * | `"inherit"` (default) | Use explicit `model` if in `availableModels`, else fall back to `currentModel`. |
 * | `"scoped-only"` | Same, but throws if requested model is unavailable. |
 * | `"adaptive"` | Falls back to `currentModel`; future versions may use adaptive routing. |
 */
export function resolveDynamicModel(
	spec: DynamicAgentSpec,
	options: Pick<RunDynamicOptions, "availableModels" | "currentModel">,
): string | undefined {
	const { availableModels, currentModel } = options;
	const policy = spec.modelPolicy ?? "inherit";

	// Try explicit model first
	if (spec.model) {
		if (availableModels?.length) {
			const validated = findAvailableModel(spec.model, availableModels);
			if (validated) return validated;
		}
		if (policy === "scoped-only") {
			throw new Error(
				`Dynamic agent "${spec.name ?? "unnamed"}" requested model "${spec.model}" is not in the scoped model list`,
			);
		}
		// "inherit" | "adaptive" → fall through to currentModel fallback
	}

	// Fallback to currentModel (if availableModels provided, validate it too)
	if (currentModel) {
		if (availableModels?.length) {
			return findAvailableModel(currentModel, availableModels) ?? undefined;
		}
		return currentModel;
	}

	return undefined;
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
	const resolvedModel = resolveDynamicModel(spec, options);

	const agent = createDynamicAgent({
		...spec,
		model: resolvedModel ?? spec.model,
	});

	const result = await runSync(runtimeCwd, [agent], agent.name, task, {
		...options,
		// modelOverride and skills are baked into the dynamic agent config
	});

	if (options.onUsage) {
		options.onUsage(result.usage);
	}

	return result;
}
