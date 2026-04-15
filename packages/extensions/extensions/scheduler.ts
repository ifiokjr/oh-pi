/**
oh-pi Scheduler Extension

Based on pi-scheduler by @manojlds (MIT).

<!-- {=extensionsSchedulerOverview} -->

The scheduler extension adds recurring checks, one-time reminders, and the LLM-callable
`schedule_prompt` tool so pi can schedule future follow-ups like PR, CI, build, or deployment
checks. Tasks run only while pi is active and idle, and scheduler state is persisted in shared pi
storage using a workspace-mirrored path.

<!-- {/extensionsSchedulerOverview} -->

<!-- {=extensionsSchedulerOwnershipDocs} -->

The scheduler distinguishes between instance-scoped tasks and workspace-scoped tasks. Instance
scope is the default for `/loop`, `/remind`, and `schedule_prompt`, which means tasks stay owned by
one pi instance and other instances restore them for review instead of auto-running them.
Workspace scope is an explicit opt-in for shared CI/build/deploy monitors that should survive
instance changes in the same repository.

<!-- {/extensionsSchedulerOwnershipDocs} -->
*/

import { randomUUID } from "node:crypto";
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
	getSchedulerLeasePath,
	getSchedulerStoragePath,
	getSchedulerStorageRoot,
	MAX_DISPATCH_TIMESTAMPS,
	MAX_DISPATCHES_PER_WINDOW,
	MAX_TASKS,
	MIN_RECURRING_INTERVAL,
	ONE_MINUTE,
	type ResumeReason,
	SCHEDULER_LEASE_HEARTBEAT_MS,
	SCHEDULER_LEASE_STALE_AFTER_MS,
	SCHEDULER_SAFE_MODE_HEARTBEAT_MS,
	type SchedulerLease,
	type ScheduleScope,
	type ScheduleTask,
	THREE_DAYS,
} from "./scheduler-shared.js";
import { RUNTIME_DIAGNOSTICS_EVENT } from "./watchdog-runtime-diagnostics.js";

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
export type {
	ParseResult,
	RecurringSpec,
	ReminderParseResult,
	ResumeReason,
	SchedulePromptAddPlan,
	SchedulerLease,
	ScheduleScope,
	ScheduleTask,
	TaskKind,
	TaskStatus,
} from "./scheduler-shared.js";
export {
	DEFAULT_LOOP_INTERVAL,
	DISPATCH_RATE_LIMIT_WINDOW_MS,
	FIFTEEN_MINUTES,
	getLegacySchedulerStoragePath,
	getSchedulerLeasePath,
	getSchedulerStoragePath,
	getSchedulerStorageRoot,
	MAX_DISPATCH_TIMESTAMPS,
	MAX_DISPATCHES_PER_WINDOW,
	MAX_TASKS,
	MIN_RECURRING_INTERVAL,
	ONE_MINUTE,
	SCHEDULER_LEASE_HEARTBEAT_MS,
	SCHEDULER_LEASE_STALE_AFTER_MS,
	SCHEDULER_SAFE_MODE_HEARTBEAT_MS,
	THREE_DAYS,
};

interface SchedulerStore {
	version: 1;
	tasks: ScheduleTask[];
}

type SchedulerDispatchMode = "auto" | "observer";

type TaskMutationResult = {
	count: number;
	otherCount?: number;
	legacyCount?: number;
	error?: string;
};

type CompletionOptions = {
	continueUntilComplete?: boolean;
	completionSignal?: string;
	retryIntervalMs?: number;
	maxAttempts?: number;
};

// ── Runtime ─────────────────────────────────────────────────────────────────

export class SchedulerRuntime {
	private readonly tasks = new Map<string, ScheduleTask>();
	private schedulerTimer: ReturnType<typeof setInterval> | undefined;
	private runtimeCtx: ExtensionContext | undefined;
	private dispatching = false;
	private storagePath: string | undefined;
	private leasePath: string | undefined;
	private readonly dispatchTimestamps: number[] = [];
	private lastRateLimitNoticeAt = 0;
	private readonly instanceId = randomUUID().slice(0, 12);
	private sessionId: string | null = null;
	private dispatchMode: SchedulerDispatchMode = "auto";
	private startupOwnershipHandled = false;
	private safeModeEnabled = false;
	private awaitingTaskId: string | null = null;

	constructor(private readonly pi: ExtensionAPI) {}

	get taskCount(): number {
		return this.tasks.size;
	}

	get currentInstanceId(): string {
		return this.instanceId;
	}

	get isSafeModeActive(): boolean {
		return this.safeModeEnabled;
	}

	setSafeModeEnabled(enabled: boolean) {
		if (this.safeModeEnabled === enabled) {
			return;
		}
		this.safeModeEnabled = enabled;

		if (enabled && this.runtimeCtx?.hasUI) {
			this.runtimeCtx.ui.setStatus("pi-scheduler", undefined);
			this.runtimeCtx.ui.setStatus("pi-scheduler-stale", undefined);
		}

		// Restart the scheduler timer with the appropriate interval.
		if (this.schedulerTimer) {
			this.restartSchedulerTimer();
		}

		// Restore status when leaving safe mode.
		if (!enabled) {
			this.updateStatus();
		}
	}

