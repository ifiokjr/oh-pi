/**
 * Dynamic Agent Creation — Ephemeral agents without on-disk .md files
 *
 * Host creates agents on-the-fly by specifying systemPrompt, tools, skills,
 * extensions, model, etc. The agent is injected into the existing subagent
 * runner (runSync) and cleaned up automatically.
 */

import type { ManagedWorktreeMetadata } from "@ifi/oh-pi-core";

import { createManagedWorktree, createOwnerMetadata, removeManagedWorktree } from "@ifi/oh-pi-core";
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

export interface DynamicAgentWorktreeOptions {
	/** Branch name for the new worktree (required) */
	branch: string;
	/** Why this worktree exists (required) */
	purpose: string;
	/** Base ref for the new branch (default: HEAD) */
	baseRef?: string;
	/** Remove the worktree after execution (default: false) */
	cleanup?: boolean;
}

export interface RunDynamicOptions extends Omit<RunSyncOptions, "modelOverride" | "skills"> {
	/** List of models the host has scoped */
	availableModels?: AvailableModelRef[];
	/** The host's current model (e.g. "anthropic/claude-sonnet-4") */
	currentModel?: string;
	/** Called when usage data is finalized (for budget tracking across subagent calls) */
	onUsage?: (usage: SingleResult["usage"]) => void;
	/** Create a managed worktree and run the agent inside it */
	worktree?: DynamicAgentWorktreeOptions;
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
 *
 * When `options.worktree` is provided, the agent runs inside a newly created
 * managed git worktree. If `cleanup: true`, the worktree is removed after
 * execution regardless of success or failure.
 */
export async function runDynamicAgent(
	runtimeCwd: string,
	spec: DynamicAgentSpec,
	task: string,
	options: RunDynamicOptions = { runId: randomUUID() },
): Promise<SingleResult & { worktreePath?: string; worktreeBranch?: string }> {
	const resolvedModel = resolveDynamicModel(spec, options);

	// If worktree creation is requested, create it before spawning the agent
	let worktreePath: string | undefined;
	let worktreeBranch: string | undefined;
	let worktreeCleanup = false;
	let worktreeMetadata: ManagedWorktreeMetadata | undefined;
	if (options.worktree) {
		const owner = createOwnerMetadata({
			instanceId: `dynamic-agent-${randomUUID()}`,
			cwd: runtimeCwd,
			sessionName: options.runId ?? undefined,
		});

		const result = createManagedWorktree({
			cwd: runtimeCwd,
			branch: options.worktree.branch,
			purpose: options.worktree.purpose,
			baseRef: options.worktree.baseRef,
			owner,
		});

		worktreePath = result.worktreePath;
		worktreeBranch = result.branch;
		worktreeCleanup = options.worktree.cleanup ?? false;
		worktreeMetadata = result.metadata;
	}

	const agent = createDynamicAgent({
		...spec,
		model: resolvedModel ?? spec.model,
	});

	try {
		const result = await runSync(worktreePath ?? runtimeCwd, [agent], agent.name, task, {
			...options,
			// modelOverride and skills are baked into the dynamic agent config
		});

		if (options.onUsage) {
			options.onUsage(result.usage);
		}

		return {
			...result,
			worktreePath,
			worktreeBranch,
		};
	} finally {
		if (worktreeMetadata && worktreeCleanup) {
			try {
				removeManagedWorktree(worktreeMetadata);
			} catch {
				// Best-effort cleanup; ignore failures
			}
		}
	}
}
