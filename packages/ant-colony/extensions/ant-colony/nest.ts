/**
 * Nest — Colony shared state backed by the file system.
 *
 * The nest is the single source of truth for a running colony. It persists
 * all state to `.ant-colony/{colonyId}/` so that colonies can be resumed
 * after a crash and multiple ants can coordinate via file locks.
 *
 * Directory layout:
 * ```
 * .ant-colony/{colonyId}/
 *   state.json      — Main colony state (metrics, ants, concurrency)
 *   pheromone.jsonl  — Append-only pheromone log (incremental reads)
 *   tasks/           — One JSON file per task (atomic writes via rename)
 * ```
 *
 * Concurrency is controlled by an exclusive lock file (`state.lock`).
 * The lock includes the holder's PID and timestamp for stale-lock recovery.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Ant, ColonyState, ConcurrencySample, Pheromone, Task, TaskStatus } from "./types.js";

/** Minimum pheromone strength to keep (below this, entries are garbage-collected). */
const PHEROMONE_MIN_STRENGTH = 0.05;

/** Pheromone half-life in milliseconds (10 minutes). */
const PHEROMONE_HALF_LIFE_MS = 10 * 60 * 1000;

/** Number of `getAllPheromones()` calls between garbage-collection passes. */
const PHEROMONE_GC_INTERVAL = 10;

/** Maximum age (ms) before a lock file is considered stale and can be broken. */
const STALE_LOCK_THRESHOLD_MS = 30_000;

/**
 * Score a task by combining its static priority with pheromone signals.
 * Higher scores are picked first by `claimNextTask`.
 */
function scoreTask(task: Task, pheromoneByFile: Map<string, Pheromone[]>): number {
	let pScore = 0;
	const seen = new Set<Pheromone>();
	for (const f of task.files) {
		for (const p of pheromoneByFile.get(f) ?? []) {
			if (seen.has(p) || p.strength <= 0.1) {
				continue;
			}
			seen.add(p);
			if (p.type === "discovery" || p.type === "completion") {
				pScore += p.strength;
			} else if (p.type === "repellent") {
				pScore -= p.strength * 3;
			} else if (p.type === "warning") {
				pScore -= p.strength;
			}
		}
	}
	return 6 - task.priority + pScore;
}

/**
 * The Nest manages all persistent colony state through atomic file operations.
 *
 * Key design decisions:
 * - **Atomic writes**: all JSON files are written to a `.tmp` file first, then renamed
 * - **Incremental pheromone reads**: only new bytes are read on each call
 * - **File-based locking**: prevents concurrent state mutations with stale-lock recovery
 * - **In-memory caching**: task and state caches avoid redundant disk reads
 */
export class Nest {
	/** Absolute path to this colony's data directory. */
	readonly dir: string;

	private stateFile: string;
	private lockFile: string;
	private pheromoneFile: string;
	private tasksDir: string;
	private pheromoneCache: Pheromone[] = [];
	private pheromoneOffset = 0;
	private taskCache: Map<string, Task> = new Map();
	private stateCache: ColonyState | null = null;
	private gcCounter = 0;
	private pheromoneByFile: Map<string, Pheromone[]> = new Map();
	private pheromoneIndexDirty = true;

	constructor(
		private cwd: string,
		private colonyId: string,
	) {
		this.dir = path.join(cwd, ".ant-colony", colonyId);
		this.stateFile = path.join(this.dir, "state.json");
		this.lockFile = path.join(this.dir, "state.lock");
		this.pheromoneFile = path.join(this.dir, "pheromone.jsonl");
		this.tasksDir = path.join(this.dir, "tasks");
		fs.mkdirSync(this.tasksDir, { recursive: true });
	}

	// ═══ State ═══

	/** Initialize the nest with a fresh colony state and persist all tasks. */
	init(state: ColonyState): void {
		this.writeJson(this.stateFile, state);
		this.stateCache = state;
		this.taskCache.clear();
		for (const t of state.tasks) {
			this.writeTask(t);
		}
	}

	/** Read the full colony state including all tasks and pheromones from disk. */
	getState(): ColonyState {
		if (!this.stateCache) {
			this.stateCache = this.readJson<ColonyState>(this.stateFile);
		}
		const base = { ...this.stateCache };
		base.tasks = this.getAllTasks();
		base.pheromones = this.getAllPheromones();
		return base;
	}

	/** Lightweight state read — returns cached state + tasks without loading pheromones. */
	getStateLight(): ColonyState {
		if (!this.stateCache) {
			this.stateCache = this.readJson<ColonyState>(this.stateFile);
		}
		return { ...this.stateCache, tasks: this.getAllTasks() };
	}