	setRuntimeContext(ctx: ExtensionContext | undefined) {
		this.runtimeCtx = ctx;
		this.sessionId = this.getSessionId(ctx);
		if (!ctx?.cwd) {
			return;
		}

		const nextStorePath = getSchedulerStoragePath(ctx.cwd);
		const nextLeasePath = getSchedulerLeasePath(ctx.cwd);
		if (nextStorePath !== this.storagePath || nextLeasePath !== this.leasePath) {
			this.releaseLeaseIfOwned();
			this.storagePath = nextStorePath;
			this.leasePath = nextLeasePath;
			this.dispatchMode = "auto";
			this.startupOwnershipHandled = false;
			this.migrateLegacyStore(ctx.cwd);
			this.loadTasksFromDisk();
			return;
		}

		this.reconcileTaskOwnership();
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
		if (!enabled) {
			task.pending = false;
			task.awaitingCompletion = false;
			if (this.awaitingTaskId === task.id) {
				this.awaitingTaskId = null;
			}
		}
		if (enabled && task.resumeReason === "overdue") {
			task.resumeRequired = false;
			task.resumeReason = undefined;
		}
		this.reconcileTaskOwnership();
		this.persistTasks();
		this.updateStatus();
		return true;
	}

	deleteTask(id: string): boolean {
		const removed = this.tasks.delete(id);
		if (removed) {
			if (this.awaitingTaskId === id) {
				this.awaitingTaskId = null;
			}
			this.persistTasks();
			this.updateStatus();
		}
		return removed;
	}

	clearTasks(): number {
		const count = this.tasks.size;
		this.tasks.clear();
		this.awaitingTaskId = null;
		this.persistTasks();
		this.updateStatus();
		return count;
	}

	clearTasksNotCreatedHere(): TaskMutationResult {
		let count = 0;
		let otherCount = 0;
		let legacyCount = 0;

		for (const task of Array.from(this.tasks.values())) {
			const origin = this.getTaskCreatorOrigin(task);
			if (origin === "current") {
				continue;
			}

			this.tasks.delete(task.id);
			count += 1;

			if (origin === "other") {
				otherCount += 1;
			} else {
				legacyCount += 1;
			}
		}

		if (count > 0) {
			this.persistTasks();
			this.updateStatus();
		}

		return { count, otherCount, legacyCount };
	}

	adoptTasks(target = "all"): TaskMutationResult {
		const matching = this.resolveTaskTargets(target, (task) => task.ownerInstanceId !== this.instanceId);
		if (matching.error) {
			return { count: 0, error: matching.error };
		}
		for (const task of matching.tasks) {
			this.assignOwner(task, task.scope ?? "instance");
		}
		this.reconcileTaskOwnership();
		this.persistTasks();
		this.updateStatus();
		return { count: matching.tasks.length };
	}

	releaseTasks(target = "all"): TaskMutationResult {
		const matching = this.resolveTaskTargets(target, (task) => task.ownerInstanceId === this.instanceId);
		if (matching.error) {
			return { count: 0, error: matching.error };
		}
		for (const task of matching.tasks) {
			task.ownerInstanceId = undefined;
			task.ownerSessionId = undefined;
			task.pending = false;
			task.resumeRequired = true;
			task.resumeReason = "released";
		}
		this.reconcileTaskOwnership();
		this.persistTasks();
		this.updateStatus();
		return { count: matching.tasks.length };
	}

	clearForeignTasks(): TaskMutationResult {
		let count = 0;
		for (const task of Array.from(this.tasks.values())) {
			if (task.ownerInstanceId && task.ownerInstanceId !== this.instanceId) {
				this.tasks.delete(task.id);
				count += 1;
			}
		}
		if (count > 0) {
			this.persistTasks();
			this.updateStatus();
		}
		return { count };
	}

