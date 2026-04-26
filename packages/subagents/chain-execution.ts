/**
 * Chain execution logic for subagent tool
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { AgentConfig } from "./agents.js";
import { ChainClarifyComponent } from "./chain-clarify.js";
import type { ChainClarifyResult, BehaviorOverride, ModelInfo } from "./chain-clarify.js";
import {
	resolveChainTemplates,
	createChainDir,
	removeChainDir,
	resolveStepBehavior,
	resolveParallelBehaviors,
	buildChainInstructions,
	createParallelDirs,
	aggregateParallelOutputs,
	isParallelStep,
} from "./settings.js";
import type { StepOverrides, ChainStep, SequentialStep, ParallelTaskResult, ResolvedTemplates } from "./settings.js";
import { discoverAvailableSkills, normalizeSkillInput } from "./skills.js";
import { runSync } from "./execution.js";
import { buildChainSummary } from "./formatters.js";
import { getFinalOutput, mapConcurrent } from "./utils.js";
import { recordRun } from "./run-history.js";
import { resolveSubagentModelResolution, toAvailableModelRefs } from "./model-routing.js";
import { MAX_CONCURRENCY } from "./types.js";
import type { AgentProgress, ArtifactConfig, ArtifactPaths, Details, SingleResult } from "./types.js";

/** Resolve a model name to its full provider/model format */
function resolveModelFullId(modelName: string | undefined, availableModels: ModelInfo[]): string | undefined {
	if (!modelName) {
		return undefined;
	}

	// Handle thinking level suffixes (e.g., "claude-sonnet-4-5:high")
	// Strip the suffix for lookup, then add it back
	const colonIdx = modelName.lastIndexOf(":");
	const baseModel = colonIdx !== -1 ? modelName.substring(0, colonIdx) : modelName;
	const thinkingSuffix = colonIdx !== -1 ? modelName.substring(colonIdx) : "";

	// Look up base model in available models to find provider
	const match = availableModels.find((m) => m.id === baseModel || m.fullId === baseModel);
	if (match) {
		return thinkingSuffix ? `${match.fullId}${thinkingSuffix}` : match.fullId;
	}

	return undefined;
}

export interface ChainExecutionParams {
	chain: ChainStep[];
	task?: string;
	agents: AgentConfig[];
	ctx: ExtensionContext;
	signal?: AbortSignal;
	runId: string;
	cwd?: string;
	shareEnabled: boolean;
	sessionDirForIndex: (idx?: number) => string | undefined;
	artifactsDir: string;
	artifactConfig: ArtifactConfig;
	includeProgress?: boolean;
	clarify?: boolean;
	onUpdate?: (r: AgentToolResult<Details>) => void;
	chainSkills?: string[];
	chainDir?: string;
}

export interface ChainExecutionResult {
	content: { type: "text"; text: string }[];
	details: Details;
	isError?: boolean;
	/** User requested async execution via TUI - caller should dispatch to executeAsyncChain */
	requestedAsync?: {
		chain: ChainStep[];
		chainSkills: string[];
	};
}

/**
 * Execute a chain of subagent steps
 */
