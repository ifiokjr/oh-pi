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
 * Tasks run only while pi is active and idle. Recurring tasks auto-expire
 * after 3 days. State is persisted to `.pi/scheduler.json`.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Cron } from "croner";

// ── Constants ───────────────────────────────────────────────────────────────

export const MAX_TASKS = 50;
export const ONE_MINUTE = 60_000;
export const FIFTEEN_MINUTES = 15 * ONE_MINUTE;
export const THREE_DAYS = 3 * 24 * 60 * ONE_MINUTE;
export const DEFAULT_LOOP_INTERVAL = 10 * ONE_MINUTE;
export const MIN_RECURRING_INTERVAL = ONE_MINUTE;
export const DISPATCH_RATE_LIMIT_WINDOW_MS = ONE_MINUTE;
export const MAX_DISPATCHES_PER_WINDOW = 6;

// ── Types ───────────────────────────────────────────────────────────────────

export type TaskKind = "recurring" | "once";
export type TaskStatus = "pending" | "success" | "error";

export interface ScheduleTask {
	id: string;
	prompt: string;
	kind: TaskKind;
	enabled: boolean;
	createdAt: number;
	nextRunAt: number;
	intervalMs?: number;
	cronExpression?: string;
	expiresAt?: number;
	jitterMs: number;
	lastRunAt?: number;
	lastStatus?: TaskStatus;
	runCount: number;
	pending: boolean;
}

export type RecurringSpec =
	| { mode: "interval"; durationMs: number; note?: string }
	| { mode: "cron"; cronExpression: string; note?: string };

export interface ParseResult {
	prompt: string;
	recurring: RecurringSpec;
}

export interface ReminderParseResult {
	prompt: string;
	durationMs: number;
	note?: string;
}

export type SchedulePromptAddPlan =
	| { kind: "once"; durationMs: number; note?: string }
	| { kind: "recurring"; mode: "interval"; durationMs: number; note?: string }
	| { kind: "recurring"; mode: "cron"; cronExpression: string; note?: string };

interface SchedulerStore {
	version: 1;
	tasks: ScheduleTask[];
}

// ── Scheduling helpers ──────────────────────────────────────────────────────

export function normalizeCronExpression(rawInput: string): { expression: string; note?: string } | undefined {
	const input = rawInput.trim();
	if (!input) {
		return undefined;
	}

	const fields = input.split(/\s+/).filter(Boolean);
	if (fields.length !== 5 && fields.length !== 6) {
		return undefined;
	}

	const expression = fields.length === 5 ? `0 ${fields.join(" ")}` : fields.join(" ");
	try {
		// biome-ignore lint/suspicious/noEmptyBlockStatements: Cron requires a callback
		const cron = new Cron(expression, () => {});
		cron.stop();

		const cadenceMs = computeCronCadenceMs(expression);
		if (cadenceMs !== undefined && cadenceMs < MIN_RECURRING_INTERVAL) {
			return undefined;
		}

		return {
			expression,
			note: fields.length === 5 ? "Interpreted as 5-field cron and normalized by prepending seconds=0." : undefined,
		};
	} catch {
		return undefined;
	}
}

export function computeNextCronRunAt(expression: string, fromTs = Date.now()): number | undefined {
	try {
		// biome-ignore lint/suspicious/noEmptyBlockStatements: Cron requires a callback
		const cron = new Cron(expression, () => {});
		const next = cron.nextRun(new Date(fromTs));
		cron.stop();
		return next?.getTime();
	} catch {
		return undefined;
	}
}

export function computeCronCadenceMs(expression: string, fromTs = Date.now()): number | undefined {
	try {
		// biome-ignore lint/suspicious/noEmptyBlockStatements: Cron requires a callback
		const cron = new Cron(expression, () => {});
		const firstRun = cron.nextRun(new Date(fromTs));
		if (!firstRun) {
			cron.stop();
			return undefined;
		}
		const secondRun = cron.nextRun(new Date(firstRun.getTime() + 1));
		cron.stop();
		if (!secondRun) {
			return undefined;
		}
		return secondRun.getTime() - firstRun.getTime();
	} catch {
		return undefined;
	}
}

