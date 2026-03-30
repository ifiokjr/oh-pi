/**
 * oh-pi Scheduler Extension
 *
 * Adds recurring checks (`/loop`), one-time reminders (`/remind`), and a
 * task manager (`/schedule`) to pi. Also exposes an LLM-callable tool
 * (`schedule_prompt`) so the agent can create/list/delete schedules in
 * natural language.
 *
 * Based on pi-scheduler by @manojlds (MIT).
 *
 * Tasks run only while pi is active and idle. State is persisted under
 * `~/.pi/agent/scheduler/.../scheduler.json` using a path that mirrors the
 * current workspace path. Overdue tasks restored from disk are surfaced for
 * manual review instead of auto-dispatching on session start.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
	computeNextCronRunAt,
	formatDurationShort,
	normalizeCronExpression,
	normalizeDuration,
	parseDuration,
} from "./scheduler-parsing.js";
import { registerCommands, registerEvents, registerTools } from "./scheduler-registration.js";
import {
	DEFAULT_LOOP_INTERVAL,
	DISPATCH_RATE_LIMIT_WINDOW_MS,
	FIFTEEN_MINUTES,
	getLegacySchedulerStoragePath,
	getSchedulerStoragePath,
	getSchedulerStorageRoot,
	MAX_DISPATCHES_PER_WINDOW,
	MAX_TASKS,
	MIN_RECURRING_INTERVAL,
	ONE_MINUTE,
	type ScheduleTask,
	THREE_DAYS,
} from "./scheduler-shared.js";

export {
	computeCronCadenceMs,
	computeNextCronRunAt,
	formatDurationShort,
	normalizeCronExpression,
	normalizeDuration,
	parseDuration,
	parseLoopScheduleArgs,
	parseRemindScheduleArgs,
	validateSchedulePromptAddInput,
} from "./scheduler-parsing.js";
export {
	DEFAULT_LOOP_INTERVAL,
	DISPATCH_RATE_LIMIT_WINDOW_MS,
	FIFTEEN_MINUTES,
	getLegacySchedulerStoragePath,
	getSchedulerStoragePath,
	getSchedulerStorageRoot,
	MAX_DISPATCHES_PER_WINDOW,
	MAX_TASKS,
	MIN_RECURRING_INTERVAL,
	ONE_MINUTE,
	THREE_DAYS,
};
export type {
	ParseResult,
	RecurringSpec,
	ReminderParseResult,
	SchedulePromptAddPlan,
	ScheduleTask,
	TaskKind,
	TaskStatus,
} from "./scheduler-shared.js";

interface SchedulerStore {
	version: 1;
	tasks: ScheduleTask[];
}

// ── Runtime ─────────────────────────────────────────────────────────────────

export class SchedulerRuntime {
	private readonly tasks = new Map<string, ScheduleTask>();
	private schedulerTimer: ReturnType<typeof setInterval> | undefined;
	private runtimeCtx: ExtensionContext | undefined;
	private dispatching = false;
	private storagePath: string | undefined;
	private readonly dispatchTimestamps: number[] = [];
	private lastRateLimitNoticeAt = 0;

	constructor(private readonly pi: ExtensionAPI) {}

	get taskCount(): number {
		return this.tasks.size;
	}

	setRuntimeContext(ctx: ExtensionContext | undefined) {
		this.runtimeCtx = ctx;
		if (!ctx?.cwd) {
			return;
		}

		const nextStorePath = getSchedulerStoragePath(ctx.cwd);
		if (nextStorePath !== this.storagePath) {
			this.storagePath = nextStorePath;
			this.migrateLegacyStore(ctx.cwd);
			this.loadTasksFromDisk();
		}
	}

	clearStatus(ctx?: ExtensionContext) {
		const target = ctx ?? this.runtimeCtx;
		if (target?.hasUI) {
			target.ui.setStatus("pi-scheduler", undefined);
		}
	}

	getSortedTasks(): ScheduleTask[] {
		return Array.from(this.tasks.values()).sort((a, b) => a.nextRunAt - b.nextRunAt);
	}

	getTask(id: string): ScheduleTask | undefined {
		return this.tasks.get(id);
	}

	setTaskEnabled(id: string, enabled: boolean): boolean {
		const task = this.tasks.get(id);
		if (!task) {
			return false;
		}
		task.enabled = enabled;
		if (enabled) {
			task.resumeRequired = false;
		} else {
			task.pending = false;
		}
		this.persistTasks();
		this.updateStatus();
		return true;
	}

	deleteTask(id: string): boolean {
		const removed = this.tasks.delete(id);
		if (removed) {
			this.persistTasks();
			this.updateStatus();
		}
		return removed;
	}

	clearTasks(): number {
		const count = this.tasks.size;
		this.tasks.clear();
		this.persistTasks();
		this.updateStatus();
		return count;
	}

	formatRelativeTime(timestamp: number): string {
		const delta = timestamp - Date.now();
		if (delta <= 0) {
			return "due now";
		}
		const mins = Math.round(delta / ONE_MINUTE);
		if (mins < 60) {
			return `in ${Math.max(mins, 1)}m`;
		}
		const hours = Math.round(mins / 60);
		if (hours < 48) {
			return `in ${hours}h`;
		}
		const days = Math.round(hours / 24);
		return `in ${days}d`;
	}

	formatTaskList(): string {
		const list = this.getSortedTasks();
		if (list.length === 0) {
			return "No scheduled tasks.";
		}

		const lines = ["Scheduled tasks:", ""];
		for (const task of list) {
			const state = this.taskStateLabel(task);
			const mode = this.taskMode(task);
			const next = `${this.formatRelativeTime(task.nextRunAt)} (${this.formatClock(task.nextRunAt)})`;
			const last = task.lastRunAt
				? `${this.formatRelativeTime(task.lastRunAt)} (${this.formatClock(task.lastRunAt)})`
				: "never";
			const status = this.taskStatusLabel(task);
			const preview = task.prompt.length > 72 ? `${task.prompt.slice(0, 69)}...` : task.prompt;
			lines.push(`${task.id}  ${state}  ${mode}  next ${next}`);
			lines.push(`  runs=${task.runCount}  last=${last}  status=${status}`);
			lines.push(`  ${preview}`);
		}
		return lines.join("\n");
	}

	addRecurringIntervalTask(prompt: string, intervalMs: number): ScheduleTask {
		const id = this.createId();
		const createdAt = Date.now();
		const safeIntervalMs = Number.isFinite(intervalMs)
			? Math.max(Math.floor(intervalMs), MIN_RECURRING_INTERVAL)
			: MIN_RECURRING_INTERVAL;
		const jitterMs = this.computeJitterMs(id, safeIntervalMs);
		const nextRunAt = createdAt + safeIntervalMs + jitterMs;
		const task: ScheduleTask = {
			id,
			prompt,
			kind: "recurring",
			enabled: true,
			createdAt,
			nextRunAt,
			intervalMs: safeIntervalMs,
			expiresAt: createdAt + THREE_DAYS,
			jitterMs,
			runCount: 0,
			pending: false,
		};
		this.tasks.set(id, task);
		this.persistTasks();
		this.updateStatus();
		return task;
	}

	addRecurringCronTask(prompt: string, cronExpression: string): ScheduleTask | undefined {
		const normalizedCron = normalizeCronExpression(cronExpression);
		if (!normalizedCron) {
			return undefined;
		}

		const id = this.createId();
		const createdAt = Date.now();
		const nextRunAt = computeNextCronRunAt(normalizedCron.expression, createdAt);
		if (!nextRunAt) {
			return undefined;
		}

		const task: ScheduleTask = {
			id,
			prompt,
			kind: "recurring",
			enabled: true,
			createdAt,
			nextRunAt,
			cronExpression: normalizedCron.expression,
			expiresAt: createdAt + THREE_DAYS,
			jitterMs: 0,
			runCount: 0,
			pending: false,
		};
		this.tasks.set(id, task);
		this.persistTasks();
		this.updateStatus();
		return task;
	}

	addOneShotTask(prompt: string, delayMs: number): ScheduleTask {
		const id = this.createId();
		const createdAt = Date.now();
		const task: ScheduleTask = {
			id,
			prompt,
			kind: "once",
			enabled: true,
			createdAt,
			nextRunAt: createdAt + delayMs,
			jitterMs: 0,
			runCount: 0,
			pending: false,
		};
		this.tasks.set(id, task);
		this.persistTasks();
		this.updateStatus();
		return task;
	}

	startScheduler() {
		if (this.schedulerTimer) {
			return;
		}
		this.schedulerTimer = setInterval(() => {
			this.tickScheduler().catch(() => {
				// Best-effort scheduler tick; errors are non-fatal.
			});
		}, 1000);
	}

	stopScheduler() {
		if (!this.schedulerTimer) {
			return;
		}
		clearInterval(this.schedulerTimer);
		this.schedulerTimer = undefined;
	}

	updateStatus() {
		if (!this.runtimeCtx?.hasUI) {
			return;
		}
		if (this.tasks.size === 0) {
			this.runtimeCtx.ui.setStatus("pi-scheduler", undefined);
			return;
		}

		const enabled = Array.from(this.tasks.values()).filter((t) => t.enabled);
		if (enabled.length === 0) {
			this.runtimeCtx.ui.setStatus("pi-scheduler", `${this.tasks.size} task${this.tasks.size === 1 ? "" : "s"} paused`);
			return;
		}

		const resumeRequired = enabled.filter((task) => task.resumeRequired);
		const scheduled = enabled.filter((task) => !task.resumeRequired);
		const parts: string[] = [];
		if (resumeRequired.length > 0) {
			parts.push(`${resumeRequired.length} due`);
		}
		if (scheduled.length > 0) {
			const nextRunAt = Math.min(...scheduled.map((task) => task.nextRunAt));
			const next = new Date(nextRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
			parts.push(`${scheduled.length} active • next ${next}`);
		}
		this.runtimeCtx.ui.setStatus("pi-scheduler", parts.join(" • ") || "paused");
	}

	private pruneDispatchHistory(now: number) {
		const cutoff = now - DISPATCH_RATE_LIMIT_WINDOW_MS;
		while (this.dispatchTimestamps.length > 0 && this.dispatchTimestamps[0] <= cutoff) {
			this.dispatchTimestamps.shift();
		}
	}

	private hasDispatchCapacity(now: number): boolean {
		this.pruneDispatchHistory(now);
		return this.dispatchTimestamps.length < MAX_DISPATCHES_PER_WINDOW;
	}

	private recordDispatch(now: number) {
		this.pruneDispatchHistory(now);
		this.dispatchTimestamps.push(now);
	}

	private notifyRateLimit(now: number) {
		if (!this.runtimeCtx?.hasUI) {
			return;
		}
		if (now - this.lastRateLimitNoticeAt < ONE_MINUTE) {
			return;
		}
		this.lastRateLimitNoticeAt = now;
		this.runtimeCtx.ui.notify(
			`Scheduler throttled: max ${MAX_DISPATCHES_PER_WINDOW} task runs per minute. Pending tasks will resume automatically.`,
			"warning",
		);
	}

	async tickScheduler() {
		if (!this.runtimeCtx) {
			return;
		}

		const now = Date.now();
		let mutated = false;

		for (const task of Array.from(this.tasks.values())) {
			if (task.kind === "recurring" && task.expiresAt && now >= task.expiresAt) {
				this.tasks.delete(task.id);
				mutated = true;
				continue;
			}

			if (!task.enabled || task.resumeRequired) {
				continue;
			}
			if (now >= task.nextRunAt) {
				task.pending = true;
			}
		}

		if (mutated) {
			this.persistTasks();
		}
		this.updateStatus();

		if (this.dispatching) {
			return;
		}
		if (!this.runtimeCtx.isIdle() || this.runtimeCtx.hasPendingMessages()) {
			return;
		}
		if (!this.hasDispatchCapacity(now)) {
			this.notifyRateLimit(now);
			return;
		}

		const nextTask = Array.from(this.tasks.values())
			.filter((task) => task.enabled && task.pending)
			.sort((a, b) => a.nextRunAt - b.nextRunAt)[0];

		if (!nextTask) {
			return;
		}

		this.dispatching = true;
		try {
			this.dispatchTask(nextTask);
		} finally {
			this.dispatching = false;
		}
	}

	async openTaskManager(ctx: ExtensionContext): Promise<void> {
		if (!ctx.hasUI) {
			this.pi.sendMessage({
				customType: "pi-scheduler",
				content: this.formatTaskList(),
				display: true,
			});
			return;
		}

		while (true) {
			const list = this.getSortedTasks();
			if (list.length === 0) {
				ctx.ui.notify("No scheduled tasks.", "info");
				return;
			}

			const options = list.map((task) => this.taskOptionLabel(task));
			options.push("+ Close");

			const selected = await ctx.ui.select("Scheduled tasks (select one)", options);
			if (!selected || selected === "+ Close") {
				return;
			}

			const taskId = selected.slice(0, 8);
			const task = this.tasks.get(taskId);
			if (!task) {
				ctx.ui.notify("Task no longer exists. Refreshing list...", "warning");
				continue;
			}

			const closed = await this.openTaskActions(ctx, task.id);
			if (closed) {
				return;
			}
		}
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: TUI flow with multiple interactive branches.
	private async openTaskActions(ctx: ExtensionContext, taskId: string): Promise<boolean> {
		while (true) {
			const task = this.tasks.get(taskId);
			if (!task) {
				ctx.ui.notify("Task no longer exists.", "warning");
				return false;
			}

			const title = `${task.id} • ${this.taskMode(task)} • next ${this.formatRelativeTime(task.nextRunAt)} (${this.formatClock(task.nextRunAt)})`;
			const options = [
				task.kind === "recurring" ? "⏱ Change schedule" : "⏱ Change reminder delay",
				task.enabled ? "Disable" : "Enable",
				"Run now",
				"🗑 Delete",
				"↩ Back",
				"✕ Close",
			];
			const action = await ctx.ui.select(title, options);

			if (!action || action === "↩ Back") {
				return false;
			}
			if (action === "✕ Close") {
				return true;
			}

			if (action === "Disable" || action === "Enable") {
				const enabled = action === "Enable";
				this.setTaskEnabled(task.id, enabled);
				ctx.ui.notify(`${enabled ? "Enabled" : "Disabled"} scheduled task ${task.id}.`, "info");
				continue;
			}

			if (action === "🗑 Delete") {
				const ok = await ctx.ui.confirm("Delete scheduled task?", `${task.id}: ${task.prompt}`);
				if (!ok) {
					continue;
				}
				this.tasks.delete(task.id);
				this.persistTasks();
				this.updateStatus();
				ctx.ui.notify(`Deleted scheduled task ${task.id}.`, "info");
				return false;
			}

			if (action === "Run now") {
				task.nextRunAt = Date.now();
				task.pending = true;
				task.resumeRequired = false;
				this.persistTasks();
				this.updateStatus();
				this.tickScheduler().catch(() => {
					// Best-effort immediate dispatch; errors are non-fatal.
				});
				ctx.ui.notify(`Queued ${task.id} to run now.`, "info");
				continue;
			}

			if (action.startsWith("⏱")) {
				await this.handleChangeSchedule(ctx, task);
			}
		}
	}

	private async handleChangeSchedule(ctx: ExtensionContext, task: ScheduleTask) {
		const defaultValue =
			task.kind === "recurring"
				? (task.cronExpression ?? formatDurationShort(task.intervalMs ?? DEFAULT_LOOP_INTERVAL))
				: formatDurationShort(Math.max(task.nextRunAt - Date.now(), ONE_MINUTE));

		const raw = await ctx.ui.input(
			task.kind === "recurring"
				? "New interval or cron (e.g. 5m or 0 */10 * * * *)"
				: "New delay from now (e.g. 30m, 2h)",
			defaultValue,
		);
		if (!raw) {
			return;
		}

		if (task.kind === "recurring") {
			const parsedDuration = parseDuration(raw);
			if (parsedDuration) {
				const normalized = normalizeDuration(parsedDuration);
				task.intervalMs = normalized.durationMs;
				task.cronExpression = undefined;
				task.jitterMs = this.computeJitterMs(task.id, normalized.durationMs);
				task.nextRunAt = Date.now() + normalized.durationMs + task.jitterMs;
				task.pending = false;
				task.resumeRequired = false;
				this.persistTasks();
				ctx.ui.notify(`Updated ${task.id} to every ${formatDurationShort(normalized.durationMs)}.`, "info");
				if (normalized.note) {
					ctx.ui.notify(normalized.note, "info");
				}
				this.updateStatus();
				return;
			}

			const normalizedCron = normalizeCronExpression(raw);
			if (!normalizedCron) {
				ctx.ui.notify(
					"Invalid input. Use interval like 5m or cron like 0 */10 * * * * (minimum cron cadence is 1m).",
					"warning",
				);
				return;
			}

			const nextRunAt = computeNextCronRunAt(normalizedCron.expression);
			if (!nextRunAt) {
				ctx.ui.notify("Could not compute next cron run time.", "warning");
				return;
			}

			task.intervalMs = undefined;
			task.cronExpression = normalizedCron.expression;
			task.jitterMs = 0;
			task.nextRunAt = nextRunAt;
			task.pending = false;
			task.resumeRequired = false;
			this.persistTasks();
			ctx.ui.notify(`Updated ${task.id} to cron ${normalizedCron.expression}.`, "info");
			if (normalizedCron.note) {
				ctx.ui.notify(normalizedCron.note, "info");
			}
			this.updateStatus();
			return;
		}

		// One-shot task: update delay
		const parsed = parseDuration(raw);
		if (!parsed) {
			ctx.ui.notify("Invalid duration. Try values like 5m, 2h, or 1 day.", "warning");
			return;
		}

		const normalized = normalizeDuration(parsed);
		task.nextRunAt = Date.now() + normalized.durationMs;
		task.pending = false;
		task.resumeRequired = false;
		this.persistTasks();
		ctx.ui.notify(`Updated ${task.id} reminder to ${this.formatRelativeTime(task.nextRunAt)}.`, "info");
		if (normalized.note) {
			ctx.ui.notify(normalized.note, "info");
		}
		this.updateStatus();
	}

	dispatchTask(task: ScheduleTask) {
		if (!task.enabled) {
			return;
		}
		const now = Date.now();
		if (!this.hasDispatchCapacity(now)) {
			task.pending = true;
			this.notifyRateLimit(now);
			return;
		}

		try {
			this.pi.sendUserMessage(task.prompt);
			this.recordDispatch(now);
		} catch {
			task.pending = true;
			task.lastStatus = "error";
			this.persistTasks();
			return;
		}

		task.pending = false;
		task.resumeRequired = false;
		task.lastRunAt = now;
		task.lastStatus = "success";
		task.runCount += 1;

		if (task.kind === "once") {
			this.tasks.delete(task.id);
			this.persistTasks();
			this.updateStatus();
			return;
		}

		if (task.cronExpression) {
			const next = computeNextCronRunAt(task.cronExpression, now + 1_000);
			if (!next) {
				this.tasks.delete(task.id);
				this.persistTasks();
				this.updateStatus();
				return;
			}
			task.nextRunAt = next;
			this.persistTasks();
			this.updateStatus();
			return;
		}

		const rawIntervalMs = task.intervalMs ?? DEFAULT_LOOP_INTERVAL;
		const intervalMs = Number.isFinite(rawIntervalMs)
			? Math.max(rawIntervalMs, MIN_RECURRING_INTERVAL)
			: DEFAULT_LOOP_INTERVAL;
		if (task.intervalMs !== intervalMs) {
			task.intervalMs = intervalMs;
		}

		let next = Number.isFinite(task.nextRunAt) ? task.nextRunAt : now + intervalMs;
		let guard = 0;
		while (next <= now && guard < 10_000) {
			next += intervalMs;
			guard += 1;
		}
		if (!Number.isFinite(next) || guard >= 10_000) {
			next = now + intervalMs;
		}

		task.nextRunAt = next;
		this.persistTasks();
		this.updateStatus();
	}

	createId(): string {
		let id = "";
		do {
			id = Math.random().toString(36).slice(2, 10);
		} while (this.tasks.has(id));
		return id;
	}

	taskMode(task: ScheduleTask): string {
		if (task.kind === "once") {
			return "once";
		}
		if (task.cronExpression) {
			return `cron ${task.cronExpression}`;
		}
		return `every ${formatDurationShort(task.intervalMs ?? DEFAULT_LOOP_INTERVAL)}`;
	}

	private taskOptionLabel(task: ScheduleTask): string {
		const state = task.resumeRequired ? "!" : task.enabled ? "+" : "-";
		return `${task.id} • ${state} ${this.taskMode(task)} • ${this.formatRelativeTime(task.nextRunAt)} • ${this.truncateText(task.prompt, 50)}`;
	}

	private truncateText(value: string, max = 64): string {
		if (value.length <= max) {
			return value;
		}
		return `${value.slice(0, Math.max(0, max - 3))}...`;
	}

	formatClock(timestamp: number): string {
		return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	}

	hashString(input: string): number {
		let hash = 2166136261;
		for (let i = 0; i < input.length; i++) {
			hash ^= input.charCodeAt(i);
			hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
		}
		return hash >>> 0;
	}

	computeJitterMs(taskId: string, intervalMs: number): number {
		const maxJitter = Math.min(Math.floor(intervalMs * 0.1), FIFTEEN_MINUTES);
		if (maxJitter <= 0) {
			return 0;
		}
		return this.hashString(taskId) % (maxJitter + 1);
	}

	private migrateLegacyStore(cwd: string) {
		if (!this.storagePath) {
			return;
		}
		const legacyPath = getLegacySchedulerStoragePath(cwd);
		if (legacyPath === this.storagePath) {
			return;
		}
		try {
			if (!fs.existsSync(legacyPath) || fs.existsSync(this.storagePath)) {
				return;
			}
			fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
			fs.copyFileSync(legacyPath, this.storagePath);
		} catch {
			// Best-effort migration; runtime can continue from either empty state or new store.
		}
	}

	private cleanupPersistedStore() {
		if (!this.storagePath) {
			return;
		}
		try {
			fs.rmSync(this.storagePath, { force: true });
		} catch {
			// Best-effort cleanup.
		}

		const schedulerRoot = getSchedulerStorageRoot();
		let currentDir = path.dirname(this.storagePath);
		while (currentDir.startsWith(schedulerRoot) && currentDir !== schedulerRoot) {
			try {
				if (!fs.existsSync(currentDir)) {
					currentDir = path.dirname(currentDir);
					continue;
				}
				const entries = fs.readdirSync(currentDir);
				if (entries.length > 0) {
					break;
				}
				fs.rmdirSync(currentDir);
				currentDir = path.dirname(currentDir);
			} catch {
				break;
			}
		}
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Deserializes backward-compatible task shapes with runtime normalization guards.
	loadTasksFromDisk() {
		if (!this.storagePath) {
			return;
		}

		this.tasks.clear();
		let mutated = false;
		try {
			if (!fs.existsSync(this.storagePath)) {
				return;
			}
			const raw = fs.readFileSync(this.storagePath, "utf-8");
			const parsed = JSON.parse(raw) as SchedulerStore;
			const list = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
			const now = Date.now();
			for (const task of list) {
				if (this.tasks.size >= MAX_TASKS) {
					mutated = true;
					break;
				}
				if (!(task?.id && task.prompt)) {
					mutated = true;
					continue;
				}

				const normalized: ScheduleTask = {
					...task,
					enabled: task.enabled ?? true,
					pending: false,
					runCount: task.runCount ?? 0,
					resumeRequired: task.resumeRequired ?? false,
				};
				if (normalized.kind === "recurring" && normalized.expiresAt && now >= normalized.expiresAt) {
					mutated = true;
					continue;
				}

				if (normalized.kind === "recurring" && normalized.cronExpression) {
					const cron = normalizeCronExpression(normalized.cronExpression);
					if (!cron) {
						mutated = true;
						continue;
					}
					if (cron.expression !== normalized.cronExpression) {
						mutated = true;
					}
					normalized.cronExpression = cron.expression;
				}

				if (normalized.kind === "recurring" && !normalized.cronExpression) {
					const rawIntervalMs = normalized.intervalMs ?? DEFAULT_LOOP_INTERVAL;
					const safeIntervalMs = Number.isFinite(rawIntervalMs)
						? Math.max(rawIntervalMs, MIN_RECURRING_INTERVAL)
						: DEFAULT_LOOP_INTERVAL;
					if (normalized.intervalMs !== safeIntervalMs) {
						mutated = true;
					}
					normalized.intervalMs = safeIntervalMs;
				}

				if (!Number.isFinite(normalized.nextRunAt)) {
					mutated = true;
					if (normalized.kind === "recurring" && normalized.cronExpression) {
						normalized.nextRunAt = computeNextCronRunAt(normalized.cronExpression, now) ?? now + DEFAULT_LOOP_INTERVAL;
					} else {
						const fallbackDelay =
							normalized.kind === "once" ? ONE_MINUTE : (normalized.intervalMs ?? DEFAULT_LOOP_INTERVAL);
						normalized.nextRunAt = now + fallbackDelay;
					}
				}
				if (normalized.enabled && normalized.nextRunAt <= now) {
					normalized.resumeRequired = true;
					mutated = true;
				}

				this.tasks.set(normalized.id, normalized);
			}
		} catch {
			// Ignore corrupted store and continue with empty in-memory state.
		}
		if (mutated) {
			this.persistTasks();
		}
		this.updateStatus();
	}

	private taskStateLabel(task: ScheduleTask): string {
		if (task.resumeRequired) {
			return "due";
		}
		return task.enabled ? "on" : "off";
	}

	private taskStatusLabel(task: ScheduleTask): string {
		if (task.resumeRequired) {
			return "resume_required";
		}
		return task.lastStatus ?? "pending";
	}

	notifyResumeRequiredTasks() {
		if (!this.runtimeCtx?.hasUI) {
			return;
		}
		const dueTasks = this.getSortedTasks().filter((task) => task.enabled && task.resumeRequired);
		if (dueTasks.length === 0) {
			return;
		}
		this.runtimeCtx.ui.notify(
			`Scheduler restored ${dueTasks.length} overdue task${dueTasks.length === 1 ? "" : "s"} from a previous session. They will not run automatically; use /schedule to review, run, reschedule, or disable them.`,
			"warning",
		);
	}

	persistTasks() {
		if (!this.storagePath) {
			return;
		}
		try {
			const tasks = this.getSortedTasks();
			if (tasks.length === 0) {
				this.cleanupPersistedStore();
				return;
			}
			fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
			const store: SchedulerStore = {
				version: 1,
				tasks,
			};
			const tempPath = `${this.storagePath}.tmp`;
			fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), "utf-8");
			fs.renameSync(tempPath, this.storagePath);
		} catch {
			// Best-effort persistence; runtime behavior should continue.
		}
	}
}

export default function schedulerExtension(pi: ExtensionAPI) {
	const runtime = new SchedulerRuntime(pi);
	registerEvents(pi, runtime);
	registerCommands(pi, runtime);
	registerTools(pi, runtime);
}