	disableForeignTasks(): TaskMutationResult {
		let count = 0;
		for (const task of this.tasks.values()) {
			if (task.ownerInstanceId && task.ownerInstanceId !== this.instanceId) {
				task.enabled = false;
				task.pending = false;
				count += 1;
			}
		}
		if (count > 0) {
			this.reconcileTaskOwnership();
			this.persistTasks();
			this.updateStatus();
		}
		return { count };
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

		const lines = [`Scheduled tasks for ${this.getWorkspaceLabel()}:`, ""];
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
			lines.push(
				`  creator=${this.taskCreatorLabel(task)}  owner=${this.taskOwnerLabel(task)}  runs=${task.runCount}  last=${last}  status=${status}`,
			);
			if (task.lastOutcomeSnippet) {
				lines.push(`  outcome=${this.truncateText(task.lastOutcomeSnippet, 72)}`);
			}
			lines.push(`  ${preview}`);
		}
		return lines.join("\n");
	}

	addRecurringIntervalTask(
		prompt: string,
		intervalMs: number,
		options: { scope?: ScheduleScope } & CompletionOptions = {},
	): ScheduleTask {
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
			scope: options.scope ?? "instance",
			enabled: true,
			createdAt,
			nextRunAt,
			intervalMs: safeIntervalMs,
			expiresAt: createdAt + THREE_DAYS,
			jitterMs,
			runCount: 0,
			pending: false,
			continueUntilComplete: options.continueUntilComplete ?? false,
			completionSignal: options.completionSignal?.trim() || undefined,
			retryIntervalMs: options.retryIntervalMs,
			maxAttempts: options.maxAttempts,
			awaitingCompletion: false,
		};
		this.assignCreator(task);
		this.assignOwner(task, task.scope ?? "instance");
		this.tasks.set(id, task);
		this.persistTasks();
		this.updateStatus();
		return task;
	}

	addRecurringCronTask(
		prompt: string,
		cronExpression: string,
		options: { scope?: ScheduleScope } & CompletionOptions = {},
	): ScheduleTask | undefined {
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
			scope: options.scope ?? "instance",
			enabled: true,
			createdAt,
			nextRunAt,
			cronExpression: normalizedCron.expression,
			expiresAt: createdAt + THREE_DAYS,
			jitterMs: 0,
			runCount: 0,
			pending: false,
			continueUntilComplete: options.continueUntilComplete ?? false,
			completionSignal: options.completionSignal?.trim() || undefined,
			retryIntervalMs: options.retryIntervalMs,
			maxAttempts: options.maxAttempts,
			awaitingCompletion: false,
		};
		this.assignCreator(task);
		this.assignOwner(task, task.scope ?? "instance");
		this.tasks.set(id, task);
		this.persistTasks();
		this.updateStatus();
		return task;
	}

	addOneShotTask(
		prompt: string,
		delayMs: number,
		options: { scope?: ScheduleScope } & CompletionOptions = {},
	): ScheduleTask {
		const id = this.createId();
		const createdAt = Date.now();
		const task: ScheduleTask = {
			id,
			prompt,
			kind: "once",
			scope: options.scope ?? "instance",
			enabled: true,
			createdAt,
			nextRunAt: createdAt + delayMs,
			jitterMs: 0,
			runCount: 0,
			pending: false,
			continueUntilComplete: options.continueUntilComplete ?? false,
			completionSignal: options.completionSignal?.trim() || undefined,
			retryIntervalMs: options.retryIntervalMs,
			maxAttempts: options.maxAttempts,
			awaitingCompletion: false,
		};
		this.assignCreator(task);
		this.assignOwner(task, task.scope ?? "instance");
		this.tasks.set(id, task);
		this.persistTasks();
		this.updateStatus();
		return task;
	}

	startScheduler() {
		if (this.schedulerTimer) {
			return;
		}
		const intervalMs = this.safeModeEnabled ? SCHEDULER_SAFE_MODE_HEARTBEAT_MS : SCHEDULER_LEASE_HEARTBEAT_MS;
		this.schedulerTimer = setInterval(() => {
			this.tickScheduler().catch(() => {
				// Best-effort scheduler tick; errors are non-fatal.
			});
		}, intervalMs);
		this.schedulerTimer.unref?.();
	}

	stopScheduler() {
		if (this.schedulerTimer) {
			clearInterval(this.schedulerTimer);
			this.schedulerTimer = undefined;
		}
		this.dispatchTimestamps.length = 0;
		this.releaseLeaseIfOwned();
	}

	private restartSchedulerTimer() {
		if (!this.schedulerTimer) {
			return;
		}
		clearInterval(this.schedulerTimer);
		this.schedulerTimer = undefined;
		this.startScheduler();
	}

	private emitRuntimeDiagnostics(note?: string) {
		const enabledTasks = Array.from(this.tasks.values()).filter((task) => task.enabled);
		const dueTasks = enabledTasks.filter((task) => task.resumeRequired || task.pending).length;
		this.pi.events.emit(RUNTIME_DIAGNOSTICS_EVENT, {
			extensionId: "scheduler",
			pendingTasks: this.tasks.size,
			activeTasks: enabledTasks.length,
			dueTasks,
			mode: this.dispatchMode,
			note,
		});
	}

	updateStatus() {
		this.emitRuntimeDiagnostics();
		if (!this.runtimeCtx?.hasUI) {
			return;
		}
		// In safe mode, suppress all status bar updates to reduce UI churn.
		if (this.safeModeEnabled) {
			this.runtimeCtx.ui.setStatus("pi-scheduler", undefined);
			this.runtimeCtx.ui.setStatus("pi-scheduler-stale", undefined);
			return;
		}
		// Clear the stale-task status hint when no tasks need review.
		const staleCount = Array.from(this.tasks.values()).filter((t) => t.enabled && t.resumeRequired).length;
		if (staleCount === 0) {
			this.runtimeCtx.ui.setStatus("pi-scheduler-stale", undefined);
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
		const leaseStatus = this.getLeaseStatus();
		const parts: string[] = [];
		if (leaseStatus.activeForeign && this.dispatchMode === "observer") {
			parts.push("observing other instance");
		}
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
		// Find the first index that is still within the window to avoid O(n) shift() calls.
		let firstValid = 0;
		while (firstValid < this.dispatchTimestamps.length && this.dispatchTimestamps[firstValid] <= cutoff) {
			firstValid++;
		}
		if (firstValid > 0) {
			this.dispatchTimestamps.splice(0, firstValid);
		}
		// Hard cap to prevent unbounded growth from clock anomalies.
		if (this.dispatchTimestamps.length > MAX_DISPATCH_TIMESTAMPS) {
			this.dispatchTimestamps.splice(0, this.dispatchTimestamps.length - MAX_DISPATCH_TIMESTAMPS);
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
		// Suppress toast notifications in safe mode.
		if (this.safeModeEnabled) {
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
		let mutated = this.reconcileTaskOwnership();

		for (const task of Array.from(this.tasks.values())) {
			if (task.kind === "recurring" && task.expiresAt && now >= task.expiresAt) {
				this.tasks.delete(task.id);
				mutated = true;
				continue;
			}

			if (!task.enabled || task.resumeRequired || task.awaitingCompletion) {
				continue;
			}
			if (now >= task.nextRunAt) {
				task.pending = true;
			}
		}

		const shouldHoldLease = this.hasManagedTasksForLease();
		if (shouldHoldLease) {
			// Refresh the lease heartbeat unconditionally so other instances see this
			// instance as alive even when pi is busy and not dispatching tasks. Without
			// this, the lease goes stale after SCHEDULER_LEASE_STALE_AFTER_MS when the
			// agent is processing messages, causing newer instances to grab the lease
			// and mark this instance's tasks as stale_owner.
			this.refreshLeaseHeartbeat(now);
		} else {
			this.releaseLeaseIfOwned();
		}

		if (mutated) {
			this.persistTasks();
		}
		this.updateStatus();

		if (!shouldHoldLease) {
			return;
		}
		if (this.dispatching) {
			return;
		}
		if (!this.runtimeCtx.isIdle() || this.runtimeCtx.hasPendingMessages()) {
			return;
		}
		if (!this.hasDispatchCapacity(now)) {
			this.emitRuntimeDiagnostics("dispatch throttled");
			this.notifyRateLimit(now);
			return;
		}

		const leaseStatus = this.ensureDispatchLease(now);
		if (!leaseStatus.canDispatch) {
			this.updateStatus();
			return;
		}

		const nextTask = Array.from(this.tasks.values())
			.filter(
				(task) => task.enabled && task.pending && !task.awaitingCompletion && this.canCurrentInstanceDispatchTask(task),
			)
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

	async handleStartupOwnership(ctx: ExtensionContext): Promise<void> {
		if (this.startupOwnershipHandled) {
			return;
		}
		this.startupOwnershipHandled = true;
		const leaseStatus = this.getLeaseStatus();
		if (!leaseStatus.activeForeign || this.tasks.size === 0) {
			this.dispatchMode = "auto";
			return;
		}

		this.dispatchMode = "observer";
		if (!ctx.hasUI) {
			return;
		}

		const foreignTaskCount = this.getForeignTaskCount();
		const option = await ctx.ui.select("Another pi instance is managing scheduled tasks for this workspace.", [
			"Leave tasks in the other instance",
			"Review tasks",
			`Take over scheduler and adopt foreign tasks${foreignTaskCount > 0 ? ` (${foreignTaskCount})` : ""}`,
			`Disable foreign tasks${foreignTaskCount > 0 ? ` (${foreignTaskCount})` : ""}`,
			`Clear foreign tasks${foreignTaskCount > 0 ? ` (${foreignTaskCount})` : ""}`,
		]);

		switch (option) {
			case "Review tasks":
				await this.openTaskManager(ctx);
				break;
			case `Take over scheduler and adopt foreign tasks${foreignTaskCount > 0 ? ` (${foreignTaskCount})` : ""}`: {
				const adopted = this.takeOverScheduler(true);
				ctx.ui.notify(
					`Scheduler ownership moved to this instance.${adopted > 0 ? ` Adopted ${adopted} task${adopted === 1 ? "" : "s"}.` : ""}`,
					"warning",
				);
				break;
			}
			case `Disable foreign tasks${foreignTaskCount > 0 ? ` (${foreignTaskCount})` : ""}`: {
				const result = this.disableForeignTasks();
				ctx.ui.notify(`Disabled ${result.count} foreign task${result.count === 1 ? "" : "s"}.`, "warning");
				break;
			}
			case `Clear foreign tasks${foreignTaskCount > 0 ? ` (${foreignTaskCount})` : ""}`: {
				const result = this.clearForeignTasks();
				ctx.ui.notify(`Cleared ${result.count} foreign task${result.count === 1 ? "" : "s"}.`, "warning");
				break;
			}
			default:
				ctx.ui.notify("This instance will observe scheduler tasks without dispatching them.", "info");
		}

		this.updateStatus();
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

			const otherTasks = this.getTasksNotCreatedHere();
			const clearOtherLabel =
				otherTasks.length > 0 ? `🧹 Clear tasks not created here (${otherTasks.length})` : undefined;
			const options = this.buildTaskManagerOptions(list, clearOtherLabel);
			const selected = await ctx.ui.select(`Scheduled tasks for ${this.getWorkspaceLabel(ctx)} (select one)`, options);
			const selection = await this.handleTaskManagerSelection(ctx, selected, list, otherTasks, clearOtherLabel);
			if (selection === "close") {
				return;
			}
			if (selection === "refresh") {
				continue;
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

	private buildTaskManagerOptions(list: ScheduleTask[], clearOtherLabel?: string): string[] {
		const options = list.map((task) => this.taskOptionLabel(task));
		if (clearOtherLabel) {
			options.push(clearOtherLabel);
		}
		options.push("🗑 Clear all");
		options.push("+ Close");
		return options;
	}

	private async handleTaskManagerSelection(
		ctx: ExtensionContext,
		selected: string | null,
		list: ScheduleTask[],
		otherTasks: ScheduleTask[],
		clearOtherLabel?: string,
	): Promise<"open-task" | "refresh" | "close"> {
		if (!selected || selected === "+ Close") {
			return "close";
		}

		if (clearOtherLabel && selected === clearOtherLabel) {
			const ok = await ctx.ui.confirm(
				"Clear tasks not created here?",
				this.describeExternalCreatorClear(otherTasks, ctx),
			);
			if (!ok) {
				return "refresh";
			}
			const result = this.clearTasksNotCreatedHere();
			ctx.ui.notify(
				`Cleared ${result.count} scheduled task${result.count === 1 ? "" : "s"} not created in this instance.`,
				"info",
			);
			return "refresh";
		}

		if (selected === "🗑 Clear all") {
			const count = list.length;
			const ok = await ctx.ui.confirm(
				"Clear all scheduled tasks?",
				`Delete ${count} scheduled task${count === 1 ? "" : "s"} for ${this.getWorkspaceLabel(ctx)}?`,
			);
			if (!ok) {
				return "refresh";
			}
			this.clearTasks();
			ctx.ui.notify(`Cleared ${count} scheduled task${count === 1 ? "" : "s"}.`, "info");
			return "close";
		}

		return "open-task";
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: TUI flow with multiple interactive branches.
	private async openTaskActions(ctx: ExtensionContext, taskId: string): Promise<boolean> {
		while (true) {
			const task = this.tasks.get(taskId);
			if (!task) {
				ctx.ui.notify("Task no longer exists.", "warning");
				return false;
			}

			const createdHere = this.wasCreatedHere(task);
			const deleteLabel = createdHere ? "🗑 Delete" : "🧹 Clear (not created here)";
			const title = [
				`${task.id} • ${this.taskMode(task)} • next ${this.formatRelativeTime(task.nextRunAt)} (${this.formatClock(task.nextRunAt)})`,
				`Workspace: ${this.getWorkspaceLabel(ctx)}`,
				`Created by: ${this.taskCreatorLabel(task)}`,
				`Owner: ${this.taskOwnerLabel(task)}`,
				`Prompt: ${task.prompt}`,
			].join("\n");
			const options = [
				task.kind === "recurring" ? "⏱ Change schedule" : "⏱ Change reminder delay",
				task.enabled ? "Disable" : "Enable",
				"Run now",
				"Adopt",
				"Release",
				deleteLabel,
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

			if (action === "Adopt") {
				const result = this.adoptTasks(task.id);
				if (result.error) {
					ctx.ui.notify(result.error, "warning");
				} else {
					ctx.ui.notify(`Adopted ${task.id}.`, "info");
				}
				continue;
			}

			if (action === "Release") {
				const result = this.releaseTasks(task.id);
				if (result.error) {
					ctx.ui.notify(result.error, "warning");
				} else {
					ctx.ui.notify(`Released ${task.id}.`, "info");
				}
				continue;
			}

			if (action === deleteLabel) {
				const ok = await ctx.ui.confirm(
					createdHere ? "Delete scheduled task?" : "Clear task not created here?",
					`${task.id}: ${task.prompt}`,
				);
				if (!ok) {
					continue;
				}
				this.tasks.delete(task.id);
				this.persistTasks();
				this.updateStatus();
				ctx.ui.notify(
					createdHere
						? `Deleted scheduled task ${task.id}.`
						: `Cleared scheduled task ${task.id} because it was not created in this instance.`,
					"info",
				);
				return false;
			}

			if (action === "Run now") {
				task.nextRunAt = Date.now();
				task.pending = true;
				task.resumeRequired = false;
				task.resumeReason = undefined;
				this.reconcileTaskOwnership();
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
				task.resumeReason = undefined;
				this.reconcileTaskOwnership();
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
			task.resumeReason = undefined;
			this.reconcileTaskOwnership();
			this.persistTasks();
			ctx.ui.notify(`Updated ${task.id} to cron ${normalizedCron.expression}.`, "info");
			if (normalizedCron.note) {
				ctx.ui.notify(normalizedCron.note, "info");
			}
			this.updateStatus();
			return;
		}

		const parsed = parseDuration(raw);
		if (!parsed) {
			ctx.ui.notify("Invalid duration. Try values like 5m, 2h, or 1 day.", "warning");
			return;
		}

		const normalized = normalizeDuration(parsed);
		task.nextRunAt = Date.now() + normalized.durationMs;
		task.pending = false;
		task.resumeRequired = false;
		task.resumeReason = undefined;
		this.reconcileTaskOwnership();
		this.persistTasks();
		ctx.ui.notify(`Updated ${task.id} reminder to ${this.formatRelativeTime(task.nextRunAt)}.`, "info");
		if (normalized.note) {
			ctx.ui.notify(normalized.note, "info");
		}
		this.updateStatus();
	}

	dispatchTask(task: ScheduleTask) {
		if (!(task.enabled && this.canCurrentInstanceDispatchTask(task))) {
			return;
		}
		const now = Date.now();
		if (!this.hasDispatchCapacity(now)) {
			task.pending = true;
			this.emitRuntimeDiagnostics("dispatch throttled");
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
		task.resumeReason = undefined;
		task.lastRunAt = now;
		task.runCount += 1;

		if (task.continueUntilComplete) {
			task.awaitingCompletion = true;
			task.lastStatus = "pending";
			this.awaitingTaskId = task.id;
			this.persistTasks();
			this.updateStatus();
			return;
		}

		task.lastStatus = "success";
		if (task.kind === "once") {
			this.tasks.delete(task.id);
			this.persistTasks();
			this.updateStatus();
			return;
		}

		this.scheduleRecurringNextRun(task, now);
		this.persistTasks();
		this.updateStatus();
	}

	handleAgentEnd(event: { messages?: Array<{ role?: string; content?: unknown }> }) {
		if (!this.awaitingTaskId) {
			return;
		}

		const task = this.tasks.get(this.awaitingTaskId);
		this.awaitingTaskId = null;
		if (!task?.continueUntilComplete) {
			return;
		}

		task.awaitingCompletion = false;
		const now = Date.now();
		const latestAssistantText = this.extractLatestAssistantText(event.messages ?? []);
		task.lastOutcomeSnippet = latestAssistantText.slice(0, 220) || undefined;

		const completed = this.isCompletionDetected(task, latestAssistantText);
		if (completed) {
			task.lastStatus = "success";
			if (task.kind === "once") {
				this.tasks.delete(task.id);
			} else {
				this.scheduleRecurringNextRun(task, now);
			}
			this.persistTasks();
			this.updateStatus();
			return;
		}

		const maxAttempts = task.maxAttempts;
		if (Number.isFinite(maxAttempts) && (task.runCount ?? 0) >= (maxAttempts ?? 0)) {
			task.enabled = false;
			task.lastStatus = "error";
			task.pending = false;
			task.nextRunAt = now + (task.retryIntervalMs ?? ONE_MINUTE);
			if (this.runtimeCtx?.hasUI && !this.safeModeEnabled) {
				this.runtimeCtx.ui.notify(
					`Scheduler task ${task.id} paused after ${task.runCount} attempt${task.runCount === 1 ? "" : "s"} without completion.`,
					"warning",
				);
			}
			this.persistTasks();
			this.updateStatus();
			return;
		}

		task.lastStatus = "pending";
		task.pending = false;
		task.nextRunAt = now + (task.retryIntervalMs ?? task.intervalMs ?? ONE_MINUTE);
		this.persistTasks();
		this.updateStatus();
	}

	private extractLatestAssistantText(messages: Array<{ role?: string; content?: unknown }>): string {
		for (let i = messages.length - 1; i >= 0; i--) {
			const message = messages[i];
			if (message?.role !== "assistant") {
				continue;
			}
			const content = message.content;
			if (typeof content === "string") {
				return content.trim();
			}
			if (Array.isArray(content)) {
				return content
					.map((item) =>
						typeof item === "object" && item && "text" in item && typeof item.text === "string" ? item.text : "",
					)
					.join(" ")
					.trim();
			}
		}
		return "";
	}

	private isCompletionDetected(task: ScheduleTask, assistantText: string): boolean {
		const text = assistantText.trim();
		if (!text) {
			return false;
		}

		const signal = task.completionSignal?.trim();
		if (signal) {
			const regexMatch = signal.match(/^\/(.*)\/([gimsuy]*)$/);
			if (regexMatch) {
				try {
					return new RegExp(regexMatch[1], regexMatch[2]).test(text);
				} catch {
					// Ignore invalid regex and fall back to substring matching.
				}
			}
			if (text.toLowerCase().includes(signal.toLowerCase())) {
				return true;
			}
		}

		const lower = text.toLowerCase();
		if (
			lower.includes("not complete") ||
			lower.includes("still running") ||
			lower.includes("in progress") ||
			lower.includes("pending")
		) {
			return false;
		}

		return (
			lower.includes("task complete") ||
			lower.includes("completed") ||
			lower.includes("finished") ||
			lower.includes("done") ||
			lower.includes("resolved") ||
			lower.includes("success")
		);
	}

	private scheduleRecurringNextRun(task: ScheduleTask, now: number) {
		if (task.kind === "once") {
			return;
		}

		if (task.cronExpression) {
			const next = computeNextCronRunAt(task.cronExpression, now + 1_000);
			if (!next) {
				this.tasks.delete(task.id);
				return;
			}
			task.nextRunAt = next;
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
	}

	createId(): string {
		let id = "";
		do {
			id = Math.random().toString(36).slice(2, 10);
		} while (this.tasks.has(id));
		return id;
	}

	taskMode(task: ScheduleTask): string {
		const base =
			task.kind === "once"
				? "once"
				: task.cronExpression
					? `cron ${task.cronExpression}`
					: `every ${formatDurationShort(task.intervalMs ?? DEFAULT_LOOP_INTERVAL)}`;
		return task.continueUntilComplete ? `${base} until-complete` : base;
	}

	private taskOptionLabel(task: ScheduleTask): string {
		const origin = this.taskCreatorShortLabel(task);
		const state = task.resumeRequired ? `! ${task.resumeReason ?? "review"}` : task.enabled ? "+" : "-";
		return `${task.id} • ${origin} • ${state} [${task.scope ?? "instance"}] ${this.taskMode(task)} • ${this.formatRelativeTime(task.nextRunAt)} • ${this.truncateText(task.prompt, 50)}`;
	}

	private getWorkspaceLabel(ctx?: ExtensionContext): string {
		return ctx?.cwd ?? this.runtimeCtx?.cwd ?? "(unknown workspace)";
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

	private getSessionId(ctx: ExtensionContext | undefined): string | null {
		try {
			return ctx?.sessionManager?.getSessionFile?.() ?? null;
		} catch {
			return null;
		}
	}

	private assignCreator(task: ScheduleTask) {
		task.creatorInstanceId = this.instanceId;
		task.creatorSessionId = this.sessionId;
	}

	private assignOwner(task: ScheduleTask, scope: ScheduleScope) {
		task.scope = scope;
		task.ownerInstanceId = this.instanceId;
		task.ownerSessionId = this.sessionId;
		task.resumeRequired = false;
		task.resumeReason = undefined;
	}

	private resolveTaskTargets(
		target: string,
		predicate?: (task: ScheduleTask) => boolean,
	): { tasks: ScheduleTask[]; error?: undefined } | { tasks: ScheduleTask[]; error: string } {
		if (target === "all") {
			const tasks = this.getSortedTasks().filter((task) => predicate?.(task) ?? true);
			return { tasks };
		}
		const task = this.tasks.get(target);
		if (!task) {
			return { tasks: [], error: `Task not found: ${target}` };
		}
		if (predicate && !predicate(task)) {
			return { tasks: [], error: `Task ${target} is not eligible for that operation.` };
		}
		return { tasks: [task] };
	}

	private getForeignTaskCount(): number {
		return Array.from(this.tasks.values()).filter(
			(task) => task.ownerInstanceId && task.ownerInstanceId !== this.instanceId,
		).length;
	}

	private getTasksNotCreatedHere(): ScheduleTask[] {
		return this.getSortedTasks().filter((task) => !this.wasCreatedHere(task));
	}

	private hasManagedTasksForLease(): boolean {
		return Array.from(this.tasks.values()).some((task) => task.enabled && !task.resumeRequired);
	}

	private readLease(): SchedulerLease | undefined {
		if (!this.leasePath) {
			return undefined;
		}
		try {
			if (!fs.existsSync(this.leasePath)) {
				return undefined;
			}
			const raw = fs.readFileSync(this.leasePath, "utf-8");
			const parsed = JSON.parse(raw) as SchedulerLease;
			if (!(parsed?.instanceId && Number.isFinite(parsed?.heartbeatAt))) {
				return undefined;
			}
			return parsed;
		} catch {
			return undefined;
		}
	}

	private isLeaseFresh(lease: SchedulerLease | undefined, now = Date.now()): boolean {
		if (!lease) {
			return false;
		}
		return now - lease.heartbeatAt < SCHEDULER_LEASE_STALE_AFTER_MS;
	}

	private getLeaseStatus(now = Date.now()): {
		lease?: SchedulerLease;
		ownedByCurrent: boolean;
		activeForeign: boolean;
	} {
		const lease = this.readLease();
		const ownedByCurrent = Boolean(lease && lease.instanceId === this.instanceId && this.isLeaseFresh(lease, now));
		const activeForeign = Boolean(lease && lease.instanceId !== this.instanceId && this.isLeaseFresh(lease, now));
		return { lease, ownedByCurrent, activeForeign };
	}

	private writeLease(now = Date.now(), force = false): boolean {
		if (!(this.leasePath && this.runtimeCtx?.cwd)) {
			return false;
		}
		try {
			const current = this.readLease();
			if (!force && current && current.instanceId !== this.instanceId && this.isLeaseFresh(current, now)) {
				return false;
			}
			const lease: SchedulerLease = {
				version: 1,
				instanceId: this.instanceId,
				sessionId: this.sessionId,
				pid: process.pid,
				cwd: this.runtimeCtx.cwd,
				heartbeatAt: now,
			};
			fs.mkdirSync(path.dirname(this.leasePath), { recursive: true });
			const tempPath = `${this.leasePath}.tmp`;
			fs.writeFileSync(tempPath, JSON.stringify(lease, null, 2), "utf-8");
			fs.renameSync(tempPath, this.leasePath);
			const confirmed = this.readLease();
			return confirmed ? confirmed.instanceId === this.instanceId : true;
		} catch {
			return false;
		}
	}

	private releaseLeaseIfOwned() {
		if (!this.leasePath) {
			return;
		}
		try {
			const lease = this.readLease();
			if (lease?.instanceId !== this.instanceId) {
				return;
			}
			fs.rmSync(this.leasePath, { force: true });
		} catch {
			// Best-effort cleanup.
		}
	}

	private refreshLeaseHeartbeat(now = Date.now()) {
		if (this.dispatchMode === "observer") {
			return;
		}
		const status = this.getLeaseStatus(now);
		// Only refresh if we already own the lease. Don't acquire or fight over it.
		if (status.ownedByCurrent) {
			this.writeLease(now, true);
		}
	}

	private ensureDispatchLease(now = Date.now()): { canDispatch: boolean } {
		if (this.dispatchMode === "observer") {
			return { canDispatch: false };
		}
		const status = this.getLeaseStatus(now);
		if (status.ownedByCurrent) {
			return { canDispatch: this.writeLease(now, true) };
		}
		if (status.activeForeign) {
			return { canDispatch: false };
		}
		return { canDispatch: this.writeLease(now) };
	}

	private takeOverScheduler(adoptForeignTasks: boolean): number {
		this.dispatchMode = "auto";
		this.writeLease(Date.now(), true);
		if (!adoptForeignTasks) {
			return 0;
		}
		let count = 0;
		for (const task of this.tasks.values()) {
			if (task.ownerInstanceId && task.ownerInstanceId !== this.instanceId) {
				this.assignOwner(task, task.scope ?? "instance");
				count += 1;
			}
		}
		this.reconcileTaskOwnership();
		this.persistTasks();
		this.updateStatus();
		return count;
	}

	private canCurrentInstanceDispatchTask(task: ScheduleTask): boolean {
		if (!(task.enabled && !task.resumeRequired)) {
			return false;
		}
		if ((task.scope ?? "instance") === "workspace") {
			return true;
		}
		return task.ownerInstanceId === this.instanceId;
	}

	private normalizeTaskScope(task: ScheduleTask): boolean {
		if (task.scope) {
			return false;
		}
		task.scope = task.kind === "once" ? "instance" : "workspace";
		return true;
	}

	private getTaskRestriction(
		task: ScheduleTask,
		leaseStatus: ReturnType<SchedulerRuntime["getLeaseStatus"]>,
		legacyTask: boolean,
	): ResumeReason | null {
		if (legacyTask) {
			return "legacy_unowned";
		}
		if ((task.scope ?? "instance") !== "instance") {
			return null;
		}
		if (!task.ownerInstanceId) {
			return task.resumeReason === "released" ? "released" : "legacy_unowned";
		}
		if (task.ownerInstanceId === this.instanceId) {
			return null;
		}
		return leaseStatus.activeForeign && leaseStatus.lease?.instanceId === task.ownerInstanceId
			? "foreign_owner"
			: "stale_owner";
	}

	private markTaskForReview(task: ScheduleTask, reason: ResumeReason): boolean {
		if (task.resumeRequired && task.resumeReason === reason && !task.pending) {
			return false;
		}
		task.resumeRequired = true;
		task.resumeReason = reason;
		task.pending = false;
		return true;
	}

	private clearTaskReviewState(task: ScheduleTask): boolean {
		if (!(task.resumeRequired || task.resumeReason)) {
			return false;
		}
		task.resumeRequired = false;
		task.resumeReason = undefined;
		return true;
	}

	private reconcileTaskOwnership(): boolean {
		const leaseStatus = this.getLeaseStatus(Date.now());
		let mutated = false;

		for (const task of this.tasks.values()) {
			const legacyTask = task.scope === undefined && task.ownerInstanceId === undefined;
			mutated = this.normalizeTaskScope(task) || mutated;

			const restriction = this.getTaskRestriction(task, leaseStatus, legacyTask);
			if (restriction) {
				mutated = this.markTaskForReview(task, restriction) || mutated;
				continue;
			}

			if (task.resumeReason === "overdue") {
				continue;
			}

			if (task.resumeRequired || task.resumeReason) {
				mutated = this.clearTaskReviewState(task) || mutated;
			}
		}

		return mutated;
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
		this.releaseLeaseIfOwned();

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
					scope: task.scope,
					enabled: task.enabled ?? true,
					pending: false,
					runCount: task.runCount ?? 0,
					resumeRequired: task.resumeRequired ?? false,
					resumeReason: task.resumeReason,
					continueUntilComplete: task.continueUntilComplete ?? false,
					completionSignal: task.completionSignal?.trim() || undefined,
					retryIntervalMs:
						typeof task.retryIntervalMs === "number" && Number.isFinite(task.retryIntervalMs)
							? Math.max(task.retryIntervalMs, ONE_MINUTE)
							: undefined,
					maxAttempts:
						typeof task.maxAttempts === "number" && Number.isFinite(task.maxAttempts)
							? Math.max(1, Math.floor(task.maxAttempts))
							: undefined,
					awaitingCompletion: false,
					lastOutcomeSnippet: task.lastOutcomeSnippet,
					creatorInstanceId: task.creatorInstanceId,
					creatorSessionId: task.creatorSessionId,
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
					normalized.resumeReason = "overdue";
					mutated = true;
				}

				this.tasks.set(normalized.id, normalized);
			}
		} catch {
			// Ignore corrupted store and continue with empty in-memory state.
		}
		mutated = this.reconcileTaskOwnership() || mutated;
		if (mutated) {
			this.persistTasks();
		}
		this.updateStatus();
	}

	private taskStateLabel(task: ScheduleTask): string {
		if (task.resumeRequired) {
			return `review:${task.resumeReason ?? "unknown"}`;
		}
		return task.enabled ? "on" : "off";
	}

	private taskStatusLabel(task: ScheduleTask): string {
		if (task.resumeRequired) {
			return `resume_required (${task.resumeReason ?? "unknown"})`;
		}
		if (task.awaitingCompletion) {
			return "awaiting_completion";
		}
		return task.lastStatus ?? "pending";
	}

	private getTaskCreatorOrigin(task: ScheduleTask): "current" | "other" | "legacy" {
		if (task.creatorInstanceId === this.instanceId) {
			return "current";
		}
		if (task.creatorInstanceId) {
			return "other";
		}
		return "legacy";
	}

	private wasCreatedHere(task: ScheduleTask): boolean {
		return this.getTaskCreatorOrigin(task) === "current";
	}

	private taskCreatorShortLabel(task: ScheduleTask): string {
		switch (this.getTaskCreatorOrigin(task)) {
			case "current":
				return "this pi";
			case "other":
				return "other pi";
			default:
				return "legacy";
		}
	}

	private taskCreatorLabel(task: ScheduleTask): string {
		switch (this.getTaskCreatorOrigin(task)) {
			case "current":
				return `this instance (${this.instanceId})`;
			case "other":
				return `${task.creatorInstanceId}${task.creatorSessionId ? ` (${task.creatorSessionId})` : ""}`;
			default:
				return "unknown (legacy task)";
		}
	}

	private taskOwnerLabel(task: ScheduleTask): string {
		if (task.ownerInstanceId === this.instanceId) {
			return `this:${this.instanceId}`;
		}
		if (task.ownerInstanceId) {
			return `${task.ownerInstanceId}${task.ownerSessionId ? ` (${task.ownerSessionId})` : ""}`;
		}
		return "unowned";
	}

	private describeExternalCreatorClear(tasks: ScheduleTask[], ctx?: ExtensionContext): string {
		const otherCount = tasks.filter((task) => this.getTaskCreatorOrigin(task) === "other").length;
		const legacyCount = tasks.length - otherCount;
		const parts = [];
		if (otherCount > 0) {
			parts.push(`${otherCount} created by another instance`);
		}
		if (legacyCount > 0) {
			parts.push(`${legacyCount} legacy task${legacyCount === 1 ? "" : "s"} with unknown creator`);
		}
		return `Delete ${tasks.length} scheduled task${tasks.length === 1 ? "" : "s"} for ${this.getWorkspaceLabel(ctx)} not created in this instance? (${parts.join(", ")})`;
	}

	notifyResumeRequiredTasks() {
		if (!this.runtimeCtx?.hasUI || this.safeModeEnabled) {
			return;
		}
		const dueTasks = this.getSortedTasks().filter((task) => task.enabled && task.resumeRequired);
		if (dueTasks.length === 0) {
			return;
		}
		const counts = new Map<ResumeReason, number>();
		for (const task of dueTasks) {
			const reason = task.resumeReason ?? "overdue";
			counts.set(reason, (counts.get(reason) ?? 0) + 1);
		}
		const details = Array.from(counts.entries())
			.map(([reason, count]) => `${count} ${this.resumeReasonLabel(reason)}`)
			.join(", ");
		const count = dueTasks.length;
		this.runtimeCtx.ui.notify(
			`Scheduler: ${count} stale task${count === 1 ? "" : "s"} need review (${details}). Use /schedule to manage them.`,
			"warning",
		);
		// Persist a compact hint in the status bar so users see it without repeated notifications.
		this.runtimeCtx.ui.setStatus(
			"pi-scheduler-stale",
			`⚠ ${count} stale task${count === 1 ? "" : "s"} — /schedule to review`,
		);
	}

	private resumeReasonLabel(reason: ResumeReason): string {
		switch (reason) {
			case "foreign_owner":
				return "owned by another live instance";
			case "stale_owner":
				return "owned by a stale instance";
			case "legacy_unowned":
				return "legacy unowned task";
			case "released":
				return "released task";
			default:
				return "overdue task";
		}
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

/**
<!-- {=extensionsSchedulerOverview} -->

The scheduler extension adds recurring checks, one-time reminders, and the LLM-callable
`schedule_prompt` tool so pi can schedule future follow-ups like PR, CI, build, or deployment
checks. Tasks run only while pi is active and idle, and scheduler state is persisted in shared pi
storage using a workspace-mirrored path.

<!-- {/extensionsSchedulerOverview} -->
*/
export default function schedulerExtension(pi: ExtensionAPI) {
	const runtime = new SchedulerRuntime(pi);
	registerEvents(pi, runtime);
	registerCommands(pi, runtime);
	registerTools(pi, runtime);
}