export function formatDurationShort(ms: number): string {
	if (ms % (24 * 60 * ONE_MINUTE) === 0) {
		return `${ms / (24 * 60 * ONE_MINUTE)}d`;
	}
	if (ms % (60 * ONE_MINUTE) === 0) {
		return `${ms / (60 * ONE_MINUTE)}h`;
	}
	return `${ms / ONE_MINUTE}m`;
}

export function normalizeDuration(durationMs: number): { durationMs: number; note?: string } {
	if (durationMs <= 0) {
		return { durationMs: ONE_MINUTE, note: "Rounded up to 1m (minimum interval)." };
	}

	const rounded = Math.ceil(durationMs / ONE_MINUTE) * ONE_MINUTE;
	if (rounded !== durationMs) {
		return {
			durationMs: rounded,
			note: `Rounded to ${formatDurationShort(rounded)} (minute granularity).`,
		};
	}
	return { durationMs };
}

export function parseDuration(text: string): number | undefined {
	const raw = text.trim().toLowerCase();
	if (!raw) {
		return undefined;
	}

	let match = raw.match(/^(\d+)\s*([smhd])$/i);
	if (match) {
		const n = Number.parseInt(match[1], 10);
		const unit = match[2].toLowerCase();
		if (unit === "s") {
			return n * 1000;
		}
		if (unit === "m") {
			return n * ONE_MINUTE;
		}
		if (unit === "h") {
			return n * 60 * ONE_MINUTE;
		}
		if (unit === "d") {
			return n * 24 * 60 * ONE_MINUTE;
		}
	}

	match = raw.match(/^(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)$/i);
	if (!match) {
		return undefined;
	}
	const n = Number.parseInt(match[1], 10);
	const unit = match[2].toLowerCase();
	if (unit.startsWith("sec")) {
		return n * 1000;
	}
	if (unit.startsWith("min")) {
		return n * ONE_MINUTE;
	}
	if (unit.startsWith("hour") || unit.startsWith("hr")) {
		return n * 60 * ONE_MINUTE;
	}
	if (unit.startsWith("day")) {
		return n * 24 * 60 * ONE_MINUTE;
	}
	return undefined;
}

function extractLeadingDuration(input: string): { durationMs: number; prompt: string } | undefined {
	const tokens = input.trim().split(/\s+/);
	if (tokens.length < 2) {
		return undefined;
	}

	const maxPrefix = Math.min(3, tokens.length - 1);
	for (let i = 1; i <= maxPrefix; i++) {
		const durationCandidate = tokens.slice(0, i).join(" ");
		const durationMs = parseDuration(durationCandidate);
		if (!durationMs) {
			continue;
		}
		const prompt = tokens.slice(i).join(" ").trim();
		if (!prompt) {
			continue;
		}
		return { durationMs, prompt };
	}

	return undefined;
}

