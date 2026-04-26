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
	drone: { caste: "drone", maxTurns: 1, model: "", tools: ["bash"] },
	scout: { caste: "scout", maxTurns: 8, model: "", tools: ["read", "bash", "grep", "find", "ls"] },
	soldier: { caste: "soldier", maxTurns: 8, model: "", tools: ["read", "bash", "grep", "find", "ls"] },
	worker: { caste: "worker", maxTurns: 15, model: "", tools: ["read", "bash", "edit", "write", "grep", "find", "ls"] },
};

export type WorkerClass = "design" | "multimodal" | "backend" | "review";

/** Per-caste / per-worker-class model overrides from user config */
export type ModelOverrides = Partial<Record<AntCaste | WorkerClass, string>>;

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
	workerClass?: WorkerClass; // Worker specialization for model routing
	claimedBy: string | null; // Ant id
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
	routeSource?: "override" | "delegated-category" | "session-default";
	routeCategory?: string;
	usage: { input: number; output: number; cost: number; turns: number };
	startedAt: number;
	finishedAt: number | null;
}

// ═══ Streaming Callbacks ═══
export interface AntStreamEvent {
	antId: string;
	caste: AntCaste;
	taskId: string;
	delta: string; // Text token delta
	totalText: string; // Accumulated text so far
}

export interface AntUsageEvent {
	antId: string;
	caste: AntCaste;
	taskId: string;
	provider: string;
	model: string;
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		costTotal: number;
	};
}

// ═══ Colony State ═══
export interface ColonyWorkspace {
	mode: "shared" | "worktree";
	/** The original session cwd where the colony was launched. */
	originCwd: string;
	/** The cwd where ants actually execute tasks (worktree or shared cwd). */
	executionCwd: string;
	repoRoot: string | null;
	worktreeRoot: string | null;
	branch: string | null;
	baseBranch: string | null;
	/** Whether this worktree was created and tracked by pi. */
	managedByPi?: boolean;
	/** The human-readable reason the worktree exists. */
	purpose?: string | null;
	/** Which pi instance created the worktree. */
	ownerInstanceId?: string | null;
	/** Optional note (e.g. fallback reason when worktree creation fails). */
	note: string | null;
}

export interface ColonyState {
	id: string;
	goal: string;
	status: "scouting" | "planning_recovery" | "working" | "reviewing" | "done" | "failed" | "budget_exceeded";
	tasks: Task[];
	ants: Ant[];
	pheromones: Pheromone[];
	concurrency: ConcurrencyConfig;
	metrics: ColonyMetrics;
	maxCost: number | null; // Cost budget in USD, null = unlimited
	modelOverrides: ModelOverrides;
	/** Execution workspace metadata (shared cwd vs isolated worktree). */
	workspace?: ColonyWorkspace;
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
	throughput: number; // Tasks completed per minute
}

export type EscalationReason = "low_confidence" | "low_coverage" | "risk_flag" | "policy_violation" | "slo_breach";

export interface PromoteFinalizeGateInput {
	confidenceScore: number;
	coverageScore: number;
	riskFlags: string[];
	policyViolations: string[];
	sloBreached: boolean;
	cheapPassSummary: string;
}

export interface PromoteFinalizeGateDecision {
	action: "promote" | "finalize";
	escalationReasons: EscalationReason[];
	cheapPassSummary?: string;
}

export interface RoutingTelemetry {
	taskId: string;
	caste: AntCaste;
	outcome: "claimed" | "completed" | "failed" | "escalated";
	latencyMs: number;
	escalationReasons: EscalationReason[];
	timestamp: number;
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
	routingTelemetry?: RoutingTelemetry[];
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