	/** Atomically patch selected fields of the colony state under a file lock. */
	updateState(patch: Partial<Pick<ColonyState, "status" | "concurrency" | "metrics" | "ants" | "finishedAt">>): void {
		this.withStateLock(() => {
			if (!this.stateCache) {
				this.stateCache = this.readJson<ColonyState>(this.stateFile);
			}
			Object.assign(this.stateCache, patch);
			this.writeJson(this.stateFile, this.stateCache);
		});
	}

	// ═══ Tasks ═══

	/** Persist a task to disk and update the in-memory cache. */
	writeTask(task: Task): void {
		this.writeJson(path.join(this.tasksDir, `${task.id}.json`), task);
		this.taskCache.set(task.id, task);
	}

	/** Read a single task by ID. Returns from cache if available. */
	getTask(id: string): Task | null {
		const cached = this.taskCache.get(id);
		if (cached) {
			return cached;
		}
		const f = path.join(this.tasksDir, `${id}.json`);
		if (!fs.existsSync(f)) {
			return null;
		}
		const task = this.readJson<Task>(f);
		this.taskCache.set(id, task);
		return task;
	}

	/** Read all tasks from disk (or cache). Populates the cache on first call. */
	getAllTasks(): Task[] {
		if (this.taskCache.size > 0) {
			return Array.from(this.taskCache.values());
		}
		try {
			const tasks = fs
				.readdirSync(this.tasksDir)
				.filter((f) => f.endsWith(".json"))
				.map((f) => this.readJson<Task>(path.join(this.tasksDir, f)));
			for (const t of tasks) {
				this.taskCache.set(t.id, t);
			}
			return tasks;
		} catch (e) {
			console.error("[nest] failed to read tasks dir:", e);
			return [];
		}
	}

	/** Atomically claim a specific task for an ant. Returns false if already claimed. */
	claimTask(taskId: string, antId: string): boolean {
		return this.withStateLock(() => {
			const task = this.getTask(taskId);
			if (!task || task.status !== "pending") {
				return false;
			}
			task.status = "claimed";
			task.claimedBy = antId;
			this.writeTask(task);
			return true;
		});
	}

	/**
	 * Atomically select and claim the best pending task for the given caste.
	 * Uses pheromone-weighted scoring with a 10% random exploration rate
	 * (biologically inspired — prevents path lock-in on suboptimal trails).
	 */
	claimNextTask(caste: "scout" | "worker" | "soldier" | "drone", antId: string): Task | null {
		return this.withStateLock(() => {
			const tasks = this.getAllTasks().filter((t) => t.status === "pending" && t.caste === caste);
			if (tasks.length === 0) {
				return null;
			}

			this.getAllPheromones();

			// 10% random exploration to avoid local optima (ant colony optimization technique)
			let chosen: Task;
			if (tasks.length > 1 && Math.random() < 0.1) {
				chosen = tasks[Math.floor(Math.random() * tasks.length)];
			} else {
				const scored = tasks.map((t) => ({ task: t, score: scoreTask(t, this.pheromoneByFile) }));
				scored.sort((a, b) => b.score - a.score);
				chosen = scored[0].task;
			}

			chosen.status = "claimed";
			chosen.claimedBy = antId;
			this.writeTask(chosen);
			return chosen;
		});
	}

	/** Update a task's status and optionally set result/error text. */
	updateTaskStatus(taskId: string, status: TaskStatus, result?: string, error?: string): void {
		const task = this.getTask(taskId);
		if (!task) {
			return;
		}
		task.status = status;
		if (status === "active") {
			task.startedAt = Date.now();
		}
		if (status === "done" || status === "failed") {
			task.finishedAt = Date.now();
		}
		if (result !== undefined) {
			task.result = result;
		}
		if (error !== undefined) {
			task.error = error;
		}
		this.writeTask(task);
	}

	/** Register a child task and link it to its parent's `spawnedTasks` list. */
	addSubTask(parentId: string, child: Task): void {
		this.writeTask(child);
		const parent = this.getTask(parentId);
		if (parent) {
			parent.spawnedTasks.push(child.id);
			this.writeTask(parent);
		}
	}

	// ═══ Pheromones ═══

	/** Append a new pheromone entry to the JSONL log. */
	dropPheromone(p: Pheromone): void {
		fs.appendFileSync(this.pheromoneFile, `${JSON.stringify(p)}\n`);
		this.pheromoneIndexDirty = true;
	}