export async function executeChain(params: ChainExecutionParams): Promise<ChainExecutionResult> {
	const {
		chain: chainSteps,
		agents,
		ctx,
		signal,
		runId,
		cwd,
		shareEnabled,
		sessionDirForIndex,
		artifactsDir,
		artifactConfig,
		includeProgress,
		clarify,
		onUpdate,
		chainSkills: chainSkillsParam,
		chainDir: chainDirBase,
	} = params;
	const chainSkills = chainSkillsParam ?? [];

	const allProgress: AgentProgress[] = [];
	const allArtifactPaths: ArtifactPaths[] = [];

	// Compute chain metadata for observability
	const chainAgents: string[] = chainSteps.map((step) =>
		isParallelStep(step) ? `[${step.parallel.map((t) => t.agent).join("+")}]` : (step as SequentialStep).agent,
	);
	const totalSteps = chainSteps.length;

	// Get original task from params or first step
	const firstStep = chainSteps[0]!;
	const originalTask =
		params.task ?? (isParallelStep(firstStep) ? firstStep.parallel[0]!.task! : (firstStep as SequentialStep).task!);

	// Create chain directory
	const chainDir = createChainDir(runId, chainDirBase);

	// Check if chain has any parallel steps
	const hasParallelSteps = chainSteps.some(isParallelStep);

	// Resolve templates (parallel-aware)
	let templates: ResolvedTemplates = resolveChainTemplates(chainSteps);

	// For TUI: only show if no parallel steps (TUI v1 doesn't support parallel display)
	const shouldClarify = clarify !== false && ctx.hasUI && !hasParallelSteps;

	// Behavior overrides from TUI (set if TUI is shown, undefined otherwise)
	let tuiBehaviorOverrides: (BehaviorOverride | undefined)[] | undefined;

	// Get available models for model resolution (used in TUI and execution)
	const availableModels: ModelInfo[] = toAvailableModelRefs(
		ctx.modelRegistry.getAvailable().map((model) => ({
			contextWindow: model.contextWindow,
			cost: model.cost ? { ...model.cost } : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			id: model.id,
			input: model.input ? [...model.input] : ["text"],
			maxTokens: model.maxTokens,
			name: model.name,
			provider: model.provider,
			reasoning: model.reasoning,
		})),
	);
	const availableSkills = discoverAvailableSkills(ctx.cwd);

	if (shouldClarify) {
		// Sequential-only chain: use existing TUI
		const seqSteps = chainSteps as SequentialStep[];

		// Load agent configs for sequential steps
		const agentConfigs: AgentConfig[] = [];
		for (const step of seqSteps) {
			const config = agents.find((a) => a.name === step.agent);
			if (!config) {
				removeChainDir(chainDir);
				return {
					content: [{ type: "text", text: `Unknown agent: ${step.agent}` }],
					details: { mode: "chain" as const, results: [] },
					isError: true,
				};
			}
			agentConfigs.push(config);
		}

		// Build step overrides
		const stepOverrides: StepOverrides[] = seqSteps.map((step) => ({
			model: step.model,
			output: step.output,
			progress: step.progress,
			reads: step.reads,
			skills: normalizeSkillInput(step.skill),
		}));

		// Pre-resolve behaviors for TUI display
		const resolvedBehaviors = agentConfigs.map((config, i) =>
			resolveStepBehavior(config, stepOverrides[i]!, chainSkills),
		);

		// Flatten templates for TUI (all strings for sequential)
		const flatTemplates = templates as string[];

		const result = await ctx.ui.custom<ChainClarifyResult>(
			(tui, theme, _kb, done) =>
				new ChainClarifyComponent(
					tui,
					theme,
					agentConfigs,
					flatTemplates,
					originalTask,
					chainDir,
					resolvedBehaviors,
					availableModels,
					availableSkills,
					done,
				),
			{
				overlay: true,
				overlayOptions: { anchor: "center", maxHeight: "80%", width: 84 },
			},
		);

		if (!result || !result.confirmed) {
			removeChainDir(chainDir);
			return {
				content: [{ text: "Chain cancelled", type: "text" }],
				details: { mode: "chain", results: [] },
			};
		}

		// User requested background execution - return early so caller can dispatch to async
		if (result.runInBackground) {
			removeChainDir(chainDir); // Will be recreated by async runner
			// Apply TUI edits (templates + behavior overrides) to chain steps
			const updatedChain = chainSteps.map((step, i) => {
				if (isParallelStep(step)) {
					return step;
				} // Parallel steps unchanged (TUI skipped for parallel chains)
				const override = result.behaviorOverrides[i];
				return {
					...step,
					task: result.templates[i] as string, // Always use edited template
					...(override?.model ? { model: override.model } : {}),
					...(override?.output !== undefined ? { output: override.output } : {}),
					...(override?.reads !== undefined ? { reads: override.reads } : {}),
					...(override?.progress !== undefined ? { progress: override.progress } : {}),
					...(override?.skills !== undefined ? { skill: override.skills } : {}),
				};
			});
			return {
				content: [{ text: "Launching in background...", type: "text" }],
				details: { mode: "chain", results: [] },
				requestedAsync: { chain: updatedChain as ChainStep[], chainSkills },
			};
		}

		// Update templates from TUI result
		({ templates } = result);
		// Store behavior overrides from TUI (used below in sequential step execution)
		tuiBehaviorOverrides = result.behaviorOverrides;
	}

	// Execute chain (handles both sequential and parallel steps)
	const results: SingleResult[] = [];
	let prev = "";
	let globalTaskIndex = 0; // For unique artifact naming
	let progressCreated = false; // Track if progress.md has been created

	for (let stepIndex = 0; stepIndex < chainSteps.length; stepIndex++) {
		const step = chainSteps[stepIndex]!;
		const stepTemplates = templates[stepIndex]!;

		if (isParallelStep(step)) {
			// === PARALLEL STEP EXECUTION ===
			const parallelTemplates = stepTemplates as string[];
			const concurrency = step.concurrency ?? MAX_CONCURRENCY;
			const failFast = step.failFast ?? false;

			// Create subdirectories for parallel outputs
			const agentNames = step.parallel.map((t) => t.agent);
			createParallelDirs(chainDir, stepIndex, step.parallel.length, agentNames);

			// Resolve behaviors for parallel tasks
			const parallelBehaviors = resolveParallelBehaviors(step.parallel, agents, stepIndex, chainSkills);

			// If any parallel task has progress enabled and progress.md hasn't been created,
			// Create it now to avoid race conditions
			const anyNeedsProgress = parallelBehaviors.some((b) => b.progress);
			if (anyNeedsProgress && !progressCreated) {
				const progressPath = path.join(chainDir, "progress.md");
				fs.writeFileSync(
					progressPath,
					"# Progress\n\n## Status\nIn Progress\n\n## Tasks\n\n## Files Changed\n\n## Notes\n",
				);
				progressCreated = true;
			}

			// Track if we should abort remaining tasks (for fail-fast)
			let aborted = false;

			// Execute parallel tasks
			const parallelResults = await mapConcurrent(step.parallel, concurrency, async (task, taskIndex) => {
				if (aborted && failFast) {
					// Return a placeholder for skipped tasks
					return {
						agent: task.agent,
						error: "Skipped due to fail-fast",
						exitCode: -1,
						messages: [],
						task: "(skipped)",
						usage: { cacheRead: 0, cacheWrite: 0, cost: 0, input: 0, output: 0, turns: 0 },
					} as SingleResult;
				}

				// Resolve behavior for this parallel task
				const behavior = parallelBehaviors[taskIndex]!;

				// Build chain instructions (prefix goes BEFORE task, suffix goes AFTER)
				const taskTemplate = parallelTemplates[taskIndex] ?? "{previous}";
				const templateHasPrevious = taskTemplate.includes("{previous}");
				const { prefix, suffix } = buildChainInstructions(
					behavior,
					chainDir,
					false, // Parallel tasks don't create progress (pre-created above)
					templateHasPrevious ? undefined : prev,
				);

				// Build task string with variable substitution
				let taskStr = taskTemplate;
				taskStr = taskStr.replaceAll(/\{task\}/g, originalTask);
				taskStr = taskStr.replaceAll(/\{previous\}/g, prev);
				taskStr = taskStr.replaceAll(/\{chain_dir\}/g, chainDir);
				const cleanTask = taskStr;

				// Assemble final task: prefix (READ/WRITE instructions) + task + suffix
				taskStr = prefix + taskStr + suffix;

				const taskAgentConfig = agents.find((a) => a.name === task.agent);
				const inheritedModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
				const explicitModel = task.model ? resolveModelFullId(task.model, availableModels) : undefined;
				const modelResolution = taskAgentConfig
					? resolveSubagentModelResolution(taskAgentConfig, availableModels, explicitModel, {
							currentModel: inheritedModel,
							taskText: taskStr,
						})
					: {
							model: explicitModel,
							source: explicitModel ? ("runtime-override" as const) : ("session-default" as const),
						};

				const r = await runSync(ctx.cwd, agents, task.agent, taskStr, {
					artifactConfig,
					artifactsDir: artifactConfig.enabled ? artifactsDir : undefined,
					cwd: task.cwd ?? cwd,
					index: globalTaskIndex + taskIndex,
					modelCategory: modelResolution.category,
					modelOverride: modelResolution.model,
					modelSource: modelResolution.source,
					onUpdate: onUpdate
						? (p) => {
								// Use concat instead of spread for better performance
								const stepResults = p.details?.results || [];
								const stepProgress = p.details?.progress || [];
								onUpdate({
									...p,
									details: {
										mode: "chain",
										results: results.concat(stepResults),
										progress: allProgress.concat(stepProgress),
										chainAgents,
										totalSteps,
										currentStepIndex: stepIndex,
									},
								});
							}
						: undefined,
					runId,
					sessionDir: sessionDirForIndex(globalTaskIndex + taskIndex),
					share: shareEnabled,
					signal,
					skills: behavior.skills === false ? [] : behavior.skills,
				});

				if (r.exitCode !== 0 && failFast) {
					aborted = true;
				}
				recordRun(task.agent, cleanTask, r.exitCode, r.progressSummary?.durationMs ?? 0);

				return r;
			});

			// Update global task index
			globalTaskIndex += step.parallel.length;

			// Collect results and progress
			for (const r of parallelResults) {
				results.push(r);
				if (r.progress) {
					allProgress.push(r.progress);
				}
				if (r.artifactPaths) {
					allArtifactPaths.push(r.artifactPaths);
				}
			}

			// Check for failures (track original task index for better error messages)
			const failures = parallelResults
				.map((r, originalIndex) => ({ ...r, originalIndex }))
				.filter((r) => r.exitCode !== 0 && r.exitCode !== -1);
			if (failures.length > 0) {
				const failureSummary = failures
					.map((f) => `- Task ${f.originalIndex + 1} (${f.agent}): ${f.error || "failed"}`)
					.join("\n");
				const errorMsg = `Parallel step ${stepIndex + 1} failed:\n${failureSummary}`;
				const summary = buildChainSummary(chainSteps, results, chainDir, "failed", {
					error: errorMsg,
					index: stepIndex,
				});
				return {
					content: [{ text: summary, type: "text" }],
					details: {
						artifacts: allArtifactPaths.length ? { dir: artifactsDir, files: allArtifactPaths } : undefined,
						chainAgents,
						currentStepIndex: stepIndex,
						mode: "chain",
						progress: includeProgress ? allProgress : undefined,
						results,
						totalSteps,
					},
					isError: true,
				};
			}

			// Aggregate outputs for {previous}
			const taskResults: ParallelTaskResult[] = parallelResults.map((r, i) => {
				const outputTarget = parallelBehaviors[i]?.output;
				const outputTargetPath =
					typeof outputTarget === "string"
						? path.isAbsolute(outputTarget)
							? outputTarget
							: path.join(chainDir, outputTarget)
						: undefined;
				return {
					agent: r.agent,
					error: r.error,
					exitCode: r.exitCode,
					output: getFinalOutput(r.messages),
					outputTargetExists: outputTargetPath ? fs.existsSync(outputTargetPath) : undefined,
					outputTargetPath,
					taskIndex: i,
				};
			});
			prev = aggregateParallelOutputs(taskResults);
		} else {
			// === SEQUENTIAL STEP EXECUTION ===
			const seqStep = step as SequentialStep;
			const stepTemplate = stepTemplates as string;

			// Get agent config
			const agentConfig = agents.find((a) => a.name === seqStep.agent);
			if (!agentConfig) {
				removeChainDir(chainDir);
				return {
					content: [{ type: "text", text: `Unknown agent: ${seqStep.agent}` }],
					details: { mode: "chain" as const, results: [] },
					isError: true,
				};
			}

			// Resolve behavior first (TUI overrides take precedence over step config)
			const tuiOverride = tuiBehaviorOverrides?.[stepIndex];
			const stepOverride: StepOverrides = {
				output: tuiOverride?.output !== undefined ? tuiOverride.output : seqStep.output,
				progress: tuiOverride?.progress !== undefined ? tuiOverride.progress : seqStep.progress,
				reads: tuiOverride?.reads !== undefined ? tuiOverride.reads : seqStep.reads,
				skills: tuiOverride?.skills !== undefined ? tuiOverride.skills : normalizeSkillInput(seqStep.skill),
			};
			const behavior = resolveStepBehavior(agentConfig, stepOverride, chainSkills);

			// Determine if this is the first agent to create progress.md
			const isFirstProgress = behavior.progress && !progressCreated;
			if (isFirstProgress) {
				progressCreated = true;
			}

			// Build chain instructions (prefix goes BEFORE task, suffix goes AFTER)
			const templateHasPrevious = stepTemplate.includes("{previous}");
			const { prefix, suffix } = buildChainInstructions(
				behavior,
				chainDir,
				isFirstProgress,
				templateHasPrevious ? undefined : prev,
			);

			// Build task string with variable substitution
			let stepTask = stepTemplate;
			stepTask = stepTask.replaceAll(/\{task\}/g, originalTask);
			stepTask = stepTask.replaceAll(/\{previous\}/g, prev);
			stepTask = stepTask.replaceAll(/\{chain_dir\}/g, chainDir);
			const cleanTask = stepTask;

			// Assemble final task: prefix (READ/WRITE instructions) + task + suffix (progress, previous summary)
			stepTask = prefix + stepTask + suffix;

			const inheritedModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
			const explicitModel =
				tuiOverride?.model ?? (seqStep.model ? resolveModelFullId(seqStep.model, availableModels) : undefined);
			const modelResolution = resolveSubagentModelResolution(agentConfig, availableModels, explicitModel, {
				currentModel: inheritedModel,
				taskText: stepTask,
			});

			// Run step
			const r = await runSync(ctx.cwd, agents, seqStep.agent, stepTask, {
				artifactConfig,
				artifactsDir: artifactConfig.enabled ? artifactsDir : undefined,
				cwd: seqStep.cwd ?? cwd,
				index: globalTaskIndex,
				modelCategory: modelResolution.category,
				modelOverride: modelResolution.model,
				modelSource: modelResolution.source,
				onUpdate: onUpdate
					? (p) => {
							// Use concat instead of spread for better performance
							const stepResults = p.details?.results || [];
							const stepProgress = p.details?.progress || [];
							onUpdate({
								...p,
								details: {
									mode: "chain",
									results: results.concat(stepResults),
									progress: allProgress.concat(stepProgress),
									chainAgents,
									totalSteps,
									currentStepIndex: stepIndex,
								},
							});
						}
					: undefined,
				runId,
				sessionDir: sessionDirForIndex(globalTaskIndex),
				share: shareEnabled,
				signal,
				skills: behavior.skills === false ? [] : behavior.skills,
			});
			recordRun(seqStep.agent, cleanTask, r.exitCode, r.progressSummary?.durationMs ?? 0);

			globalTaskIndex++;
			results.push(r);
			if (r.progress) {
				allProgress.push(r.progress);
			}
			if (r.artifactPaths) {
				allArtifactPaths.push(r.artifactPaths);
			}

			// Validate expected output file was created
			if (behavior.output && r.exitCode === 0) {
				try {
					const expectedPath = path.isAbsolute(behavior.output)
						? behavior.output
						: path.join(chainDir, behavior.output);
					if (!fs.existsSync(expectedPath)) {
						// Look for similar files that might have been created instead
						const dirFiles = fs.readdirSync(chainDir);
						const mdFiles = dirFiles.filter((f) => f.endsWith(".md") && f !== "progress.md");
						const warning =
							mdFiles.length > 0
								? `Agent wrote to different file(s): ${mdFiles.join(", ")} instead of ${behavior.output}`
								: `Agent did not create expected output file: ${behavior.output}`;
						// Add warning to result but don't fail
						r.error = r.error ? `${r.error}\n[!] ${warning}` : `[!] ${warning}`;
					}
				} catch {
					// Ignore validation errors - this is just a diagnostic
				}
			}

			// On failure, leave chain_dir for debugging
			if (r.exitCode !== 0) {
				const summary = buildChainSummary(chainSteps, results, chainDir, "failed", {
					error: r.error || "Chain failed",
					index: stepIndex,
				});
				return {
					content: [{ text: summary, type: "text" }],
					details: {
						artifacts: allArtifactPaths.length ? { dir: artifactsDir, files: allArtifactPaths } : undefined,
						chainAgents,
						currentStepIndex: stepIndex,
						mode: "chain",
						progress: includeProgress ? allProgress : undefined,
						results,
						totalSteps,
					},
					isError: true,
				};
			}

			prev = getFinalOutput(r.messages);
		}
	}

	// Chain complete - return summary with paths
	// Chain dir left for inspection (cleaned up after 24h)
	const summary = buildChainSummary(chainSteps, results, chainDir, "completed");

	return {
		content: [{ text: summary, type: "text" }],
		details: {
			artifacts: allArtifactPaths.length ? { dir: artifactsDir, files: allArtifactPaths } : undefined,
			chainAgents,
			mode: "chain",
			progress: includeProgress ? allProgress : undefined,
			results,
			totalSteps,
			// CurrentStepIndex omitted for completed chains
		},
	};
}
