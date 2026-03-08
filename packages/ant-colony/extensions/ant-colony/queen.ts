/**
 * Queen — Colony scheduling core.
 *
 * Lifecycle:
 * 1. Receive goal → dispatch scouts
 * 2. Scouts return → generate task pool from discoveries
 * 3. Adaptively dispatch workers to execute tasks
 * 4. Tasks complete → dispatch soldiers to review
 * 5. Issues found → generate fix tasks, return to step 3
 * 6. All pass → generate summary report
 *
 * The scheduling loop models real ant colonies: ants leave nest → forage → return → leave again.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import {
	applyConcurrencyCap,
	type BudgetPlan,
	buildBudgetPromptSection,
	planBudget,
	type UsageLimitsEvent,
} from "./budget-planner.js";
import { adapt, defaultConcurrency, sampleSystem } from "./concurrency.js";
import { buildImportGraph, type ImportGraph, taskDependsOn } from "./deps.js";
import { Nest } from "./nest.js";
import { makePheromoneId, makeTaskId, resetAntCounter, runDrone, spawnAnt } from "./spawner.js";
import type {
	Ant,
	AntCaste,
	AntStreamEvent,
	ColonyMetrics,
	ColonySignal,
	ColonyState,
	ModelOverrides,
	Task,
	TaskPriority,
} from "./types.js";
import { DEFAULT_ANT_CONFIGS } from "./types.js";

export interface QueenCallbacks {
	/** Abstract signal — the only callback observers need to implement. */
	onSignal?(signal: ColonySignal): void;
	/** Fine-grained callbacks below (verbose mode, optional). */
	onPhase?(phase: ColonyState["status"], detail: string): void;
	onAntSpawn?(ant: Ant, task: Task): void;
	onAntDone?(ant: Ant, task: Task, output: string): void;
	onAntStream?(event: AntStreamEvent): void;
	onProgress?(metrics: ColonyMetrics): void;
	onComplete?(state: ColonyState): void;
}

/** Event emitter interface for inter-extension communication. */
export interface ColonyEventBus {
	emit(event: string, data?: unknown): void;
	on(event: string, handler: (data: unknown) => void): void;
	/** Optional in some pi runtimes (older event emitters may not expose `off`). */
	off?(event: string, handler: (data: unknown) => void): void;
}

export interface QueenOptions {
	cwd: string;
	goal: string;
	maxAnts?: number;
	maxCost?: number;
	currentModel: string;
	modelOverrides?: ModelOverrides;
	signal?: AbortSignal;
	callbacks: QueenCallbacks;
	authStorage?: AuthStorage;
	modelRegistry?: ModelRegistry;
	/** Event bus for cross-extension communication (usage-tracker integration). */
	eventBus?: ColonyEventBus;
}

function makeColonyId(): string {
	return `colony-${Date.now().toString(36)}`;
}

interface UsageLimitsTracker {
	requestSnapshot(): UsageLimitsEvent | null;
	dispose(): void;
}

/**
 * Query usage limits from usage-tracker through the shared event bus.
 * Supports runtimes where the event bus only exposes `on/emit` (no `off`).
 */
export function createUsageLimitsTracker(eventBus?: ColonyEventBus): UsageLimitsTracker {
	if (!eventBus) {
		return {
			requestSnapshot: () => null,
			dispose: () => undefined,
		};
	}

	let latestLimits: UsageLimitsEvent | null = null;
	let subscribed = false;
	const handler = (data: unknown) => {
		latestLimits = data as UsageLimitsEvent;
	};

	const subscribeIfNeeded = () => {
		if (subscribed) {
			return;
		}
		eventBus.on("usage:limits", handler);
		subscribed = true;
	};

	return {
		requestSnapshot() {
			subscribeIfNeeded();
			eventBus.emit("usage:query");
			return latestLimits;
		},
		dispose() {
			if (subscribed && typeof eventBus.off === "function") {
				eventBus.off("usage:limits", handler);
			}
			subscribed = false;
		},
	};
}

function makeInitialScoutTask(goal: string): Task {
	return {
		id: makeTaskId(),
		parentId: null,
		title: "Scout: explore codebase for goal",
		description: `Explore the codebase and identify all files, modules, and dependencies relevant to this goal:\n\n${goal}\n\nBe thorough. The colony depends on your intelligence.`,
		caste: "scout",
		status: "pending",
		priority: 1,
		files: [],
		claimedBy: null,
		result: null,
		error: null,
		spawnedTasks: [],
		createdAt: Date.now(),
		startedAt: null,
		finishedAt: null,
	};
}

function childTaskFromParsed(
	parentId: string,
	parsed: {
		title: string;
		description: string;
		files: string[];
		caste: AntCaste;
		priority: TaskPriority;
		context?: string;
	},
): Task {
	return {
		id: makeTaskId(),
		parentId,
		title: parsed.title,
		description: parsed.description,
		caste: parsed.caste,
		status: "pending",
		priority: parsed.priority,
		files: parsed.files,
		context: parsed.context || undefined,
		claimedBy: null,
		result: null,
		error: null,
		spawnedTasks: [],
		createdAt: Date.now(),
		startedAt: null,
		finishedAt: null,
	};
}

/**
 * Bio 5: Colony voting — merge duplicate tasks from multiple scouts.
 * Tasks with identical file sets are merged; tasks mentioned by multiple scouts get boosted priority.
 */
