import * as path from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";

export const MAX_TASKS = 50;
export const ONE_MINUTE = 60_000;
export const FIFTEEN_MINUTES = 15 * ONE_MINUTE;
export const THREE_DAYS = 3 * 24 * 60 * ONE_MINUTE;
export const DEFAULT_LOOP_INTERVAL = 10 * ONE_MINUTE;
export const MIN_RECURRING_INTERVAL = ONE_MINUTE;
export const DISPATCH_RATE_LIMIT_WINDOW_MS = ONE_MINUTE;
export const MAX_DISPATCHES_PER_WINDOW = 6;
export const SCHEDULER_LEASE_HEARTBEAT_MS = 1_000;
export const SCHEDULER_SAFE_MODE_HEARTBEAT_MS = 5_000;
export const SCHEDULER_LEASE_STALE_AFTER_MS = 10_000;
export const MAX_DISPATCH_TIMESTAMPS = 64;

export type TaskKind = "recurring" | "once";
export type TaskStatus = "pending" | "success" | "error";
export type ScheduleScope = "instance" | "workspace";
export type ResumeReason = "overdue" | "foreign_owner" | "stale_owner" | "legacy_unowned" | "released";

export interface ScheduleTask {
	id: string;
	prompt: string;
	kind: TaskKind;
	scope?: ScheduleScope;
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
	resumeRequired?: boolean;
	resumeReason?: ResumeReason;
	ownerInstanceId?: string;
	ownerSessionId?: string | null;
	continueUntilComplete?: boolean;
	completionSignal?: string;
	retryIntervalMs?: number;
	maxAttempts?: number;
	awaitingCompletion?: boolean;
	lastOutcomeSnippet?: string;
}

export interface SchedulerLease {
	version: 1;
	instanceId: string;
	sessionId: string | null;
	pid: number;
	cwd: string;
	heartbeatAt: number;
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

export function getSchedulerStorageRoot(): string {
	return path.join(getAgentDir(), "scheduler");
}

export function getSchedulerStoragePath(cwd: string): string {
	const resolved = path.resolve(cwd);
	const parsed = path.parse(resolved);
	const relativeSegments = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
	const rootSegment = parsed.root
		? parsed.root
				.replaceAll(/[^a-zA-Z0-9]+/g, "-")
				.replaceAll(/^-+|-+$/g, "")
				.toLowerCase() || "root"
		: "root";
	return path.join(getSchedulerStorageRoot(), rootSegment, ...relativeSegments, "scheduler.json");
}

export function getSchedulerLeasePath(cwd: string): string {
	const storagePath = getSchedulerStoragePath(cwd);
	const parentDir = path.dirname(storagePath);
	return path.join(parentDir, "scheduler.lease.json");
}

export function getLegacySchedulerStoragePath(cwd: string): string {
	return path.join(cwd, ".pi", "scheduler.json");
}
