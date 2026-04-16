/**
 * Subagent Tool
 *
 * Full-featured subagent with sync and async modes.
 * - Sync (default): Streams output, renders markdown, tracks usage
 * - Async: Background execution, emits events when done
 *
 * Modes: single (agent + task), parallel (tasks[]), chain (chain[] with {previous})
 * Toggle: async parameter (default: false, configurable via config.json)
 *
 * Config file: ~/.pi/agent/extensions/subagent/config.json
 *   { "asyncByDefault": true }
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { type ExtensionAPI, type ExtensionContext, type ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type AgentConfig, type AgentScope, discoverAgents, discoverAgentsAll } from "./agents.js";
import { resolveExecutionAgentScope } from "./agent-scope.js";
import {
	cleanupOldChainDirs,
	getStepAgents,
	isParallelStep,
	resolveStepBehavior,
	type ChainStep,
	type SequentialStep,
} from "./settings.js";
import { ChainClarifyComponent, type ChainClarifyResult, type ModelInfo } from "./chain-clarify.js";
import { cleanupAllArtifactDirs, cleanupOldArtifacts, getArtifactsDir } from "./artifacts.js";
import {
	type AgentProgress,
	type ArtifactConfig,
	type ArtifactPaths,
	type AsyncJobState,
	type Details,
	type ExtensionConfig,
	type SingleResult,
	ASYNC_DIR,
	DEFAULT_ARTIFACT_CONFIG,
	DEFAULT_MAX_OUTPUT,
	MAX_CONCURRENCY,
	MAX_PARALLEL,
	RESULTS_DIR,
	WIDGET_KEY,
	checkSubagentDepth,
} from "./types.js";
import { findByPrefix, getFinalOutput, mapConcurrent, readStatus } from "./utils.js";
import { runSync } from "./execution.js";
import { renderWidget, renderSubagentResult } from "./render.js";
import { SubagentParams, StatusParams } from "./schemas.js";
import { executeChain } from "./chain-execution.js";
import { isAsyncAvailable, executeAsyncChain, executeAsyncSingle } from "./async-execution.js";
import { discoverAvailableSkills, normalizeSkillInput } from "./skills.js";
import { finalizeSingleOutput, injectSingleOutputInstruction, resolveSingleOutputPath } from "./single-output.js";
import { AgentManagerComponent, type ManagerResult } from "./agent-manager.js";
import { recordRun } from "./run-history.js";
import { handleManagementAction } from "./agent-management.js";
import { registerSubagentCommands } from "./command-registration.js";
import { ensureAccessibleDir, expandTildePath, getSubagentSessionRoot, loadSubagentConfig } from "./bootstrap.js";
import { createSubagentRuntimeMonitor } from "./runtime-monitor.js";
import { resolveSubagentModelResolution } from "./model-routing.js";

const STARTUP_CLEANUP_DELAY_MS = 250;

// ExtensionConfig is now imported from ./types.js

export default function registerSubagentExtension(pi: ExtensionAPI): void {
	ensureAccessibleDir(RESULTS_DIR);
	ensureAccessibleDir(ASYNC_DIR);

	let config: ExtensionConfig | null = null;
	const getConfig = (): ExtensionConfig => {
		config ??= loadSubagentConfig();
		return config;
	};

	const tempArtifactsDir = getArtifactsDir(null);
	let baseCwd = process.cwd();
	let currentSessionId: string | null = null;
	const asyncJobs = new Map<string, AsyncJobState>();
	const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
	let lastUiContext: ExtensionContext | null = null;
	let safeModeEnabled = false;

	const runtimeMonitor = createSubagentRuntimeMonitor({
		pi,
		asyncJobs,
		getBaseCwd: () => baseCwd,
		getCurrentSessionId: () => currentSessionId,
		getLastUiContext: () => lastUiContext,
		getSafeModeEnabled: () => safeModeEnabled,
	});

	const tool: ToolDefinition<typeof SubagentParams, Details> = {
		name: "subagent",
		label: "Subagent",
		description: `Delegate to subagents or manage agent definitions.

EXECUTION (use exactly ONE mode):
• SINGLE: { agent, task } - one task
• CHAIN: { chain: [{agent:"scout"}, {agent:"planner"}] } - sequential pipeline
• PARALLEL: { tasks: [{agent,task}, ...] } - concurrent execution

CHAIN TEMPLATE VARIABLES (use in task strings):
• {task} - The original task/request from the user
• {previous} - Text response from the previous step (empty for first step)
• {chain_dir} - Shared directory for chain files (e.g., <tmpdir>/pi-chain-runs/abc123/)

CHAIN DATA FLOW:
1. Each step's text response automatically becomes {previous} for the next step
2. Steps can also write files to {chain_dir} (via agent's "output" config)
3. Later steps can read those files (via agent's "reads" config)

Example: { chain: [{agent:"scout", task:"Analyze {task}"}, {agent:"planner", task:"Plan based on {previous}"}] }

MANAGEMENT (use action field — omit agent/task/chain/tasks):
• { action: "list" } - discover available agents and chains
• { action: "get", agent: "name" } - full agent detail with system prompt
• { action: "create", config: { name, description, systemPrompt, ... } } - create agent/chain
• { action: "update", agent: "name", config: { ... } } - modify fields (merge)
• { action: "delete", agent: "name" } - remove definition
• Use chainName instead of agent for chain operations`,
		parameters: SubagentParams,

		async execute(_id, params, signal, onUpdate, ctx) {
			baseCwd = ctx.cwd;
			const config = getConfig();
			const asyncByDefault = config.asyncByDefault === true;
			if (params.action) {
				const validActions = ["list", "get", "create", "update", "delete"];
				if (!validActions.includes(params.action)) {
					return {
						content: [{ type: "text", text: `Unknown action: ${params.action}. Valid: ${validActions.join(", ")}` }],
						isError: true,
						details: { mode: "management" as const, results: [] },
					};
				}
				return handleManagementAction(params.action, params, ctx);
			}

			const { blocked, depth, maxDepth } = checkSubagentDepth();
			if (blocked) {
				return {
					content: [
						{
							type: "text",
							text:
								`Nested subagent call blocked (depth=${depth}, max=${maxDepth}). ` +
								"You are running at the maximum subagent nesting depth. " +
								"Complete your current task directly without delegating to further subagents.",
						},
					],
					isError: true,
					details: { mode: "single" as const, results: [] },
				};
			}

			const scope: AgentScope = resolveExecutionAgentScope(params.agentScope);
			const parentSessionFile = ctx.sessionManager.getSessionFile() ?? null;
			currentSessionId = parentSessionFile ?? `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			const agents = discoverAgents(ctx.cwd, scope).agents;
			const runId = randomUUID().slice(0, 8);
			const shareEnabled = params.share === true;
			// Session root precedence: explicit param > config default > parent session derived
			// Sessions are always enabled - stored alongside parent session for tracking
			// Include runId to ensure uniqueness across multiple subagent calls
			const sessionRoot = params.sessionDir
				? path.resolve(expandTildePath(params.sessionDir))
				: path.join(
						config.defaultSessionDir
							? path.resolve(expandTildePath(config.defaultSessionDir))
							: getSubagentSessionRoot(parentSessionFile),
						runId,
					);
			try {
				fs.mkdirSync(sessionRoot, { recursive: true });
			} catch {}
			const sessionDirForIndex = (idx?: number) => path.join(sessionRoot, `run-${idx ?? 0}`);

			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasTasks = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.agent && params.task);

			const requestedAsync = params.async ?? asyncByDefault;
			const parallelDowngraded = hasTasks && requestedAsync;
			// clarify implies sync mode (TUI is blocking)
			// - Chains default to TUI (clarify: true), so async requires explicit clarify: false
			// - Single defaults to no TUI, so async is allowed unless clarify: true is passed
			const effectiveAsync =
				requestedAsync &&
				!hasTasks &&
				(hasChain
					? params.clarify === false // chains: only async if TUI explicitly disabled
					: params.clarify !== true); // single: async unless TUI explicitly enabled

			const artifactConfig: ArtifactConfig = {
				...DEFAULT_ARTIFACT_CONFIG,
				enabled: params.artifacts !== false,
			};

			const artifactsDir = effectiveAsync ? tempArtifactsDir : getArtifactsDir(parentSessionFile);

			if (Number(hasChain) + Number(hasTasks) + Number(hasSingle) !== 1) {
				return {
					content: [
						{
							type: "text",
							text: `Provide exactly one mode. Agents: ${agents.map((a) => a.name).join(", ") || "none"}`,
						},
					],
					isError: true,
					details: { mode: "single" as const, results: [] },
				};
			}

			// Validate chain early (before async/sync branching)
			if (hasChain && params.chain) {
				if (params.chain.length === 0) {
					return {
						content: [{ type: "text", text: "Chain must have at least one step" }],
						isError: true,
						details: { mode: "chain" as const, results: [] },
					};
				}
				// First step must have a task
				const firstStep = params.chain[0] as ChainStep;
				if (isParallelStep(firstStep)) {
					// All tasks in the first parallel step must have tasks (no {previous} to reference)
					const missingTaskIndex = firstStep.parallel.findIndex((t) => !t.task);
					if (missingTaskIndex !== -1) {
						return {
							content: [
								{
									type: "text",
									text: `First parallel step: task ${missingTaskIndex + 1} must have a task (no previous output to reference)`,
								},
							],
							isError: true,
							details: { mode: "chain" as const, results: [] },
						};
					}
				} else if (!(firstStep as SequentialStep).task && !params.task) {
					return {
						content: [{ type: "text", text: "First step in chain must have a task" }],
						isError: true,
						details: { mode: "chain" as const, results: [] },
					};
				}
				// Validate all agents exist
				for (let i = 0; i < params.chain.length; i++) {
					const step = params.chain[i] as ChainStep;
					const stepAgents = getStepAgents(step);
					for (const agentName of stepAgents) {
						if (!agents.find((a) => a.name === agentName)) {
							return {
								content: [{ type: "text", text: `Unknown agent: ${agentName} (step ${i + 1})` }],
								isError: true,
								details: { mode: "chain" as const, results: [] },
							};
						}
					}
					// Validate parallel steps have at least one task
					if (isParallelStep(step) && step.parallel.length === 0) {
						return {
							content: [{ type: "text", text: `Parallel step ${i + 1} must have at least one task` }],
							isError: true,
							details: { mode: "chain" as const, results: [] },
						};
					}
				}
			}

			if (effectiveAsync) {
				if (!isAsyncAvailable()) {
					return {
						content: [
							{
								type: "text",
								text: "Async mode requires jiti for TypeScript execution but it could not be found. Install globally: npm install -g jiti",
							},
						],
						isError: true,
						details: { mode: "single" as const, results: [] },
					};
				}
				const id = randomUUID();
				const asyncCtx = {
					pi,
					cwd: ctx.cwd,
					currentSessionId: currentSessionId!,
					currentModel: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
					availableModels: ctx.modelRegistry.getAvailable().map((m) => ({
						provider: m.provider,
						id: m.id,
						fullId: `${m.provider}/${m.id}`,
					})),
				};

				if (hasChain && params.chain) {
					const normalized = normalizeSkillInput(params.skill);
					const chainSkills = normalized === false ? [] : (normalized ?? []);
					return executeAsyncChain(id, {
						chain: params.chain as ChainStep[],
						agents,
						ctx: asyncCtx,
						cwd: params.cwd,
						maxOutput: params.maxOutput,
						artifactsDir: artifactConfig.enabled ? artifactsDir : undefined,
						artifactConfig,
						shareEnabled,
						sessionRoot,
						chainSkills,
					});
				}

				if (hasSingle) {
					const a = agents.find((x) => x.name === params.agent);
					if (!a) {
						return {
							content: [{ type: "text", text: `Unknown: ${params.agent}` }],
							isError: true,
							details: { mode: "single" as const, results: [] },
						};
					}
					const rawOutput = params.output !== undefined ? params.output : a.output;
					const effectiveOutput: string | false | undefined = rawOutput === true ? a.output : rawOutput;
					return executeAsyncSingle(id, {
						agent: params.agent!,
						task: params.task!,
						agentConfig: a,
						ctx: asyncCtx,
						cwd: params.cwd,
						maxOutput: params.maxOutput,
						artifactsDir: artifactConfig.enabled ? artifactsDir : undefined,
						artifactConfig,
						shareEnabled,
						sessionRoot,
						skills: (() => {
							const normalized = normalizeSkillInput(params.skill);
							if (normalized === false) return [];
							if (normalized === undefined) return undefined;
							return normalized;
						})(),
						output: effectiveOutput,
					});
				}
			}

			const allProgress: AgentProgress[] = [];
			const allArtifactPaths: ArtifactPaths[] = [];

			if (hasChain && params.chain) {
				const normalized = normalizeSkillInput(params.skill);
				const chainSkills = normalized === false ? [] : (normalized ?? []);
				// Use extracted chain execution module
				const chainResult = await executeChain({
					chain: params.chain as ChainStep[],
					task: params.task,
					agents,
					ctx,
					signal,
					runId,
					cwd: params.cwd,
					shareEnabled,
					sessionDirForIndex,
					artifactsDir,
					artifactConfig,
					includeProgress: params.includeProgress,
					clarify: params.clarify,
					onUpdate,
					chainSkills,
					chainDir: params.chainDir,
				});

				// User requested async via TUI - dispatch to async executor
				if (chainResult.requestedAsync) {
					if (!isAsyncAvailable()) {
						return {
							content: [
								{
									type: "text",
									text: "Background mode requires jiti for TypeScript execution but it could not be found.",
								},
							],
							isError: true,
							details: { mode: "chain" as const, results: [] },
						};
					}
					const id = randomUUID();
					const asyncCtx = {
						pi,
						cwd: ctx.cwd,
						currentSessionId: currentSessionId!,
						currentModel: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
						availableModels: ctx.modelRegistry.getAvailable().map((m) => ({
							provider: m.provider,
							id: m.id,
							fullId: `${m.provider}/${m.id}`,
						})),
					};
					return executeAsyncChain(id, {
						chain: chainResult.requestedAsync.chain,
						agents,
						ctx: asyncCtx,
						cwd: params.cwd,
						maxOutput: params.maxOutput,
						artifactsDir: artifactConfig.enabled ? artifactsDir : undefined,
						artifactConfig,
						shareEnabled,
						sessionRoot,
						chainSkills: chainResult.requestedAsync.chainSkills,
					});
				}

				return chainResult;
			}

			if (hasTasks && params.tasks) {
				// MAX_PARALLEL check first (fail fast before TUI)
				if (params.tasks.length > MAX_PARALLEL)
					return {
						content: [{ type: "text", text: `Max ${MAX_PARALLEL} tasks` }],
						isError: true,
						details: { mode: "parallel" as const, results: [] },
					};

				// Validate all agents exist
				const agentConfigs: AgentConfig[] = [];
				for (const t of params.tasks) {
					const config = agents.find((a) => a.name === t.agent);
					if (!config) {
						return {
							content: [{ type: "text", text: `Unknown agent: ${t.agent}` }],
							isError: true,
							details: { mode: "parallel" as const, results: [] },
						};
					}
					agentConfigs.push(config);
				}

				// Mutable copies for TUI modifications
				let tasks = params.tasks.map((t) => t.task);
				const inheritedModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
				const availableModels = ctx.modelRegistry.getAvailable().map((m) => ({
					provider: m.provider,
					id: m.id,
					fullId: `${m.provider}/${m.id}`,
				}));
				const modelResolutions = agentConfigs.map((config, i) => {
					const resolution = resolveSubagentModelResolution(
						config,
						availableModels,
						(params.tasks?.[i] as { model?: string } | undefined)?.model,
					);
					if (!resolution.model && inheritedModel) {
						return { ...resolution, model: inheritedModel, source: "session-default" as const };
					}
					return resolution;
				});
				// Initialize skill overrides from task-level skill params (may be overridden by TUI)
				const skillOverrides: (string[] | false | undefined)[] = params.tasks.map((t) =>
					normalizeSkillInput((t as { skill?: string | string[] | boolean }).skill),
				);

				// Show clarify TUI if requested
				if (params.clarify === true && ctx.hasUI) {
					// Get available models (same pattern as chain-execution.ts)
					const availableModels: ModelInfo[] = ctx.modelRegistry.getAvailable().map((m) => ({
						provider: m.provider,
						id: m.id,
						fullId: `${m.provider}/${m.id}`,
					}));

					// Resolve behaviors with task-level skill overrides for TUI display
					const behaviors = agentConfigs.map((c, i) => resolveStepBehavior(c, { skills: skillOverrides[i] }));
					const availableSkills = discoverAvailableSkills(ctx.cwd);

					const result = await ctx.ui.custom<ChainClarifyResult>(
						(tui, theme, _kb, done) =>
							new ChainClarifyComponent(
								tui,
								theme,
								agentConfigs,
								tasks,
								"", // no originalTask for parallel (each task is independent)
								undefined, // no chainDir for parallel
								behaviors,
								availableModels,
								availableSkills,
								done,
								"parallel", // mode
							),
						{ overlay: true, overlayOptions: { anchor: "center", width: 84, maxHeight: "80%" } },
					);

					if (!result || !result.confirmed) {
						return { content: [{ type: "text", text: "Cancelled" }], details: { mode: "parallel", results: [] } };
					}

					// Apply TUI overrides
					tasks = result.templates;
					for (let i = 0; i < result.behaviorOverrides.length; i++) {
						const override = result.behaviorOverrides[i];
						if (override?.model) {
							modelResolutions[i] = {
								model: override.model,
								source: "runtime-override",
								category: modelResolutions[i]?.category,
							};
						}
						if (override?.skills !== undefined) skillOverrides[i] = override.skills;
					}

					// User requested background execution
					if (result.runInBackground) {
						if (!isAsyncAvailable()) {
							return {
								content: [
									{
										type: "text",
										text: "Background mode requires jiti for TypeScript execution but it could not be found.",
									},
								],
								isError: true,
								details: { mode: "parallel" as const, results: [] },
							};
						}
						const id = randomUUID();
						const asyncCtx = {
							pi,
							cwd: ctx.cwd,
							currentSessionId: currentSessionId!,
							currentModel: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
							availableModels: ctx.modelRegistry.getAvailable().map((m) => ({
								provider: m.provider,
								id: m.id,
								fullId: `${m.provider}/${m.id}`,
							})),
						};
						// Convert parallel tasks to a chain with a single parallel step
						const parallelTasks = params.tasks!.map((t, i) => ({
							agent: t.agent,
							task: tasks[i],
							cwd: t.cwd,
							...(modelResolutions[i]?.model ? { model: modelResolutions[i]?.model } : {}),
							...(skillOverrides[i] !== undefined ? { skill: skillOverrides[i] } : {}),
						}));
						return executeAsyncChain(id, {
							chain: [{ parallel: parallelTasks }],
							agents,
							ctx: asyncCtx,
							cwd: params.cwd,
							maxOutput: params.maxOutput,
							artifactsDir: artifactConfig.enabled ? artifactsDir : undefined,
							artifactConfig,
							shareEnabled,
							sessionRoot,
							chainSkills: [],
						});
					}
				}

				// Execute with overrides (tasks array has same length as params.tasks)
				const behaviors = agentConfigs.map((c) => resolveStepBehavior(c, {}));
				const liveResults: (SingleResult | undefined)[] = new Array(params.tasks.length).fill(undefined);
				const liveProgress: (AgentProgress | undefined)[] = new Array(params.tasks.length).fill(undefined);
				const results = await mapConcurrent(params.tasks, MAX_CONCURRENCY, async (t, i) => {
					const overrideSkills = skillOverrides[i];
					const effectiveSkills = overrideSkills === undefined ? behaviors[i]?.skills : overrideSkills;
					return runSync(ctx.cwd, agents, t.agent, tasks[i]!, {
						cwd: t.cwd ?? params.cwd,
						signal,
						runId,
						index: i,
						sessionDir: sessionDirForIndex(i),
						share: shareEnabled,
						artifactsDir: artifactConfig.enabled ? artifactsDir : undefined,
						artifactConfig,
						maxOutput: params.maxOutput,
						modelOverride: modelResolutions[i]?.model,
						modelSource: modelResolutions[i]?.source,
						modelCategory: modelResolutions[i]?.category,
						skills: effectiveSkills === false ? [] : effectiveSkills,
						onUpdate: onUpdate
							? (p) => {
									const stepResults = p.details?.results || [];
									const stepProgress = p.details?.progress || [];
									if (stepResults.length > 0) liveResults[i] = stepResults[0];
									if (stepProgress.length > 0) liveProgress[i] = stepProgress[0];
									const mergedResults = liveResults.filter((r): r is SingleResult => r !== undefined);
									const mergedProgress = liveProgress.filter((pg): pg is AgentProgress => pg !== undefined);
									onUpdate({
										content: p.content,
										details: {
											mode: "parallel",
											results: mergedResults,
											progress: mergedProgress,
											totalSteps: params.tasks!.length,
										},
									});
								}
							: undefined,
					});
				});
				for (let i = 0; i < results.length; i++) {
					const run = results[i]!;
					recordRun(run.agent, tasks[i]!, run.exitCode, run.progressSummary?.durationMs ?? 0);
				}

				for (const r of results) {
					if (r.progress) allProgress.push(r.progress);
					if (r.artifactPaths) allArtifactPaths.push(r.artifactPaths);
				}

				const ok = results.filter((r) => r.exitCode === 0).length;
				const downgradeNote = parallelDowngraded ? " (async not supported for parallel)" : "";

				// Aggregate outputs from all parallel tasks
				const aggregatedOutput = results
					.map((r, i) => {
						const header = `=== Task ${i + 1}: ${r.agent} ===`;
						const output = r.truncation?.text || getFinalOutput(r.messages);
						const hasOutput = Boolean(output?.trim());
						const status =
							r.exitCode !== 0
								? `[!] FAILED (exit code ${r.exitCode})${r.error ? `: ${r.error}` : ""}`
								: r.error
									? `[!] WARNING: ${r.error}`
									: !hasOutput
										? "[!] EMPTY OUTPUT"
										: "";
						const body = status ? (hasOutput ? `${status}\n${output}` : status) : output;
						return `${header}\n${body}`;
					})
					.join("\n\n");

				const summary = `${ok}/${results.length} succeeded${downgradeNote}`;
				const fullContent = `${summary}\n\n${aggregatedOutput}`;

				return {
					content: [{ type: "text", text: fullContent }],
					details: {
						mode: "parallel",
						results,
						progress: params.includeProgress ? allProgress : undefined,
						artifacts: allArtifactPaths.length ? { dir: artifactsDir, files: allArtifactPaths } : undefined,
					},
				};
			}

			if (hasSingle) {
				// Look up agent config for output handling
				const agentConfig = agents.find((a) => a.name === params.agent);
				if (!agentConfig) {
					return {
						content: [{ type: "text", text: `Unknown agent: ${params.agent}` }],
						isError: true,
						details: { mode: "single", results: [] },
					};
				}

				let task = params.task!;
				const availableModels = ctx.modelRegistry.getAvailable().map((m) => ({
					provider: m.provider,
					id: m.id,
					fullId: `${m.provider}/${m.id}`,
				}));
				let modelResolution = resolveSubagentModelResolution(agentConfig, availableModels, params.model as string | undefined);
				if (!modelResolution.model && ctx.model) {
					modelResolution = {
						...modelResolution,
						model: `${ctx.model.provider}/${ctx.model.id}`,
						source: "session-default",
					};
				}
				let modelOverride: string | undefined = modelResolution.model;
				let skillOverride: string[] | false | undefined = normalizeSkillInput(params.skill);
				// Normalize output: true means "use default" (same as undefined), false means disable
				const rawOutput = params.output !== undefined ? params.output : agentConfig.output;
				let effectiveOutput: string | false | undefined = rawOutput === true ? agentConfig.output : rawOutput;

				// Show clarify TUI if requested
				if (params.clarify === true && ctx.hasUI) {
					// Get available models (same pattern as chain-execution.ts)
					const availableModels: ModelInfo[] = ctx.modelRegistry.getAvailable().map((m) => ({
						provider: m.provider,
						id: m.id,
						fullId: `${m.provider}/${m.id}`,
					}));

					const behavior = resolveStepBehavior(agentConfig, { output: effectiveOutput, skills: skillOverride });
					const availableSkills = discoverAvailableSkills(ctx.cwd);

					const result = await ctx.ui.custom<ChainClarifyResult>(
						(tui, theme, _kb, done) =>
							new ChainClarifyComponent(
								tui,
								theme,
								[agentConfig],
								[task],
								task,
								undefined, // no chainDir for single
								[behavior],
								availableModels,
								availableSkills,
								done,
								"single", // mode
							),
						{ overlay: true, overlayOptions: { anchor: "center", width: 84, maxHeight: "80%" } },
					);

					if (!result || !result.confirmed) {
						return { content: [{ type: "text", text: "Cancelled" }], details: { mode: "single", results: [] } };
					}

					// Apply TUI overrides
					task = result.templates[0]!;
					const override = result.behaviorOverrides[0];
					if (override?.model) {
						modelOverride = override.model;
						modelResolution = {
							model: override.model,
							source: "runtime-override",
							category: modelResolution.category,
						};
					}
					if (override?.output !== undefined) effectiveOutput = override.output;
					if (override?.skills !== undefined) skillOverride = override.skills;

					// User requested background execution
					if (result.runInBackground) {
						if (!isAsyncAvailable()) {
							return {
								content: [
									{
										type: "text",
										text: "Background mode requires jiti for TypeScript execution but it could not be found.",
									},
								],
								isError: true,
								details: { mode: "single" as const, results: [] },
							};
						}
						const id = randomUUID();
						const asyncCtx = {
							pi,
							cwd: ctx.cwd,
							currentSessionId: currentSessionId!,
							currentModel: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
							availableModels: ctx.modelRegistry.getAvailable().map((m) => ({
								provider: m.provider,
								id: m.id,
								fullId: `${m.provider}/${m.id}`,
							})),
						};
						return executeAsyncSingle(id, {
							agent: params.agent!,
							task,
							agentConfig,
							ctx: asyncCtx,
							cwd: params.cwd,
							maxOutput: params.maxOutput,
							artifactsDir: artifactConfig.enabled ? artifactsDir : undefined,
							artifactConfig,
							shareEnabled,
							sessionRoot,
							skills: skillOverride === false ? [] : skillOverride,
							output: effectiveOutput,
						});
					}
				}

				const cleanTask = task;
				const outputPath = resolveSingleOutputPath(effectiveOutput, ctx.cwd, params.cwd);
				task = injectSingleOutputInstruction(task, outputPath);

				const effectiveSkills = skillOverride === false ? [] : skillOverride === undefined ? undefined : skillOverride;

				const r = await runSync(ctx.cwd, agents, params.agent!, task, {
					cwd: params.cwd,
					signal,
					runId,
					sessionDir: sessionDirForIndex(0),
					share: shareEnabled,
					artifactsDir: artifactConfig.enabled ? artifactsDir : undefined,
					artifactConfig,
					maxOutput: params.maxOutput,
					onUpdate,
					modelOverride,
					modelSource: modelResolution.source,
					modelCategory: modelResolution.category,
					skills: effectiveSkills,
				});
				recordRun(params.agent!, cleanTask, r.exitCode, r.progressSummary?.durationMs ?? 0);

				if (r.progress) allProgress.push(r.progress);
				if (r.artifactPaths) allArtifactPaths.push(r.artifactPaths);

				const fullOutput = getFinalOutput(r.messages);
				const finalizedOutput = finalizeSingleOutput({
					fullOutput,
					truncatedOutput: r.truncation?.text,
					outputPath,
					exitCode: r.exitCode,
				});

				if (r.exitCode !== 0)
					return {
						content: [{ type: "text", text: r.error || "Failed" }],
						details: {
							mode: "single",
							results: [r],
							progress: params.includeProgress ? allProgress : undefined,
							artifacts: allArtifactPaths.length ? { dir: artifactsDir, files: allArtifactPaths } : undefined,
							truncation: r.truncation,
						},
						isError: true,
					};
				return {
					content: [{ type: "text", text: finalizedOutput.displayOutput || "(no output)" }],
					details: {
						mode: "single",
						results: [r],
						progress: params.includeProgress ? allProgress : undefined,
						artifacts: allArtifactPaths.length ? { dir: artifactsDir, files: allArtifactPaths } : undefined,
						truncation: r.truncation,
					},
				};
			}

			return {
				content: [{ type: "text", text: "Invalid params" }],
				isError: true,
				details: { mode: "single" as const, results: [] },
			};
		},

		renderCall(args, theme) {
			if (args.action) {
				const target = args.agent || args.chainName || "";
				return new Text(
					`${theme.fg("toolTitle", theme.bold("subagent "))}${args.action}${target ? ` ${theme.fg("accent", target)}` : ""}`,
					0,
					0,
				);
			}
			const isParallel = (args.tasks?.length ?? 0) > 0;
			const asyncLabel = args.async === true && !isParallel ? theme.fg("warning", " [async]") : "";
			if (args.chain?.length)
				return new Text(
					`${theme.fg("toolTitle", theme.bold("subagent "))}chain (${args.chain.length})${asyncLabel}`,
					0,
					0,
				);
			if (isParallel)
				return new Text(`${theme.fg("toolTitle", theme.bold("subagent "))}parallel (${args.tasks!.length})`, 0, 0);
			return new Text(
				`${theme.fg("toolTitle", theme.bold("subagent "))}${theme.fg("accent", args.agent || "?")}${asyncLabel}`,
				0,
				0,
			);
		},

		renderResult(result, options, theme) {
			return renderSubagentResult(result, options, theme);
		},
	};

	const statusTool: ToolDefinition<typeof StatusParams, Details> = {
		name: "subagent_status",
		label: "Subagent Status",
		description: "Inspect async subagent run status and artifacts",
		parameters: StatusParams,

		async execute(_id, params, _signal, _onUpdate, _ctx) {
			let asyncDir: string | null = null;
			let resolvedId = params.id;

			if (params.dir) {
				asyncDir = path.resolve(params.dir);
			} else if (params.id) {
				const direct = path.join(ASYNC_DIR, params.id);
				if (fs.existsSync(direct)) {
					asyncDir = direct;
				} else {
					const match = findByPrefix(ASYNC_DIR, params.id);
					if (match) {
						asyncDir = match;
						resolvedId = path.basename(match);
					}
				}
			}

			const resultPath = params.id && !asyncDir ? findByPrefix(RESULTS_DIR, params.id, ".json") : null;

			if (!asyncDir && !resultPath) {
				return {
					content: [{ type: "text", text: "Async run not found. Provide id or dir." }],
					isError: true,
					details: { mode: "single" as const, results: [] },
				};
			}

			if (asyncDir) {
				const status = readStatus(asyncDir);
				const logPath = path.join(asyncDir, `subagent-log-${resolvedId ?? "unknown"}.md`);
				const eventsPath = path.join(asyncDir, "events.jsonl");
				if (status) {
					const stepsTotal = status.steps?.length ?? 1;
					const current = status.currentStep !== undefined ? status.currentStep + 1 : undefined;
					const stepLine = current !== undefined ? `Step: ${current}/${stepsTotal}` : `Steps: ${stepsTotal}`;
					const started = new Date(status.startedAt).toISOString();
					const updated = status.lastUpdate ? new Date(status.lastUpdate).toISOString() : "n/a";

					const lines = [
						`Run: ${status.runId}`,
						`State: ${status.state}`,
						`Mode: ${status.mode}`,
						stepLine,
						`Started: ${started}`,
						`Updated: ${updated}`,
						`Dir: ${asyncDir}`,
					];
					if (status.sessionFile) lines.push(`Session: ${status.sessionFile}`);
					// Sharing disabled - session file path shown above
					if (fs.existsSync(logPath)) lines.push(`Log: ${logPath}`);
					if (fs.existsSync(eventsPath)) lines.push(`Events: ${eventsPath}`);

					return { content: [{ type: "text", text: lines.join("\n") }], details: { mode: "single", results: [] } };
				}
			}

			if (resultPath) {
				try {
					const raw = fs.readFileSync(resultPath, "utf-8");
					const data = JSON.parse(raw) as { id?: string; success?: boolean; summary?: string };
					const status = data.success ? "complete" : "failed";
					const lines = [`Run: ${data.id ?? params.id}`, `State: ${status}`, `Result: ${resultPath}`];
					if (data.summary) lines.push("", data.summary);
					return { content: [{ type: "text", text: lines.join("\n") }], details: { mode: "single", results: [] } };
				} catch {}
			}

			return {
				content: [{ type: "text", text: "Status file not found." }],
				isError: true,
				details: { mode: "single" as const, results: [] },
			};
		},
	};

	pi.registerTool(tool);
	pi.registerTool(statusTool);

	const setupDirectRun = (ctx: ExtensionContext) => {
		const runId = randomUUID().slice(0, 8);
		const parentSessionFile = ctx.sessionManager.getSessionFile() ?? null;
		const sessionRoot = path.join(getSubagentSessionRoot(parentSessionFile), runId);
		try {
			fs.mkdirSync(sessionRoot, { recursive: true });
		} catch {}
		return {
			runId,
			shareEnabled: false,
			sessionDirForIndex: (idx?: number) => path.join(sessionRoot, `run-${idx ?? 0}`),
			artifactsDir: getArtifactsDir(parentSessionFile),
			artifactConfig: { ...DEFAULT_ARTIFACT_CONFIG } as ArtifactConfig,
		};
	};

	const openAgentManager = async (ctx: ExtensionContext) => {
		const agentData = { ...discoverAgentsAll(ctx.cwd), cwd: ctx.cwd };
		const models = ctx.modelRegistry.getAvailable().map((m) => ({
			provider: m.provider,
			id: m.id,
			fullId: `${m.provider}/${m.id}`,
		}));
		const skills = discoverAvailableSkills(ctx.cwd);

		const result = await ctx.ui.custom<ManagerResult>(
			(tui, theme, _kb, done) => new AgentManagerComponent(tui, theme, agentData, models, skills, done),
			{ overlay: true, overlayOptions: { anchor: "center", width: 84, maxHeight: "80%" } },
		);
		if (!result) return;

		// Ad-hoc chains from the overlay use direct execution for the chain-clarify TUI.
		// All other paths (single, saved-chain, parallel launches, slash commands)
		// route through sendToolCall → LLM → tool handler to get live progress.
		if (result.action === "chain") {
			const agents = discoverAgents(baseCwd, "both").agents;
			const exec = setupDirectRun(ctx);
			const chain: SequentialStep[] = result.agents.map((name, i) => ({
				agent: name,
				...(i === 0 ? { task: result.task } : {}),
			}));
			executeChain({ chain, task: result.task, agents, ctx, ...exec, clarify: true })
				.then((r) => {
					// User requested async via TUI - dispatch to async executor
					if (r.requestedAsync) {
						if (!isAsyncAvailable()) {
							pi.sendUserMessage("Background mode requires jiti for TypeScript execution but it could not be found.");
							return;
						}
						const id = randomUUID();
						const asyncCtx = { pi, cwd: ctx.cwd, currentSessionId: ctx.sessionManager.getSessionId() ?? id };
						const asyncSessionRoot = getSubagentSessionRoot(ctx.sessionManager.getSessionFile() ?? null);
						try {
							fs.mkdirSync(asyncSessionRoot, { recursive: true });
						} catch {}
						executeAsyncChain(id, {
							chain: r.requestedAsync.chain,
							agents,
							ctx: asyncCtx,
							maxOutput: undefined,
							artifactsDir: exec.artifactsDir,
							artifactConfig: exec.artifactConfig,
							shareEnabled: false,
							sessionRoot: asyncSessionRoot,
							chainSkills: r.requestedAsync.chainSkills,
						})
							.then((asyncResult) => {
								pi.sendUserMessage(asyncResult.content[0]?.text || "(launched in background)");
							})
							.catch((err) => {
								pi.sendUserMessage(`Async launch failed: ${err instanceof Error ? err.message : String(err)}`);
							});
						return;
					}
					pi.sendUserMessage(r.content[0]?.text || "(no output)");
				})
				.catch((err) => pi.sendUserMessage(`Chain failed: ${err instanceof Error ? err.message : String(err)}`));
			return;
		}

		const sendToolCall = (params: Record<string, unknown>) => {
			pi.sendUserMessage(
				`Call the subagent tool with these exact parameters: ${JSON.stringify({ ...params, agentScope: "both" })}`,
			);
		};

		if (result.action === "launch") {
			sendToolCall({ agent: result.agent, task: result.task, clarify: !result.skipClarify });
		} else if (result.action === "launch-chain") {
			const chainParam = result.chain.steps.map((step) => ({
				agent: step.agent,
				task: step.task || undefined,
				output: step.output,
				reads: step.reads,
				progress: step.progress,
				skill: step.skills,
				model: step.model,
			}));
			sendToolCall({ chain: chainParam, task: result.task, clarify: !result.skipClarify });
		} else if (result.action === "parallel") {
			sendToolCall({ tasks: result.tasks, clarify: !result.skipClarify });
		}
	};

	registerSubagentCommands(pi, {
		getBaseCwd: () => baseCwd,
		openAgentManager,
	});

	pi.registerShortcut("ctrl+shift+a", {
		handler: async (ctx) => {
			await openAgentManager(ctx);
		},
	});

	pi.events.on("subagent:started", (data) => {
		const info = data as {
			id?: string;
			asyncDir?: string;
			agent?: string;
			chain?: string[];
		};
		if (!info.id) return;
		const asyncDir = info.asyncDir ?? path.join(ASYNC_DIR, info.id);
		const agents = info.chain && info.chain.length > 0 ? info.chain : info.agent ? [info.agent] : undefined;
		const now = Date.now();
		asyncJobs.set(info.id, {
			asyncId: info.id,
			asyncDir,
			status: "queued",
			mode: info.chain ? "chain" : "single",
			agents,
			stepsTotal: agents?.length,
			startedAt: now,
			updatedAt: now,
		});
		if (lastUiContext) {
			runtimeMonitor.refreshWidget();
			runtimeMonitor.ensurePoller();
		}
	});

	pi.events.on("subagent:complete", (data) => {
		const result = data as { id?: string; success?: boolean; asyncDir?: string };
		const asyncId = result.id;
		if (!asyncId) return;
		const job = asyncJobs.get(asyncId);
		if (job) {
			job.status = result.success ? "complete" : "failed";
			job.updatedAt = Date.now();
			if (result.asyncDir) job.asyncDir = result.asyncDir;
		}
		if (lastUiContext) {
			runtimeMonitor.refreshWidget();
		}
		// Schedule cleanup after 10 seconds (track timer for cleanup on shutdown)
		const timer = setTimeout(() => {
			cleanupTimers.delete(asyncId);
			asyncJobs.delete(asyncId);
			if (lastUiContext) {
				runtimeMonitor.refreshWidget();
			}
		}, 10000);
		cleanupTimers.set(asyncId, timer);
	});

	pi.on("tool_result", (event, ctx) => {
		if (event.toolName !== "subagent") return;
		if (!ctx.hasUI) return;
		lastUiContext = ctx;
		if (asyncJobs.size > 0) {
			runtimeMonitor.refreshWidget();
			runtimeMonitor.ensurePoller();
		}
	});

	pi.events.on("oh-pi:safe-mode", (data) => {
		safeModeEnabled = Boolean((data as { enabled?: boolean } | undefined)?.enabled);
		if (lastUiContext?.hasUI) {
			runtimeMonitor.refreshWidget();
		}
	});

	let startupCleanupTimer: ReturnType<typeof setTimeout> | undefined;
	let startupGlobalCleanupCompleted = false;
	const runGlobalStartupCleanup = async (): Promise<void> => {
		if (startupGlobalCleanupCompleted) {
			return;
		}
		startupGlobalCleanupCompleted = true;
		await cleanupOldChainDirs();
		await cleanupAllArtifactDirs(DEFAULT_ARTIFACT_CONFIG.cleanupDays);
	};
	const cleanupSessionArtifacts = async (ctx: ExtensionContext): Promise<void> => {
		try {
			const sessionFile = ctx.sessionManager.getSessionFile();
			if (sessionFile) {
				await cleanupOldArtifacts(getArtifactsDir(sessionFile), DEFAULT_ARTIFACT_CONFIG.cleanupDays);
			}
		} catch {}
	};
	const cancelStartupCleanup = () => {
		if (!startupCleanupTimer) {
			return;
		}
		clearTimeout(startupCleanupTimer);
		startupCleanupTimer = undefined;
	};
	const scheduleStartupCleanup = (ctx: ExtensionContext) => {
		cancelStartupCleanup();
		startupCleanupTimer = setTimeout(() => {
			startupCleanupTimer = undefined;
			void (async () => {
				await runGlobalStartupCleanup();
				await cleanupSessionArtifacts(ctx);
			})();
		}, STARTUP_CLEANUP_DELAY_MS);
		startupCleanupTimer.unref?.();
	};
	const resetSessionState = (ctx: ExtensionContext, options: { deferArtifactCleanup?: boolean } = {}) => {
		baseCwd = ctx.cwd;
		currentSessionId =
			ctx.sessionManager.getSessionFile() ?? `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		if (options.deferArtifactCleanup) {
			scheduleStartupCleanup(ctx);
		} else {
			cancelStartupCleanup();
			void cleanupSessionArtifacts(ctx);
		}
		for (const timer of cleanupTimers.values()) clearTimeout(timer);
		cleanupTimers.clear();
		asyncJobs.clear();
		runtimeMonitor.clearResults();
		if (ctx.hasUI) {
			lastUiContext = ctx;
			renderWidget(ctx, []);
		}
	};

	pi.on("session_start", (_event, ctx) => {
		resetSessionState(ctx, { deferArtifactCleanup: true });
	});
	pi.on("session_switch", (_event, ctx) => {
		resetSessionState(ctx);
	});
	pi.on("session_branch", (_event, ctx) => {
		resetSessionState(ctx);
	});
	pi.on("session_shutdown", () => {
		cancelStartupCleanup();
		runtimeMonitor.stop();
		// Clear all pending cleanup timers
		for (const timer of cleanupTimers.values()) {
			clearTimeout(timer);
		}
		cleanupTimers.clear();
		asyncJobs.clear();
		runtimeMonitor.clearResults();
		if (lastUiContext?.hasUI) {
			lastUiContext.ui.setWidget(WIDGET_KEY, undefined);
		}
	});
}
