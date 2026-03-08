/**
 * Ant Colony Type System
 *
 * Core type definitions for the colony architecture, modeled after
 * real ant ecology. Each type maps to a biological concept:
 * - Castes (scout, worker, soldier, drone) → ant roles
 * - Tasks → food sources to collect
 * - Pheromones → indirect communication signals
 * - Nest/Colony state → shared hive state
 */

// ═══ Ant Castes ═══
export type AntCaste = "scout" | "worker" | "soldier" | "drone";

export interface AntConfig {
	caste: AntCaste;
	model: string;
	tools: string[];
	systemPrompt: string;
	maxTurns: number;
}

export const DEFAULT_ANT_CONFIGS: Record<AntCaste, Omit<AntConfig, "systemPrompt">> = {
	scout: { caste: "scout", model: "", tools: ["read", "bash", "grep", "find", "ls"], maxTurns: 8 },
	worker: { caste: "worker", model: "", tools: ["read", "bash", "edit", "write", "grep", "find", "ls"], maxTurns: 15 },
	soldier: { caste: "soldier", model: "", tools: ["read", "bash", "grep", "find", "ls"], maxTurns: 8 },
	drone: { caste: "drone", model: "", tools: ["bash"], maxTurns: 1 },
};

/** Per-caste model overrides from user config */
export type ModelOverrides = Partial<Record<AntCaste, string>>;

// ═══ Tasks (Food Sources) ═══
export type TaskStatus = "pending" | "claimed" | "active" | "done" | "failed" | "blocked";
export type TaskPriority = 1 | 2 | 3 | 4 | 5; // 1=highest

export interface Task {
	id: string;
	parentId: string | null;
	title: string;
	description: string;
	caste: AntCaste; // Which caste should execute this task
	status: TaskStatus;
	priority: TaskPriority;
	files: string[]; // Files locked by this task
	context?: string; // Code snippets pre-loaded by scout
	claimedBy: string | null; // ant id
	result: string | null;
	error: string | null;
	spawnedTasks: string[]; // Child task IDs
	createdAt: number;
	startedAt: number | null;
	finishedAt: number | null;
}

// ═══ Pheromones ═══
export type PheromoneType =
	| "discovery" // Intel discovered by scouts
	| "progress" // Worker progress updates
	| "warning" // Danger markers (failures, conflicts)
	| "completion" // Task completion markers
	| "dependency" // Dependency relationships
	| "repellent"; // Negative signal (released on failure, lowers related task priority)

export interface Pheromone {
	id: string;
	type: PheromoneType;
	antId: string;
	antCaste: AntCaste;
	taskId: string;
	content: string;
	files: string[];
	strength: number; // 0-1, decays exponentially over time
	createdAt: number;
}

// ═══ Ant Instances ═══
export type AntStatus = "idle" | "working" | "done" | "failed";

export interface Ant {
	id: string;
	caste: AntCaste;
	status: AntStatus;
	taskId: string | null;
	pid: number | null;
	model: string;
	usage: { input: number; output: number; cost: number; turns: number };
	startedAt: number;
	finishedAt: number | null;
}

// ═══ Streaming Callbacks ═══
export interface AntStreamEvent {
	antId: string;
	caste: AntCaste;
	taskId: string;
	delta: string; // text token delta
	totalText: string; // accumulated text so far
}

// ═══ Colony State ═══
export interface ColonyState {
	id: string;
	goal: string;
	status: "scouting" | "planning_recovery" | "working" | "reviewing" | "done" | "failed" | "budget_exceeded";
	tasks: Task[];
	ants: Ant[];
	pheromones: Pheromone[];
	concurrency: ConcurrencyConfig;
	metrics: ColonyMetrics;
	maxCost: number | null; // cost budget in USD, null = unlimited
	modelOverrides: ModelOverrides;
	createdAt: number;
	finishedAt: number | null;
}

export interface ConcurrencyConfig {
	current: number;
	min: number;
	max: number;
	optimal: number; // Adaptively computed optimal concurrency
	history: ConcurrencySample[];
	lastRateLimitAt?: number; // Timestamp of the most recent 429 rate limit
}

export interface ConcurrencySample {
	timestamp: number;
	concurrency: number;
	cpuLoad: number;
	memFree: number;
	throughput: number; // tasks completed per minute
}

export interface ColonyMetrics {
	tasksTotal: number;
	tasksDone: number;
	tasksFailed: number;
	antsSpawned: number;
	totalCost: number;
	totalTokens: number;
	startTime: number;
	throughputHistory: number[]; // Sliding window of tasks/min throughput
}

/** Colony signal — the single abstraction observers need to handle. */
export interface ColonySignal {
	phase: ColonyState["status"];
	progress: number; // 0-1
	active: number; // Number of currently active ants
	cost: number;
	message: string; // Human-readable status summary
	colonyId?: string; // Stable persisted colony ID (e.g. colony-lk42...)
}

export interface DroneCommandPolicy {
	allowlist: string[];
	maxArgs: number;
	maxCommandLength: number;
}

export interface ColonyRuntimeIdentity {
	runtimeId: string; // Session-local ID (e.g. c1)
	stableId: string; // Persisted nest ID (e.g. colony-lk42...)
}