export function quorumMergeTasks(nest: Nest): void {
	const tasks = nest
		.getAllTasks()
		.filter((t) => (t.caste === "worker" || t.caste === "drone") && t.status === "pending");
	if (tasks.length < 2) {
		return;
	}

	// Group by file set (sorted and joined as key)
	const groups = new Map<string, Task[]>();
	for (const t of tasks) {
		const key = [...t.files].sort().join("|") || t.title;
		const arr = groups.get(key) ?? [];
		arr.push(t);
		groups.set(key, arr);
	}

	for (const [, group] of groups) {
		if (group.length < 2) {
			continue;
		}
		// Keep the first, remove duplicates, merge descriptions
		const keeper = group[0];
		// Quorum reached: mentioned by multiple scouts → priority boost
		keeper.priority = Math.max(1, keeper.priority - 1) as 1 | 2 | 3 | 4 | 5;
		// Merge other tasks' context into the keeper
		for (let i = 1; i < group.length; i++) {
			const dup = group[i];
			if (dup.context && dup.context !== keeper.context) {
				keeper.context = `${keeper.context || ""}\n\n--- Additional scout context ---\n${dup.context}`;
			}
			// Mark duplicate task as done (merged)
			nest.updateTaskStatus(dup.id, "done", `Merged into ${keeper.id} (quorum)`);
		}
		nest.writeTask(keeper);
	}
}

export interface PlanValidation {
	ok: boolean;
	issues: string[];
	warnings: string[];
}

export function shouldUseScoutQuorum(goal: string): boolean {
	// Multi-step/compound goals benefit from at least 2 scout votes
	return /(\n\s*\d+[.)]|[;；]| and |以及|并且|同时|步骤|phase|then|之后)/i.test(goal);
}

export function validateExecutionPlan(tasks: Task[]): PlanValidation {
	const issues: string[] = [];
	const warnings: string[] = [];

	if (tasks.length === 0) {
		issues.push("no_pending_worker_tasks");
		return { ok: false, issues, warnings };
	}

	for (const t of tasks) {
		if (!t.title?.trim()) {
			issues.push(`task:${t.id}:missing_title`);
		}
		if (!t.description?.trim()) {
			issues.push(`task:${t.id}:missing_description`);
		}
		if (t.caste !== "worker" && t.caste !== "drone") {
			issues.push(`task:${t.id}:invalid_caste:${t.caste}`);
		}
		if (t.priority < 1 || t.priority > 5) {
			issues.push(`task:${t.id}:invalid_priority:${t.priority}`);
		}
		if (t.files.length === 0) {
			warnings.push(`task:${t.id}:broad_scope`);
		}
	}

	return { ok: issues.length === 0, issues, warnings };
}

function collectScoutIntelligence(nest: Nest, maxChars = 6000): string {
	const scoutResults = nest
		.getAllTasks()
		.filter((t) => t.caste === "scout" && t.status === "done" && t.result)
		.map((t) => `## ${t.title}\n${t.result}`)
		.join("\n\n");
	return scoutResults.slice(0, maxChars);
}

function makeRecoveryScoutTask(goal: string, attempt: number, planIssues: string[], intel: string): Task {
	const issueText =
		planIssues.length > 0 ? planIssues.map((i) => `- ${i}`).join("\n") : "- no parseable worker/drone tasks generated";
	return {
		id: makeTaskId(),
		parentId: null,
		title: `Scout recovery ${attempt}: structure executable plan`,
		description: [
			"Previous scout output could not pass plan validation.",
			"Transform existing intelligence into a VALID structured execution plan.",
			"",
			"Goal:",
			goal,
			"",
			"Validation issues:",
			issueText,
			"",
			"Intelligence from prior scouts:",
			intel || "(none)",
			"",
			"Output requirements (STRICT):",
			"- Return at least ONE task block",
			"### TASK: <title>",
			"- description: <what to do>",
			"- files: <comma-separated file paths>",
			"- caste: worker",
			"- priority: <1-5>",
			"",
			"Do NOT execute changes. Only planning.",
		].join("\n"),
		caste: "scout",
		status: "pending",
		priority: 1,
		files: [],
		claimedBy: null,
		result: null,
		error: null,
		spawnedTasks: [],
		createdAt: Date.now(),
		startedAt: null,
		finishedAt: null,
	};
}

function makeReviewTask(completedTasks: Task[]): Task {
	const files = [...new Set(completedTasks.flatMap((t) => t.files))];
	return {
		id: makeTaskId(),
		parentId: null,
		title: "Soldier: review all changes",
		description: `Review all changes made by worker ants. Files changed:\n${files.map((f) => `- ${f}`).join("\n")}`,
		caste: "soldier",
		status: "pending",
		priority: 1,
		files,
		claimedBy: null,
		result: null,
		error: null,
		spawnedTasks: [],
		createdAt: Date.now(),
		startedAt: null,
		finishedAt: null,
	};
}

function updateMetrics(nest: Nest): ColonyMetrics {
	const state = nest.getStateLight();
	const tasks = state.tasks;
	const now = Date.now();
	const elapsed = (now - state.metrics.startTime) / 60000; // minutes

	const metrics: ColonyMetrics = {
		tasksTotal: tasks.length,
		tasksDone: tasks.filter((t) => t.status === "done").length,
		tasksFailed: tasks.filter((t) => t.status === "failed").length,
		antsSpawned: state.ants.length,
		totalCost: state.ants.reduce((s, a) => s + a.usage.cost, 0),
		totalTokens: state.ants.reduce((s, a) => s + a.usage.input + a.usage.output, 0),
		startTime: state.metrics.startTime,
		throughputHistory: [
			...state.metrics.throughputHistory,
			elapsed > 0 ? tasks.filter((t) => t.status === "done").length / elapsed : 0,
		].slice(-20),
	};

	nest.updateState({ metrics });
	return metrics;
}

