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

export function getLegacySchedulerStoragePath(cwd: string): string {
	return path.join(cwd, ".pi", "scheduler.json");
}