	/**
	 * Read all pheromones, applying exponential decay and garbage-collecting
	 * entries that have faded below the minimum strength threshold.
	 * Uses incremental reads to avoid re-parsing the entire log each time.
	 */
	getAllPheromones(): Pheromone[] {
		if (!fs.existsSync(this.pheromoneFile)) {
			return [];
		}
		const now = Date.now();

		// Incremental read: only parse bytes added since last call
		const stat = fs.statSync(this.pheromoneFile);
		if (stat.size > this.pheromoneOffset) {
			const fd = fs.openSync(this.pheromoneFile, "r");
			const buf = Buffer.alloc(stat.size - this.pheromoneOffset);
			fs.readSync(fd, buf, 0, buf.length, this.pheromoneOffset);
			fs.closeSync(fd);
			const newLines = buf.toString("utf-8").split("\n").filter(Boolean);
			for (const line of newLines) {
				this.pheromoneCache.push(JSON.parse(line) as Pheromone);
			}
			this.pheromoneOffset = stat.size;
		}

		// Apply exponential decay and filter out faded pheromones
		const beforeLen = this.pheromoneCache.length;
		this.pheromoneCache = this.pheromoneCache.filter((pheromone) => {
			pheromone.strength = 0.5 ** ((now - pheromone.createdAt) / PHEROMONE_HALF_LIFE_MS);
			return pheromone.strength > PHEROMONE_MIN_STRENGTH;
		});
		const hadGarbage = this.pheromoneCache.length < beforeLen;
		if (hadGarbage) {
			this.pheromoneIndexDirty = true;
		}

		// Rebuild the file→pheromone index when dirty
		if (this.pheromoneIndexDirty) {
			this.pheromoneByFile.clear();
			for (const p of this.pheromoneCache) {
				for (const f of p.files) {
					let arr = this.pheromoneByFile.get(f);
					if (!arr) {
						arr = [];
						this.pheromoneByFile.set(f, arr);
					}
					arr.push(p);
				}
			}
			this.pheromoneIndexDirty = false;
		}

		// Periodic GC: rewrite the pheromone file to remove decayed entries
		this.gcCounter++;
		if (this.gcCounter >= PHEROMONE_GC_INTERVAL && hadGarbage) {
			this.gcCounter = 0;
			const tmp = `${this.pheromoneFile}.tmp`;
			fs.writeFileSync(
				tmp,
				this.pheromoneCache.map((p) => JSON.stringify(p)).join("\n") + (this.pheromoneCache.length ? "\n" : ""),
			);
			fs.renameSync(tmp, this.pheromoneFile);
			this.pheromoneOffset = fs.statSync(this.pheromoneFile).size;
		}

		return this.pheromoneCache;
	}

	/** Count warning and repellent pheromones associated with the given files. */
	countWarnings(files: string[]): number {
		this.getAllPheromones();
		let count = 0;
		for (const f of files) {
			for (const p of this.pheromoneByFile.get(f) ?? []) {
				if (p.type === "warning" || p.type === "repellent") {
					count++;
				}
			}
		}
		return count;
	}

	/** Build a text summary of pheromones relevant to the given files, sorted by strength. */
	getPheromoneContext(files: string[], limit = 20): string {
		const relevant = this.getAllPheromones()
			.filter((p) => p.files.some((f) => files.includes(f)) || files.length === 0)
			.sort((a, b) => b.strength - a.strength)
			.slice(0, limit);
		if (relevant.length === 0) {
			return "";
		}
		return relevant.map((p) => `[${p.type}|${p.antCaste}|str:${p.strength.toFixed(2)}] ${p.content}`).join("\n");
	}

	// ═══ Ants ═══

	/** Update or insert an ant record in the colony state. */
	updateAnt(ant: Ant): void {
		this.withStateLock(() => {
			if (!this.stateCache) {
				this.stateCache = this.readJson<ColonyState>(this.stateFile);
			}
			const idx = this.stateCache.ants.findIndex((a) => a.id === ant.id);
			if (idx >= 0) {
				this.stateCache.ants[idx] = ant;
			} else {
				this.stateCache.ants.push(ant);
			}
			this.writeJson(this.stateFile, this.stateCache);
		});
	}

	// ═══ Concurrency Sampling ═══

	/** Record a system performance sample for the adaptive concurrency algorithm. */
	recordSample(sample: ConcurrencySample): void {
		this.withStateLock(() => {
			if (!this.stateCache) {
				this.stateCache = this.readJson<ColonyState>(this.stateFile);
			}
			this.stateCache.concurrency.history.push(sample);
			if (this.stateCache.concurrency.history.length > 30) {
				this.stateCache.concurrency.history = this.stateCache.concurrency.history.slice(-30);
			}
			this.writeJson(this.stateFile, this.stateCache);
		});
	}