interface WaveOptions {
	nest: Nest;
	cwd: string;
	caste: AntCaste;
	currentModel: string;
	modelOverrides?: ModelOverrides;
	signal?: AbortSignal;
	callbacks: QueenCallbacks;
	emitSignal: (phase: ColonyState["status"], message: string) => void;
	authStorage?: AuthStorage;
	modelRegistry?: ModelRegistry;
	importGraph?: ImportGraph;
	/** Budget plan from the usage-aware planner (may be null if no data available). */
	budgetPlan?: BudgetPlan | null;
}

/**
 * Bio 6: Corpse cleanup — error pattern classification.
 */
export function classifyError(errStr: string): string {
	if (errStr.includes("TypeError") || errStr.includes("type") || errStr.includes("TS")) {
		return "type_error";
	}
	if (errStr.includes("permission") || errStr.includes("401") || errStr.includes("EACCES")) {
		return "permission";
	}
	if (errStr.includes("timeout") || errStr.includes("Timeout") || errStr.includes("ETIMEDOUT")) {
		return "timeout";
	}
	if (errStr.includes("ENOENT") || errStr.includes("not found") || errStr.includes("Cannot find")) {
		return "not_found";
	}
	if (errStr.includes("syntax") || errStr.includes("SyntaxError") || errStr.includes("Unexpected")) {
		return "syntax";
	}
	if (errStr.includes("429") || errStr.includes("rate limit")) {
		return "rate_limit";
	}
	return "unknown";
}