function extractLeadingCron(input: string): { cronExpression: string; prompt: string; note?: string } | undefined {
	const trimmed = input.trim();
	if (!trimmed.toLowerCase().startsWith("cron ")) {
		return undefined;
	}

	const rest = trimmed.slice(5).trim();
	if (!rest) {
		return undefined;
	}

	const quotedMatch = rest.match(/^(["'])(.+?)\1\s+(.+)$/);
	if (quotedMatch) {
		const normalized = normalizeCronExpression(quotedMatch[2]);
		const prompt = quotedMatch[3].trim();
		if (!(normalized && prompt)) {
			return undefined;
		}
		return { cronExpression: normalized.expression, prompt, note: normalized.note };
	}

	const tokens = rest.split(/\s+/);
	for (const fieldCount of [6, 5]) {
		if (tokens.length <= fieldCount) {
			continue;
		}

		if (fieldCount === 5 && tokens.length >= 6) {
			const sixthToken = tokens[5];
			const sixthTokenLooksLikeCronField =
				/^[\d*/?,#LWH-]+$/i.test(sixthToken) || /^[A-Z]{1,3}(?:,[A-Z]{1,3})*$/i.test(sixthToken);
			if (sixthTokenLooksLikeCronField) {
				continue;
			}
		}

		const expressionCandidate = tokens.slice(0, fieldCount).join(" ");
		const normalized = normalizeCronExpression(expressionCandidate);
		if (!normalized) {
			continue;
		}
		const prompt = tokens.slice(fieldCount).join(" ").trim();
		if (!prompt) {
			continue;
		}
		return { cronExpression: normalized.expression, prompt, note: normalized.note };
	}

	return undefined;
}

export function parseLoopScheduleArgs(args: string): ParseResult | undefined {
	const input = args.trim();
	if (!input) {
		return undefined;
	}

	const explicitlyCron = input.toLowerCase().startsWith("cron ");
	const leadingCron = extractLeadingCron(input);
	if (leadingCron) {
		return {
			prompt: leadingCron.prompt,
			recurring: {
				mode: "cron",
				cronExpression: leadingCron.cronExpression,
				note: leadingCron.note,
			},
		};
	}
	if (explicitlyCron) {
		return undefined;
	}

	const leading = extractLeadingDuration(input);
	if (leading) {
		const normalized = normalizeDuration(leading.durationMs);
		return {
			prompt: leading.prompt,
			recurring: {
				mode: "interval",
				durationMs: normalized.durationMs,
				note: normalized.note,
			},
		};
	}

	const trailingEvery = input.match(/^(.*)\s+every\s+(.+)$/i);
	if (trailingEvery) {
		const prompt = trailingEvery[1].trim();
		const parsed = parseDuration(trailingEvery[2]);
		if (prompt && parsed) {
			const normalized = normalizeDuration(parsed);
			return {
				prompt,
				recurring: {
					mode: "interval",
					durationMs: normalized.durationMs,
					note: normalized.note,
				},
			};
		}
	}

	return {
		prompt: input,
		recurring: {
			mode: "interval",
			durationMs: DEFAULT_LOOP_INTERVAL,
		},
	};
}

export function parseRemindScheduleArgs(args: string): ReminderParseResult | undefined {
	const input = args.trim();
	if (!input) {
		return undefined;
	}

	const value = input.toLowerCase().startsWith("in ") ? input.slice(3).trim() : input;
	const parsed = extractLeadingDuration(value);
	if (!parsed) {
		return undefined;
	}

	const normalized = normalizeDuration(parsed.durationMs);
	return {
		prompt: parsed.prompt,
		durationMs: normalized.durationMs,
		note: normalized.note,
	};
}

export function validateSchedulePromptAddInput(input: { kind?: TaskKind; duration?: string; cron?: string }):
	| { ok: true; plan: SchedulePromptAddPlan }
	| {
			ok: false;
			error:
				| "missing_duration"
				| "invalid_duration"
				| "invalid_cron_for_once"
				| "conflicting_schedule_inputs"
				| "invalid_cron";
	  } {
	const kind: TaskKind = input.kind ?? "recurring";

	if (kind === "once") {
		if (input.cron) {
			return { ok: false, error: "invalid_cron_for_once" };
		}
		if (!input.duration) {
			return { ok: false, error: "missing_duration" };
		}

		const parsed = parseDuration(input.duration);
		if (!parsed) {
			return { ok: false, error: "invalid_duration" };
		}
		const normalized = normalizeDuration(parsed);
		return { ok: true, plan: { kind: "once", durationMs: normalized.durationMs, note: normalized.note } };
	}

	if (input.cron && input.duration) {
		return { ok: false, error: "conflicting_schedule_inputs" };
	}

	if (input.cron) {
		const normalizedCron = normalizeCronExpression(input.cron);
		if (!normalizedCron) {
			return { ok: false, error: "invalid_cron" };
		}
		return {
			ok: true,
			plan: {
				kind: "recurring",
				mode: "cron",
				cronExpression: normalizedCron.expression,
				note: normalizedCron.note,
			},
		};
	}

	if (input.duration) {
		const parsed = parseDuration(input.duration);
		if (!parsed) {
			return { ok: false, error: "invalid_duration" };
		}
		const normalized = normalizeDuration(parsed);
		return {
			ok: true,
			plan: { kind: "recurring", mode: "interval", durationMs: normalized.durationMs, note: normalized.note },
		};
	}

	return {
		ok: true,
		plan: { kind: "recurring", mode: "interval", durationMs: DEFAULT_LOOP_INTERVAL },
	};
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

		const nextStorePath = path.join(ctx.cwd, ".pi", "scheduler.json");
		if (nextStorePath !== this.storagePath) {
			this.storagePath = nextStorePath;
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
		if (!enabled) {
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
			const state = task.enabled ? "on" : "off";
			const mode = this.taskMode(task);
			const next = `${this.formatRelativeTime(task.nextRunAt)} (${this.formatClock(task.nextRunAt)})`;
			const last = task.lastRunAt
				? `${this.formatRelativeTime(task.lastRunAt)} (${this.formatClock(task.lastRunAt)})`
				: "never";
			const status = task.lastStatus ?? "pending";
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
			this.runtimeCtx.ui.setStatus(
				"pi-scheduler",
				`⏸ ${this.tasks.size} task${this.tasks.size === 1 ? "" : "s"} paused`,
			);
			return;
		}

		const nextRunAt = Math.min(...enabled.map((t) => t.nextRunAt));
		const next = new Date(nextRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
		const text = `⏰ ${enabled.length} active • next ${next}`;
		this.runtimeCtx.ui.setStatus("pi-scheduler", text);
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

			if (!task.enabled) {
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
			options.push("➕ Close");

			const selected = await ctx.ui.select("Scheduled tasks (select one)", options);
			if (!selected || selected === "➕ Close") {
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
				task.enabled ? "⏸ Disable" : "▶ Enable",
				"▶ Run now",
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

			if (action === "⏸ Disable" || action === "▶ Enable") {
				const enabled = action === "▶ Enable";
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

			if (action === "▶ Run now") {
				task.nextRunAt = Date.now();
				task.pending = true;
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
		const state = task.enabled ? "✓" : "⏸";
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

	loadTasksFromDisk() {
		if (!this.storagePath) {
			return;
		}

		this.tasks.clear();
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
					break;
				}
				if (!(task?.id && task.prompt)) {
					continue;
				}

				const normalized: ScheduleTask = {
					...task,
					enabled: task.enabled ?? true,
					pending: false,
					runCount: task.runCount ?? 0,
				};
				if (normalized.kind === "recurring" && normalized.expiresAt && now >= normalized.expiresAt) {
					continue;
				}

				if (normalized.kind === "recurring" && normalized.cronExpression) {
					const cron = normalizeCronExpression(normalized.cronExpression);
					if (!cron) {
						continue;
					}
					normalized.cronExpression = cron.expression;
				}

				if (normalized.kind === "recurring" && !normalized.cronExpression) {
					const rawIntervalMs = normalized.intervalMs ?? DEFAULT_LOOP_INTERVAL;
					normalized.intervalMs = Number.isFinite(rawIntervalMs)
						? Math.max(rawIntervalMs, MIN_RECURRING_INTERVAL)
						: DEFAULT_LOOP_INTERVAL;
				}

				if (!Number.isFinite(normalized.nextRunAt)) {
					if (normalized.kind === "recurring" && normalized.cronExpression) {
						normalized.nextRunAt = computeNextCronRunAt(normalized.cronExpression, now) ?? now + DEFAULT_LOOP_INTERVAL;
					} else {
						const fallbackDelay =
							normalized.kind === "once" ? ONE_MINUTE : (normalized.intervalMs ?? DEFAULT_LOOP_INTERVAL);
						normalized.nextRunAt = now + fallbackDelay;
					}
				}

				this.tasks.set(normalized.id, normalized);
			}
		} catch {
			// Ignore corrupted store and continue with empty in-memory state.
		}
		this.updateStatus();
	}

	persistTasks() {
		if (!this.storagePath) {
			return;
		}
		try {
			fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
			const store: SchedulerStore = {
				version: 1,
				tasks: this.getSortedTasks(),
			};
			const tempPath = `${this.storagePath}.tmp`;
			fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), "utf-8");
			fs.renameSync(tempPath, this.storagePath);
		} catch {
			// Best-effort persistence; runtime behavior should continue.
		}
	}
}

// ── Commands ────────────────────────────────────────────────────────────────

function registerCommands(pi: ExtensionAPI, runtime: SchedulerRuntime) {
	pi.registerCommand("loop", {
		description: "Schedule recurring prompt: /loop 5m <prompt>, /loop <prompt> every 2h, or /loop cron <expr> <prompt>",
		handler: async (args, ctx) => {
			const parsed = parseLoopScheduleArgs(args);
			if (!parsed) {
				ctx.ui.notify(
					"Usage: /loop 5m check build OR /loop cron '*/5 * * * *' check build (minimum cron cadence is 1m)",
					"warning",
				);
				return;
			}

			if (runtime.taskCount >= MAX_TASKS) {
				ctx.ui.notify(`Task limit reached (${MAX_TASKS}). Delete one with /schedule delete <id>.`, "error");
				return;
			}

			if (parsed.recurring.mode === "cron") {
				const task = runtime.addRecurringCronTask(parsed.prompt, parsed.recurring.cronExpression);
				if (!task) {
					ctx.ui.notify("Invalid cron schedule. Cron tasks must run no more often than once per minute.", "error");
					return;
				}
				ctx.ui.notify(`Scheduled cron ${task.cronExpression} (id: ${task.id}). Expires in 3 days.`, "info");
				if (parsed.recurring.note) {
					ctx.ui.notify(parsed.recurring.note, "info");
				}
				return;
			}

			const task = runtime.addRecurringIntervalTask(parsed.prompt, parsed.recurring.durationMs);
			ctx.ui.notify(
				`Scheduled every ${formatDurationShort(parsed.recurring.durationMs)} (id: ${task.id}). Expires in 3 days.`,
				"info",
			);
			if (parsed.recurring.note) {
				ctx.ui.notify(parsed.recurring.note, "info");
			}
		},
	});

	pi.registerCommand("remind", {
		description: "Schedule one-time reminder: /remind in 45m <prompt>",
		handler: async (args, ctx) => {
			const parsed = parseRemindScheduleArgs(args);
			if (!parsed) {
				ctx.ui.notify("Usage: /remind in 45m check deployment", "warning");
				return;
			}

			if (runtime.taskCount >= MAX_TASKS) {
				ctx.ui.notify(`Task limit reached (${MAX_TASKS}). Delete one with /schedule delete <id>.`, "error");
				return;
			}

			const task = runtime.addOneShotTask(parsed.prompt, parsed.durationMs);
			ctx.ui.notify(`Reminder set for ${runtime.formatRelativeTime(task.nextRunAt)} (id: ${task.id}).`, "info");
			if (parsed.note) {
				ctx.ui.notify(parsed.note, "info");
			}
		},
	});

	pi.registerCommand("schedule", {
		description:
			"Manage schedules. No args opens TUI manager. Also: list | enable <id> | disable <id> | delete <id> | clear",
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Command router with multiple subcommands.
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (!trimmed || trimmed === "tui") {
				await runtime.openTaskManager(ctx);
				return;
			}

			const [rawAction, rawArg] = trimmed.split(/\s+/, 2);
			const action = rawAction.toLowerCase();

			if (action === "list") {
				pi.sendMessage({
					customType: "pi-scheduler",
					content: runtime.formatTaskList(),
					display: true,
				});
				return;
			}

			if (action === "enable" || action === "disable") {
				if (!rawArg) {
					ctx.ui.notify(`Usage: /schedule ${action} <id>`, "warning");
					return;
				}
				const enabled = action === "enable";
				const ok = runtime.setTaskEnabled(rawArg, enabled);
				if (!ok) {
					ctx.ui.notify(`Task not found: ${rawArg}`, "warning");
					return;
				}
				ctx.ui.notify(`${enabled ? "Enabled" : "Disabled"} scheduled task ${rawArg}.`, "info");
				return;
			}

			if (action === "delete" || action === "remove" || action === "rm") {
				if (!rawArg) {
					ctx.ui.notify("Usage: /schedule delete <id>", "warning");
					return;
				}
				const removed = runtime.deleteTask(rawArg);
				if (!removed) {
					ctx.ui.notify(`Task not found: ${rawArg}`, "warning");
					return;
				}
				ctx.ui.notify(`Deleted scheduled task ${rawArg}.`, "info");
				return;
			}

			if (action === "clear") {
				const count = runtime.clearTasks();
				ctx.ui.notify(`Cleared ${count} task${count === 1 ? "" : "s"}.`, "info");
				return;
			}

			ctx.ui.notify("Usage: /schedule [tui|list|enable <id>|disable <id>|delete <id>|clear]", "warning");
		},
	});

	pi.registerCommand("unschedule", {
		description: "Alias for /schedule delete <id>",
		handler: async (args, ctx) => {
			const id = args.trim();
			if (!id) {
				ctx.ui.notify("Usage: /unschedule <id>", "warning");
				return;
			}
			const removed = runtime.deleteTask(id);
			if (!removed) {
				ctx.ui.notify(`Task not found: ${id}`, "warning");
				return;
			}
			ctx.ui.notify(`Deleted scheduled task ${id}.`, "info");
		},
	});
}

// ── Tool ────────────────────────────────────────────────────────────────────

const SchedulePromptToolParams = Type.Object({
	action: Type.Union(
		[
			Type.Literal("add"),
			Type.Literal("list"),
			Type.Literal("delete"),
			Type.Literal("clear"),
			Type.Literal("enable"),
			Type.Literal("disable"),
		],
		{ description: "Action to perform" },
	),
	kind: Type.Optional(Type.Union([Type.Literal("recurring"), Type.Literal("once")], { description: "Task kind" })),
	prompt: Type.Optional(Type.String({ description: "Prompt text to run when the task fires" })),
	duration: Type.Optional(
		Type.String({
			description:
				"Delay/interval like 5m, 2h, 1 day. For kind=once this is required. For kind=recurring this creates interval-based loops.",
		}),
	),
	cron: Type.Optional(
		Type.String({
			description:
				"Cron expression for recurring tasks. Accepts 5-field (minute hour dom month dow) or 6-field (sec minute hour dom month dow).",
		}),
	),
	id: Type.Optional(Type.String({ description: "Task id for delete/enable/disable action" })),
});

function registerTools(pi: ExtensionAPI, runtime: SchedulerRuntime) {
	pi.registerTool({
		name: "schedule_prompt",
		label: "Schedule Prompt",
		description:
			"Create/list/enable/disable/delete scheduled prompts. Use this when the user asks for reminders or recurring checks. add requires prompt; once tasks require duration; recurring supports interval (duration) or cron expression (cron).",
		promptSnippet:
			"Create/list/enable/disable/delete scheduled prompts. Supports recurring intervals/cron and one-time reminders (session-scoped).",
		promptGuidelines: [
			"Use this tool when user asks to remind/check back later.",
			"For recurring tasks use kind='recurring' with duration like 5m or 2h, or provide cron.",
			"For one-time reminders use kind='once' with duration like 30m or 1h.",
		],
		parameters: SchedulePromptToolParams,
		execute: async (
			_toolCallId,
			params: { action: string; kind?: TaskKind; prompt?: string; duration?: string; cron?: string; id?: string },
		): Promise<{ content: { type: "text"; text: string }[]; details: Record<string, unknown> }> => {
			const { action } = params;

			if (action === "list") {
				return handleToolList(runtime);
			}
			if (action === "clear") {
				return handleToolClear(runtime);
			}
			if (action === "delete") {
				return handleToolDelete(params, runtime);
			}
			if (action === "enable" || action === "disable") {
				return handleToolToggle(params, runtime);
			}
			if (action === "add") {
				return handleToolAdd(params, runtime);
			}

			return {
				content: [{ type: "text", text: `Error: unsupported action '${String(action)}'.` }],
				details: { action, error: "unsupported_action" },
			};
		},
	});
}

type ToolResult = { content: { type: "text"; text: string }[]; details: Record<string, unknown> };

function handleToolList(runtime: SchedulerRuntime): ToolResult {
	const list = runtime.getSortedTasks();
	if (list.length === 0) {
		return { content: [{ type: "text", text: "No scheduled tasks." }], details: { action: "list", tasks: [] } };
	}

	const lines = list.map((task) => {
		const schedule =
			task.kind === "once"
				? "-"
				: (task.cronExpression ?? formatDurationShort(task.intervalMs ?? DEFAULT_LOOP_INTERVAL));
		const state = task.enabled ? "on" : "off";
		const status = task.lastStatus ?? "pending";
		const last = task.lastRunAt ? runtime.formatRelativeTime(task.lastRunAt) : "never";
		return `${task.id}\t${state}\t${task.kind}\t${schedule}\t${runtime.formatRelativeTime(task.nextRunAt)}\t${task.runCount}\t${last}\t${status}\t${task.prompt}`;
	});
	return {
		content: [
			{
				type: "text",
				text: `Scheduled tasks (id\tstate\tkind\tschedule\tnext\truns\tlast\tstatus\tprompt):\n${lines.join("\n")}`,
			},
		],
		details: { action: "list", tasks: list },
	};
}

function handleToolClear(runtime: SchedulerRuntime): ToolResult {
	const count = runtime.clearTasks();
	return {
		content: [{ type: "text", text: `Cleared ${count} scheduled task${count === 1 ? "" : "s"}.` }],
		details: { action: "clear", cleared: count },
	};
}

function handleToolDelete(params: { id?: string }, runtime: SchedulerRuntime): ToolResult {
	const id = params.id?.trim();
	if (!id) {
		return {
			content: [{ type: "text", text: "Error: id is required for delete action." }],
			details: { action: "delete", error: "missing_id" },
		};
	}
	const removed = runtime.deleteTask(id);
	if (!removed) {
		return {
			content: [{ type: "text", text: `Task not found: ${id}` }],
			details: { action: "delete", id, removed: false },
		};
	}
	return {
		content: [{ type: "text", text: `Deleted scheduled task ${id}.` }],
		details: { action: "delete", id, removed: true },
	};
}

function handleToolToggle(params: { action: string; id?: string }, runtime: SchedulerRuntime): ToolResult {
	const { action } = params;
	const id = params.id?.trim();
	if (!id) {
		return {
			content: [{ type: "text", text: `Error: id is required for ${action} action.` }],
			details: { action, error: "missing_id" },
		};
	}
	const enabled = action === "enable";
	const ok = runtime.setTaskEnabled(id, enabled);
	if (!ok) {
		return {
			content: [{ type: "text", text: `Task not found: ${id}` }],
			details: { action, id, updated: false },
		};
	}
	return {
		content: [{ type: "text", text: `${enabled ? "Enabled" : "Disabled"} scheduled task ${id}.` }],
		details: { action, id, updated: true, enabled },
	};
}

function validationErrorMessage(error: string): string {
	switch (error) {
		case "missing_duration":
			return "Error: duration is required for one-time reminders.";
		case "invalid_duration":
			return "Error: invalid duration. Use values like 5m, 2h, 1 day.";
		case "invalid_cron_for_once":
			return "Error: cron is only valid for recurring tasks.";
		case "conflicting_schedule_inputs":
			return "Error: provide either duration or cron for recurring tasks, not both.";
		case "invalid_cron":
			return "Error: invalid cron expression (minimum cadence is 1 minute).";
		default:
			return `Error: ${error}`;
	}
}

function handleToolAdd(
	params: { kind?: TaskKind; prompt?: string; duration?: string; cron?: string },
	runtime: SchedulerRuntime,
): ToolResult {
	const prompt = params.prompt?.trim();
	if (!prompt) {
		return {
			content: [{ type: "text", text: "Error: prompt is required for add action." }],
			details: { action: "add", error: "missing_prompt" },
		};
	}

	if (runtime.taskCount >= MAX_TASKS) {
		return {
			content: [{ type: "text", text: `Task limit reached (${MAX_TASKS}). Delete one first.` }],
			details: { action: "add", error: "task_limit" },
		};
	}

	const validated = validateSchedulePromptAddInput({
		kind: params.kind,
		duration: params.duration,
		cron: params.cron,
	});
	if (!validated.ok) {
		return {
			content: [{ type: "text", text: validationErrorMessage(validated.error) }],
			details: { action: "add", error: validated.error },
		};
	}

	if (validated.plan.kind === "once") {
		const task = runtime.addOneShotTask(prompt, validated.plan.durationMs);
		return {
			content: [
				{
					type: "text",
					text: `Reminder scheduled (id: ${task.id}) for ${runtime.formatRelativeTime(task.nextRunAt)}.${
						validated.plan.note ? ` ${validated.plan.note}` : ""
					}`,
				},
			],
			details: { action: "add", task },
		};
	}

	if (validated.plan.mode === "cron") {
		const task = runtime.addRecurringCronTask(prompt, validated.plan.cronExpression);
		if (!task) {
			return {
				content: [
					{ type: "text", text: "Error: invalid cron expression or cadence is too frequent (minimum is 1 minute)." },
				],
				details: { action: "add", error: "cron_next_run_failed" },
			};
		}
		return {
			content: [
				{
					type: "text",
					text: `Recurring cron task scheduled (id: ${task.id}) with '${task.cronExpression}'. Expires in 3 days.${
						validated.plan.note ? ` ${validated.plan.note}` : ""
					}`,
				},
			],
			details: { action: "add", task },
		};
	}

	const task = runtime.addRecurringIntervalTask(prompt, validated.plan.durationMs);
	return {
		content: [
			{
				type: "text",
				text: `Recurring task scheduled (id: ${task.id}) every ${formatDurationShort(validated.plan.durationMs)}. Expires in 3 days.${
					validated.plan.note ? ` ${validated.plan.note}` : ""
				}`,
			},
		],
		details: { action: "add", task },
	};
}

// ── Events ──────────────────────────────────────────────────────────────────

function registerEvents(pi: ExtensionAPI, runtime: SchedulerRuntime) {
	pi.on("session_start", async (_event, ctx) => {
		runtime.setRuntimeContext(ctx);
		runtime.startScheduler();
		runtime.updateStatus();
	});

	pi.on("session_switch", async (_event, ctx) => {
		runtime.setRuntimeContext(ctx);
		runtime.updateStatus();
	});

	pi.on("session_fork", async (_event, ctx) => {
		runtime.setRuntimeContext(ctx);
		runtime.updateStatus();
	});

	pi.on("session_tree", async (_event, ctx) => {
		runtime.setRuntimeContext(ctx);
		runtime.updateStatus();
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		runtime.setRuntimeContext(ctx);
		runtime.stopScheduler();
		runtime.clearStatus(ctx);
	});
}

// ── Extension entry ─────────────────────────────────────────────────────────

export default function schedulerExtension(pi: ExtensionAPI) {
	const runtime = new SchedulerRuntime(pi);
	registerEvents(pi, runtime);
	registerCommands(pi, runtime);
	registerTools(pi, runtime);
}