	// ═══ Cleanup ═══

	/** Remove this colony's data directory from disk. */
	destroy(): void {
		try {
			fs.rmSync(this.dir, { recursive: true, force: true });
		} catch {
			// Already removed or inaccessible — safe to ignore
		}
	}

	// ═══ Internal ═══

	/**
	 * Execute a function while holding an exclusive file lock.
	 *
	 * Uses `{ flag: "wx" }` for atomic lock creation. If the lock is held
	 * by another process, spins with jitter until the lock is released or
	 * the timeout (3s) is reached. Stale locks (>30s old or from dead
	 * processes) are automatically broken.
	 */
	private withStateLock<T>(fn: () => T): T {
		const MAX_WAIT = 3000;
		const SPIN_MS = 5;
		const start = Date.now();
		while (true) {
			try {
				fs.writeFileSync(this.lockFile, `${process.pid}:${Date.now()}`, { flag: "wx" });
				break;
			} catch {
				if (Date.now() - start > MAX_WAIT) {
					this.tryBreakStaleLock();
					throw new Error(`[Nest] withStateLock timeout after ${MAX_WAIT}ms`);
				}
				// Busy-wait with jitter to avoid thundering herd
				const until = Date.now() + SPIN_MS + Math.random() * SPIN_MS * 2;
				while (Date.now() < until) {
					/* spin */
				}
			}
		}
		try {
			return fn();
		} finally {
			try {
				fs.unlinkSync(this.lockFile);
			} catch {
				// Lock already removed by another process
			}
		}
	}

	/**
	 * Attempt to break a stale lock file. A lock is considered stale if it's
	 * older than 30 seconds or the holding process is no longer alive.
	 */
	private tryBreakStaleLock(): void {
		try {
			const content = fs.readFileSync(this.lockFile, "utf-8");
			const [pidStr, tsStr] = content.split(":");
			const holder = Number.parseInt(pidStr, 10);
			const lockTime = Number.parseInt(tsStr, 10);
			if (lockTime && Date.now() - lockTime > STALE_LOCK_THRESHOLD_MS) {
				fs.unlinkSync(this.lockFile);
				return;
			}
			try {
				process.kill(holder, 0);
			} catch {
				// Process is dead — safe to break the lock
				fs.unlinkSync(this.lockFile);
			}
		} catch {
			// Lock file unreadable or already gone
			try {
				fs.unlinkSync(this.lockFile);
			} catch {
				// Nothing to do
			}
		}
	}

	/** Write JSON to a file atomically via tmp+rename. */
	private writeJson(file: string, data: unknown): void {
		const tmp = `${file}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
		fs.renameSync(tmp, file);
	}

	/** Read and parse a JSON file. */
	private readJson<T>(file: string): T {
		return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
	}

	/**
	 * Scan `.ant-colony/` for a colony that can be resumed (status is
	 * scouting, working, or reviewing and has no `finishedAt` timestamp).
	 */
	static findResumable(cwd: string): { colonyId: string; state: ColonyState } | null {
		const parentDir = path.join(cwd, ".ant-colony");
		try {
			for (const dir of fs.readdirSync(parentDir)) {
				const stateFile = path.join(parentDir, dir, "state.json");
				if (!fs.existsSync(stateFile)) {
					continue;
				}
				const state = JSON.parse(fs.readFileSync(stateFile, "utf-8")) as ColonyState;
				if (
					!state.finishedAt &&
					state.status !== "done" &&
					state.status !== "failed" &&
					state.status !== "budget_exceeded"
				) {
					return { colonyId: dir, state };
				}
			}
		} catch {
			// No .ant-colony directory — nothing to resume
		}
		return null;
	}

	/**
	 * Restore a colony from its persisted checkpoint. Resets any claimed/active
	 * tasks back to pending (their ants are assumed dead) and marks orphaned
	 * working/idle ants as failed.
	 */
	restore(): void {
		this.stateCache = this.readJson<ColonyState>(this.stateFile);
		for (const task of this.getAllTasks()) {
			if (task.status === "claimed" || task.status === "active") {
				task.status = "pending";
				task.claimedBy = null;
				this.writeTask(task);
			}
		}
		for (const ant of this.stateCache.ants) {
			if (ant.status === "working" || ant.status === "idle") {
				ant.status = "failed";
				ant.finishedAt = Date.now();
			}
		}
		this.writeJson(this.stateFile, this.stateCache);
	}
}