/**
 * Execute a wave of ants concurrently with adaptive concurrency control.
 * Manages rate limiting, error recovery, file locking, and budget enforcement.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Wave scheduler coordinates retries, budgets, and parallelism.
async function runAntWave(opts: WaveOptions): Promise<"ok" | "budget"> {
	const { nest, cwd, caste, signal, callbacks, currentModel, emitSignal } = opts;
	const casteModel = opts.modelOverrides?.[caste] || currentModel;
	const baseConfig = { ...DEFAULT_ANT_CONFIGS[caste], model: casteModel };

	// Budget-aware turn cap: if the budget planner recommends fewer turns, use that
	if (opts.budgetPlan) {
		const casteBudget = opts.budgetPlan.castes[caste];
		if (casteBudget && casteBudget.maxTurns < baseConfig.maxTurns) {
			baseConfig.maxTurns = casteBudget.maxTurns;
		}
	}

	let backoffMs = 0; // 429 backoff duration
	let consecutiveRateLimits = 0; // Consecutive rate limit counter
	const retryCount = new Map<string, number>(); // taskId → retry count
	const MAX_RETRIES = 2;

	// Bio 6: Corpse cleanup — error pattern tracking
	const errorPatterns = new Map<string, { count: number; files: Set<string>; errors: string[] }>();

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Single-ant dispatch path handles many failure and retry modes.
	const runOne = async (): Promise<"done" | "empty" | "rate_limited" | "budget"> => {
		// Budget brake: don't dispatch if budget exhausted (drones are free, skip check)
		const state = nest.getStateLight();
		if (state.maxCost != null && caste !== "drone") {
			const spent = state.ants.reduce((s, a) => s + a.usage.cost, 0);
			if (spent >= state.maxCost) {
				return "budget";
			}

			// Bio 4: Nest temperature — progressive cost control
			const temperature = spent / state.maxCost;
			if (temperature > 0.9) {
				// Emergency mode: only run priority 1 tasks
				const pending = state.tasks.filter((t) => t.status === "pending" && t.caste === caste);
				if (!pending.some((t) => t.priority === 1)) {
					return "budget";
				}
			}
		}

		const task = nest.claimNextTask(caste, "queen");
		if (!task) {
			return "empty";
		}

		const ant: Ant = {
			id: "",
			caste,
			status: "idle",
			taskId: task.id,
			pid: null,
			model: casteModel,
			usage: { input: 0, output: 0, cost: 0, turns: 0 },
			startedAt: Date.now(),
			finishedAt: null,
		};
		callbacks.onAntSpawn?.(ant, task);

		try {
			const ANT_TIMEOUT = 5 * 60 * 1000; // 5 min hard timeout per ant
			const antAbort = new AbortController();
			signal?.addEventListener("abort", () => antAbort.abort(), { once: true });
			const antSignal = antAbort.signal;
			// Bio 7: Age polymorphism — conservative early, convergent late
			const progress = state.metrics.tasksTotal > 0 ? state.metrics.tasksDone / state.metrics.tasksTotal : 0;
			const config = { ...baseConfig };
			if (progress < 0.3) {
				config.maxTurns = Math.max(baseConfig.maxTurns - 3, 5); // Conservative early phase
			} else if (progress > 0.7) {
				config.maxTurns = Math.max(baseConfig.maxTurns - 5, 5); // Late convergence, only cleanup/fixes
			}
			// Build budget-awareness prompt section for non-drone ants
			const budgetSection = opts.budgetPlan ? buildBudgetPromptSection(opts.budgetPlan) : undefined;
			const antPromise =
				caste === "drone"
					? runDrone(cwd, nest, task)
					: spawnAnt(
							cwd,
							nest,
							task,
							config,
							antSignal,
							callbacks.onAntStream,
							opts.authStorage,
							opts.modelRegistry,
							budgetSection,
						);
			let timeoutId: ReturnType<typeof setTimeout>;
			const result = await Promise.race([
				antPromise.finally(() => clearTimeout(timeoutId)),
				new Promise<never>((_, reject) => {
					timeoutId = setTimeout(() => {
						antAbort.abort();
						reject(new Error("Ant timeout (5min)"));
					}, ANT_TIMEOUT);
				}),
			]);
			callbacks.onAntDone?.(result.ant, task, result.output);

			if (result.rateLimited) {
				return "rate_limited";
			}

			// Cost warning: signal when >80% of budget is spent
			const curState = nest.getStateLight();
			if (curState.maxCost != null) {
				const spent = curState.ants.reduce((s, a) => s + a.usage.cost, 0);
				if (spent >= curState.maxCost * 0.8) {
					emitSignal("working", `Budget warning: ${((spent / curState.maxCost) * 100).toFixed(0)}% used`);
				}
			}

			// Add ant-spawned sub-tasks to nest (cap reproduction to prevent task explosion)
			// Bio 7: Age polymorphism — limit sub-task generation in late phase
			const m = curState.metrics;
			const colonyProgress = m.tasksTotal > 0 ? m.tasksDone / m.tasksTotal : 0;
			const MAX_TOTAL_TASKS = 30;
			const MAX_SUB_PER_TASK = colonyProgress > 0.7 ? 2 : 5; // Converge late
			const accepted = result.newTasks.slice(0, MAX_SUB_PER_TASK);
			for (const sub of accepted) {
				if (nest.getAllTasks().length >= MAX_TOTAL_TASKS) {
					break;
				}
				// Check for file lock conflicts and dependency conflicts
				const allTasks = nest.getAllTasks();
				const conflicting = allTasks.find(
					(t) =>
						t.status === "active" &&
						(t.files.some((f) => sub.files.includes(f)) ||
							(opts.importGraph && taskDependsOn(sub.files, t.files, opts.importGraph))),
				);
				const child = childTaskFromParsed(task.id, sub);
				if (conflicting) {
					child.status = "blocked";
				}
				nest.addSubTask(task.id, child);
			}

			// Path reinforcement: successful completion releases pheromone proportional to task scope (recruitment signal)
			if (task.files.length > 0) {
				const recruitStrength = Math.min(1.0, 0.5 + task.files.length * 0.1 + result.newTasks.length * 0.15);
				nest.dropPheromone({
					id: makePheromoneId(),
					type: "completion",
					antId: result.ant.id,
					antCaste: caste,
					taskId: task.id,
					content: `Success: ${task.title}`,
					files: task.files,
					strength: recruitStrength,
					createdAt: Date.now(),
				});
			}

			// Update metrics
			const metrics = updateMetrics(nest);
			callbacks.onProgress?.(metrics);
			emitSignal("working", `${metrics.tasksDone}/${metrics.tasksTotal} tasks done`);

			return "done";
		} catch (e) {
			const errStr = String(e);
			const isRetryable =
				errStr.includes("timeout") ||
				errStr.includes("Timeout") ||
				errStr.includes("ECONNRESET") ||
				errStr.includes("429");
			const count = retryCount.get(task.id) ?? 0;
			if (isRetryable && count < MAX_RETRIES) {
				retryCount.set(task.id, count + 1);
				nest.updateTaskStatus(task.id, "pending");
			} else {
				// Negative pheromone: failed task releases warning proportional to task scope
				if (task.files.length > 0) {
					const warnStrength = Math.min(1.0, 0.5 + task.files.length * 0.1);
					nest.dropPheromone({
						id: makePheromoneId(),
						type: "warning",
						antId: "queen",
						antCaste: caste,
						taskId: task.id,
						content: `Failed: ${task.title} — ${String(e).slice(0, 100)}`,
						files: task.files,
						strength: warnStrength,
						createdAt: Date.now(),
					});
				}
				nest.updateTaskStatus(task.id, "failed", undefined, String(e));

				// Bio 6: Corpse cleanup — error pattern tracking + diagnostic task
				const pattern = classifyError(errStr);
				const entry = errorPatterns.get(pattern) ?? { count: 0, files: new Set<string>(), errors: [] };
				entry.count++;
				for (const f of task.files) {
					entry.files.add(f);
				}
				entry.errors.push(errStr.slice(0, 200));
				errorPatterns.set(pattern, entry);

				if (entry.count >= 2 && entry.files.size > 0) {
					const affectedFiles = [...entry.files];
					// Release repellent pheromone
					nest.dropPheromone({
						id: makePheromoneId(),
						type: "repellent",
						antId: "queen",
						antCaste: caste,
						taskId: task.id,
						content: `Recurring ${pattern} errors (${entry.count}x): ${entry.errors[0]?.slice(0, 80)}`,
						files: affectedFiles,
						strength: 1.0,
						createdAt: Date.now(),
					});
					// Generate diagnostic task (first occurrence only)
					if (entry.count === 2 && nest.getAllTasks().length < 30) {
						const diagTask: Task = {
							id: makeTaskId(),
							parentId: null,
							title: `Diagnose recurring ${pattern} errors`,
							description: `Multiple ants failed with ${pattern} errors on these files:\n${affectedFiles.map((f) => `- ${f}`).join("\n")}\n\nErrors:\n${entry.errors.map((e) => `- ${e}`).join("\n")}\n\nInvestigate root cause and generate fix tasks.`,
							caste: "scout",
							status: "pending",
							priority: 1,
							files: affectedFiles,
							claimedBy: null,
							result: null,
							error: null,
							spawnedTasks: [],
							createdAt: Date.now(),
							startedAt: null,
							finishedAt: null,
						};
						nest.writeTask(diagTask);
						emitSignal("working", `Diagnosing recurring ${pattern} errors...`);
					}
				}
			}
			return "done";
		}
	};

	// Scheduling loop: keep dispatching ants until no pending tasks remain
	let lastSampleTime = 0;
	while (!signal?.aborted) {
		const state = nest.getStateLight();
		const pending = state.tasks.filter((t) => t.status === "pending" && t.caste === caste);
		if (pending.length === 0) {
			break;
		}

		// 429 backoff: wait briefly then resume; consecutive limits extend the wait
		if (backoffMs > 0) {
			callbacks.onPhase?.("working", `Rate limited (429). Waiting ${Math.round(backoffMs / 1000)}s...`);
			await new Promise((r) => setTimeout(r, backoffMs));
		}

		// Unblock tasks if their locked files and dependency files have been released
		const activeTasks = state.tasks.filter((t) => t.status === "active" || t.status === "claimed");
		const activeFiles = new Set(activeTasks.flatMap((t) => t.files));
		for (const t of state.tasks.filter((t) => t.status === "blocked" && t.caste === caste)) {
			const fileConflict = t.files.some((f) => activeFiles.has(f));
			const depConflict =
				opts.importGraph && activeTasks.some((at) => taskDependsOn(t.files, at.files, opts.importGraph!));
			if (!(fileConflict || depConflict)) {
				nest.updateTaskStatus(t.id, "pending");
			}
		}

		// Adaptive concurrency (sample every 2000ms)
		const now = Date.now();
		if (now - lastSampleTime >= 2000) {
			lastSampleTime = now;
			const completedRecently = state.tasks.filter(
				(t) => t.status === "done" && t.finishedAt && t.finishedAt > now - 120000,
			).length;
			const sample = sampleSystem(state.ants.filter((a) => a.status === "working").length, completedRecently, 2);
			nest.recordSample(sample);
		}

		let concurrency = adapt(state.concurrency, pending.length);
		// Apply budget-aware concurrency cap (rate limits / cost constraints)
		if (opts.budgetPlan) {
			concurrency = applyConcurrencyCap(concurrency, opts.budgetPlan);
		}
		nest.updateState({ concurrency });

		// Dispatch ants (concurrency determined by adapt())
		const activeAnts = state.ants.filter((a) => a.status === "working").length;
		const slotsAvailable = Math.max(0, concurrency.current - activeAnts);

		if (slotsAvailable === 0) {
			// Wait briefly before re-checking
			await new Promise((r) => setTimeout(r, 500));
			continue;
		}

		const batch = Math.min(slotsAvailable, pending.length);
		const promises: Promise<"done" | "empty" | "rate_limited" | "budget">[] = [];
		for (let i = 0; i < batch; i++) {
			promises.push(runOne());
		}
		const results = await Promise.all(promises);

		if (results.includes("budget")) {
			return "budget";
		}

		// 429 handling: reduce concurrency + progressive backoff (2s→5s→10s cap) + record timestamp
		if (results.includes("rate_limited")) {
			consecutiveRateLimits++;
			const cur = nest.getStateLight().concurrency;
			const reduced = Math.max(cur.min, cur.current - 1); // Reduce by 1, don't halve
			nest.updateState({ concurrency: { ...cur, current: reduced, lastRateLimitAt: Date.now() } });
			backoffMs = Math.min(consecutiveRateLimits * 2000, 10000);
		} else {
			consecutiveRateLimits = 0;
			backoffMs = 0;
		}
	}
	return "ok";
}

/**
 * Queen main loop — orchestrates the full colony lifecycle:
 * scouting → plan validation → working → reviewing → done/failed.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Top-level colony lifecycle orchestration across phases.
export async function runColony(opts: QueenOptions): Promise<ColonyState> {
	if (!opts.goal?.trim()) {
		throw new Error("Colony goal is empty or undefined. Please provide a clear goal.");
	}
	resetAntCounter();
	const colonyId = makeColonyId();
	const nest = new Nest(opts.cwd, colonyId);

	const initialState: ColonyState = {
		id: colonyId,
		goal: opts.goal,
		status: "scouting",
		tasks: [makeInitialScoutTask(opts.goal)],
		ants: [],
		pheromones: [],
		concurrency: defaultConcurrency(),
		metrics: {
			tasksTotal: 1,
			tasksDone: 0,
			tasksFailed: 0,
			antsSpawned: 0,
			totalCost: 0,
			totalTokens: 0,
			startTime: Date.now(),
			throughputHistory: [],
		},
		maxCost: opts.maxCost ?? null,
		modelOverrides: {},
		createdAt: Date.now(),
		finishedAt: null,
	};

	if (opts.maxAnts) {
		initialState.concurrency.max = opts.maxAnts;
	}

	nest.init(initialState);
	const { signal, callbacks } = opts;

	const cleanup = () => {
		nest.destroy();
		const parentDir = path.join(opts.cwd, ".ant-colony");
		try {
			const entries = fs.readdirSync(parentDir);
			if (entries.length === 0) {
				fs.rmdirSync(parentDir);
			}
		} catch {
			/* ignore */
		}
	};

	const emitSignal = (phase: ColonyState["status"], message: string) => {
		const state = nest.getStateLight();
		const m = state.metrics;
		const active = state.ants.filter((a) => a.status === "working").length;
		const progress = m.tasksTotal > 0 ? m.tasksDone / m.tasksTotal : 0;
		callbacks.onSignal?.({ phase, progress, active, cost: m.totalCost, message });
	};

	const waveBase: Omit<WaveOptions, "caste"> & { importGraph?: ImportGraph } = {
		nest,
		cwd: opts.cwd,
		signal,
		callbacks,
		emitSignal,
		currentModel: opts.currentModel,
		modelOverrides: opts.modelOverrides,
		authStorage: opts.authStorage,
		modelRegistry: opts.modelRegistry,
	};

	// ═══ Usage-aware budget planning ═══
	// Query usage-tracker for rate limit / cost data via the event bus.
	const usageLimitsTracker = createUsageLimitsTracker(opts.eventBus);
	const refreshBudgetPlan = (): BudgetPlan | null => {
		const latestLimits = usageLimitsTracker.requestSnapshot();
		const state = nest.getStateLight();
		return planBudget(latestLimits, state.metrics, opts.maxCost ?? null, state.concurrency);
	};

	try {
		// Initial budget plan
		waveBase.budgetPlan = refreshBudgetPlan();

		// ═══ Phase 1: Scouting (Bio 5: Colony voting — complex goals get multiple scouts) ═══
		const scoutCountBase = opts.goal.length > 500 ? 3 : opts.goal.length > 200 ? 2 : 1;
		const scoutCount = shouldUseScoutQuorum(opts.goal) ? Math.max(2, scoutCountBase) : scoutCountBase;
		if (scoutCount > 1) {
			// Multiple scouts in parallel: create independent tasks for each scout
			for (let i = 1; i < scoutCount; i++) {
				const extraScout: Task = {
					id: makeTaskId(),
					parentId: null,
					title: `Scout ${i + 1}: explore codebase for goal`,
					description: `Explore the codebase from a different angle and identify files, modules, and dependencies relevant to this goal:\n\n${opts.goal}\n\nFocus on areas other scouts might miss. Be thorough.`,
					caste: "scout",
					status: "pending",
					priority: 1,
					files: [],
					claimedBy: null,
					result: null,
					error: null,
					spawnedTasks: [],
					createdAt: Date.now(),
					startedAt: null,
					finishedAt: null,
				};
				nest.writeTask(extraScout);
			}
		}
		callbacks.onPhase?.("scouting", `Dispatching ${scoutCount} scout ant(s) to explore codebase...`);
		emitSignal("scouting", `${scoutCount} scouts exploring...`);
		await runAntWave({ ...waveBase, caste: "scout" });

		// Bio 5: Merge duplicate tasks from multiple scouts
		if (scoutCount > 1) {
			quorumMergeTasks(nest);
		}

		const getPendingExecutionTasks = () =>
			nest.getAllTasks().filter((t) => (t.caste === "worker" || t.caste === "drone") && t.status === "pending");

		let workerTasks = getPendingExecutionTasks();
		let plan = validateExecutionPlan(workerTasks);

		// Plan recovery loop: when scout output isn't executable, don't create workers directly — let scouts restructure
		const MAX_PLAN_RECOVERY_ROUNDS = 2;
		let recoveryRound = 0;
		while (!plan.ok && recoveryRound < MAX_PLAN_RECOVERY_ROUNDS) {
			recoveryRound++;
			nest.updateState({ status: "planning_recovery" });

			const intel = collectScoutIntelligence(nest);
			const recoveryTask = makeRecoveryScoutTask(opts.goal, recoveryRound, plan.issues, intel);
			nest.writeTask(recoveryTask);

			callbacks.onPhase?.(
				"planning_recovery",
				`Plan recovery ${recoveryRound}/${MAX_PLAN_RECOVERY_ROUNDS}: restructuring scout intelligence...`,
			);
			emitSignal("planning_recovery", `Recovering plan (${recoveryRound}/${MAX_PLAN_RECOVERY_ROUNDS})`);
			await runAntWave({ ...waveBase, caste: "scout" });
			quorumMergeTasks(nest);

			workerTasks = getPendingExecutionTasks();
			plan = validateExecutionPlan(workerTasks);
		}

		if (!plan.ok) {
			nest.updateState({ status: "failed", finishedAt: Date.now() });
			const finalState = nest.getState();
			callbacks.onComplete?.(finalState);
			emitSignal("failed", `No valid execution plan: ${plan.issues.slice(0, 3).join(", ")}`);
			return finalState;
		}

		// ═══ Phase 2: Working ═══
		waveBase.budgetPlan = refreshBudgetPlan(); // Refresh budget before work phase
		nest.updateState({ status: "working" });

		// Build import graph for dependency-aware scheduling
		let importGraph: ImportGraph | undefined;
		try {
			const allFiles = nest
				.getAllTasks()
				.flatMap((t) => t.files)
				.filter((f) => /\.[tj]sx?$/.test(f));
			if (allFiles.length > 0) {
				importGraph = buildImportGraph([...new Set(allFiles)], opts.cwd);
				waveBase.importGraph = importGraph;
			}
		} catch {
			/* graph build failed, proceed without */
		}

		// Execute drone tasks first (zero LLM cost)
		const droneTasks = nest.getAllTasks().filter((t) => t.caste === "drone" && t.status === "pending");
		if (droneTasks.length > 0) {
			callbacks.onPhase?.("working", `${droneTasks.length} drone tasks. Executing rules...`);
			emitSignal("working", `${droneTasks.length} drone tasks`);
			await runAntWave({ ...waveBase, caste: "drone" });
		}

		callbacks.onPhase?.("working", `${workerTasks.length} tasks discovered. Dispatching worker ants...`);
		emitSignal("working", `${workerTasks.length} tasks to do`);
		await runAntWave({ ...waveBase, caste: "worker" });

		// Process worker-spawned sub-tasks (budget-driven, no hard limit)
		while (true) {
			// Run drone sub-tasks first
			const pendingDrones = nest.getAllTasks().filter((t) => t.caste === "drone" && t.status === "pending");
			if (pendingDrones.length > 0) {
				await runAntWave({ ...waveBase, caste: "drone" });
			}

			const remaining = nest
				.getAllTasks()
				.filter((t) => t.caste === "worker" && (t.status === "pending" || t.status === "blocked"));
			if (remaining.length === 0) {
				break;
			}
			callbacks.onPhase?.("working", `${remaining.length} sub-tasks from workers...`);
			const result = await runAntWave({ ...waveBase, caste: "worker" });
			if (result === "budget") {
				nest.updateState({ status: "budget_exceeded", finishedAt: Date.now() });
				emitSignal("budget_exceeded", "Budget exhausted");
				const budgetState = nest.getState();
				callbacks.onComplete?.(budgetState);
				return budgetState;
			}
		}

		// ═══ Continuous exploration: check for new discoveries after workers finish, re-dispatch scouts if found ═══
		// Bio 4: Nest temperature — prohibit new scout exploration when >50% budget spent
		const discoveries = nest.getAllPheromones().filter((p) => p.type === "discovery");
		const allDone = nest.getAllTasks().filter((t) => t.status === "done");
		const preExploreSpent = nest.getStateLight().ants.reduce((s, a) => s + a.usage.cost, 0);
		const preExploreBudget = nest.getStateLight().maxCost ?? Number.POSITIVE_INFINITY;
		const costTemperature = preExploreSpent / preExploreBudget;
		if (discoveries.length > allDone.length && costTemperature < 0.5) {
			if (preExploreSpent < preExploreBudget) {
				callbacks.onPhase?.("scouting", "Re-exploring based on new discoveries...");
				emitSignal("scouting", "Re-exploring...");
				await runAntWave({ ...waveBase, caste: "scout" });

				const newTasks = nest
					.getAllTasks()
					.filter((t) => (t.caste === "worker" || t.caste === "drone") && t.status === "pending");
				if (newTasks.length > 0) {
					const drones = newTasks.filter((t) => t.caste === "drone");
					if (drones.length > 0) {
						await runAntWave({ ...waveBase, caste: "drone" });
					}

					callbacks.onPhase?.("working", `${newTasks.length} new tasks from re-exploration`);
					emitSignal("working", `${newTasks.length} new tasks`);
					const result = await runAntWave({ ...waveBase, caste: "worker" });
					if (result === "budget") {
						nest.updateState({ status: "budget_exceeded", finishedAt: Date.now() });
						emitSignal("budget_exceeded", "Budget exhausted");
						const budgetState = nest.getState();
						callbacks.onComplete?.(budgetState);
						return budgetState;
					}
				}
			}
		}

		// ═══ Auto-check: run tsc before soldier review ═══
		let tscPassed = true;
		try {
			const { execSync } = await import("node:child_process");
			execSync("npx tsc --noEmit", { cwd: opts.cwd, timeout: 30000, stdio: "pipe" });
		} catch {
			tscPassed = false;
		}

		// ═══ Phase 3: Review ═══
		waveBase.budgetPlan = refreshBudgetPlan(); // Refresh budget before review phase
		const completedWorkerTasks = nest.getAllTasks().filter((t) => t.caste === "worker" && t.status === "done");
		if (completedWorkerTasks.length > 0 && (!tscPassed || completedWorkerTasks.length > 3)) {
			nest.updateState({ status: "reviewing" });
			callbacks.onPhase?.("reviewing", "Dispatching soldier ants to review changes...");
			emitSignal("reviewing", "Reviewing changes...");
			const reviewTask = makeReviewTask(completedWorkerTasks);
			nest.writeTask(reviewTask);
			await runAntWave({ ...waveBase, caste: "soldier" });

			// Fix tasks spawned by soldiers
			const fixTasks = nest
				.getAllTasks()
				.filter((t) => t.caste === "worker" && t.status === "pending" && t.parentId !== null);
			if (fixTasks.length > 0) {
				nest.updateState({ status: "working" });
				callbacks.onPhase?.("working", `${fixTasks.length} fix tasks from review. Dispatching workers...`);
				await runAntWave({ ...waveBase, caste: "worker" });
			}
		}

		// ═══ Phase 4: Complete ═══
		const finalMetrics = updateMetrics(nest);
		nest.updateState({ status: "done", finishedAt: Date.now(), metrics: finalMetrics });
		const finalState = nest.getState();
		callbacks.onComplete?.(finalState);
		emitSignal("done", `${finalMetrics.tasksDone}/${finalMetrics.tasksTotal} tasks done`);
		return finalState;
	} catch (e) {
		nest.updateState({ status: "failed", finishedAt: Date.now() });
		const failState = nest.getState();
		callbacks.onComplete?.(failState);
		emitSignal("failed", String(e).slice(0, 100));
		return failState;
	} finally {
		usageLimitsTracker.dispose();
		const finalStatus = nest.getState().status;
		if (finalStatus === "done") {
			cleanup();
		}
	}
}

/**
 * Resume a colony from its last checkpoint — skips completed phases
 * and continues executing any pending tasks.
 */
export async function resumeColony(opts: QueenOptions): Promise<ColonyState> {
	const found = Nest.findResumable(opts.cwd);
	if (!found) {
		return runColony(opts); // No resumable state found — start fresh
	}

	const nest = new Nest(opts.cwd, found.colonyId);
	nest.restore();

	const { signal, callbacks } = opts;

	const emitSignal = (phase: ColonyState["status"], message: string) => {
		const state = nest.getStateLight();
		const m = state.metrics;
		const active = state.ants.filter((a) => a.status === "working").length;
		const progress = m.tasksTotal > 0 ? m.tasksDone / m.tasksTotal : 0;
		callbacks.onSignal?.({ phase, progress, active, cost: m.totalCost, message });
	};

	const waveBase: Omit<WaveOptions, "caste"> & { budgetPlan?: BudgetPlan | null } = {
		nest,
		cwd: opts.cwd,
		signal,
		callbacks,
		emitSignal,
		currentModel: opts.currentModel,
		modelOverrides: opts.modelOverrides,
		authStorage: opts.authStorage,
		modelRegistry: opts.modelRegistry,
	};

	// Budget plan for resumed colony
	const usageLimitsTracker = createUsageLimitsTracker(opts.eventBus);
	const latestLimits = usageLimitsTracker.requestSnapshot();
	const state = nest.getStateLight();
	waveBase.budgetPlan = planBudget(latestLimits, state.metrics, opts.maxCost ?? null, state.concurrency);

	const cleanup = () => {
		nest.destroy();
		const parentDir = path.join(opts.cwd, ".ant-colony");
		try {
			const entries = fs.readdirSync(parentDir);
			if (entries.length === 0) {
				fs.rmdirSync(parentDir);
			}
		} catch {
			/* ignore */
		}
	};

	callbacks.onPhase?.("working", "Resuming colony from checkpoint...");
	emitSignal("working", "Resuming...");

	try {
		// Execute all pending tasks
		const pendingDrones = nest.getAllTasks().filter((t) => t.caste === "drone" && t.status === "pending");
		if (pendingDrones.length > 0) {
			await runAntWave({ ...waveBase, caste: "drone" });
		}

		const pendingWorkers = nest.getAllTasks().filter((t) => t.caste === "worker" && t.status === "pending");
		if (pendingWorkers.length > 0) {
			const result = await runAntWave({ ...waveBase, caste: "worker" });
			if (result === "budget") {
				nest.updateState({ status: "budget_exceeded", finishedAt: Date.now() });
				emitSignal("budget_exceeded", "Budget exhausted");
				const s = nest.getState();
				callbacks.onComplete?.(s);
				return s;
			}
		}

		// Soldier review for resumed colony (conditions match runColony)
		let tscPassed = true;
		try {
			const { execSync } = await import("node:child_process");
			execSync("npx tsc --noEmit", { cwd: opts.cwd, timeout: 30000, stdio: "pipe" });
		} catch {
			tscPassed = false;
		}

		const completedWorkerTasks = nest.getAllTasks().filter((t) => t.caste === "worker" && t.status === "done");
		if (completedWorkerTasks.length > 0 && (!tscPassed || completedWorkerTasks.length > 3)) {
			nest.updateState({ status: "reviewing" });
			const reviewTask = makeReviewTask(completedWorkerTasks);
			nest.writeTask(reviewTask);
			await runAntWave({ ...waveBase, caste: "soldier" });
			const fixTasks = nest
				.getAllTasks()
				.filter((t) => t.caste === "worker" && t.status === "pending" && t.parentId !== null);
			if (fixTasks.length > 0) {
				nest.updateState({ status: "working" });
				await runAntWave({ ...waveBase, caste: "worker" });
			}
		}

		const finalMetrics = updateMetrics(nest);
		nest.updateState({ status: "done", finishedAt: Date.now(), metrics: finalMetrics });
		const finalState = nest.getState();
		callbacks.onComplete?.(finalState);
		emitSignal("done", `Resumed: ${finalMetrics.tasksDone}/${finalMetrics.tasksTotal} tasks done`);
		return finalState;
	} catch (e) {
		nest.updateState({ status: "failed", finishedAt: Date.now() });
		const failState = nest.getState();
		callbacks.onComplete?.(failState);
		emitSignal("failed", String(e).slice(0, 100));
		return failState;
	} finally {
		usageLimitsTracker.dispose();
		const finalStatus = nest.getState().status;
		if (finalStatus === "done") {
			cleanup();
		}
	}
}
