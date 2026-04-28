import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

export const BG_COMMAND = "bg";
export const BG_SHORTCUT = "ctrl+shift+b";
export const BG_MESSAGE_TYPE = "pi-background-tasks:event";
export const BG_WIDGET_KEY = "pi-background-tasks";
export const BG_OUTPUT_SETTLE_MS = 1500;
export const BG_OUTPUT_BUFFER_MAX_CHARS = 120_000;
export const BG_OUTPUT_ALERT_MAX_CHARS = 3000;
export const BG_LOG_TAIL_MAX_CHARS = 5000;
export const BG_DASHBOARD_WIDTH = 96;
export const BG_DASHBOARD_MAX_HEIGHT = "80%";
export const BG_DEFAULT_TIMEOUT_MS = 10 * 60_000;
export const BG_INSTALL_SYMBOL = Symbol.for("oh-pi.background-tasks.installed");

export type BackgroundTaskStatus = "running" | "completed" | "failed" | "stopped";

export interface BackgroundTaskSnapshot {
	id: string;
	title: string;
	command: string;
	cwd: string;
	pid: number;
	logFile: string;
	startedAt: number;
	updatedAt: number;
	lastOutputAt: number | null;
	expiresAt: number | null;
	status: BackgroundTaskStatus;
	exitCode: number | null;
	reactToOutput: boolean;
	notifyPattern?: string;
	outputBytes: number;
}

export interface BackgroundTaskEventDetails {
	eventType: "output" | "exit";
	task: BackgroundTaskSnapshot;
	eventAt: number;
	outputTail: string;
	newOutputTail?: string;
	matchedPattern?: string;
}

export function createBgProcessShellEnv(
	env: NodeJS.ProcessEnv = process.env,
	agentDir: string = getAgentDir(),
): NodeJS.ProcessEnv {
	const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
	const currentPath = env[pathKey] ?? "";
	const binDir = join(agentDir, "bin");
	const pathEntries = currentPath.split(delimiter).filter(Boolean);
	const updatedPath = pathEntries.includes(binDir)
		? currentPath
		: [binDir, currentPath].filter(Boolean).join(delimiter);

	return {
		...env,
		[pathKey]: updatedPath,
	};
}

export function getBgProcessLogFilePath(
	now: number = Date.now(),
	tempDir: string = tmpdir(),
	label: string = "",
): string {
	const safeLabel = label.replaceAll(/[^a-z0-9-]+/gi, "-").replaceAll(/^-+|-+$/g, "");
	return join(tempDir, safeLabel ? `oh-pi-bg-${safeLabel}-${now}.log` : `oh-pi-bg-${now}.log`);
}

export function parseOutputMatcher(pattern: string | undefined): ((text: string) => boolean) | null {
	const signal = pattern?.trim();
	if (!signal) {
		return null;
	}

	const regexMatch = signal.match(/^\/(.*)\/([gimsuy]*)$/);
	if (regexMatch) {
		try {
			const regex = new RegExp(regexMatch[1], regexMatch[2]);
			return (text: string) => regex.test(text);
		} catch {
			// Ignore invalid regex and fall back to substring matching.
		}
	}

	const loweredSignal = signal.toLowerCase();
	return (text: string) => text.toLowerCase().includes(loweredSignal);
}

export function tailText(text: string, maxChars: number = BG_OUTPUT_ALERT_MAX_CHARS): string {
	if (text.length <= maxChars) {
		return text;
	}

	return `[...truncated]\n${text.slice(-maxChars)}`;
}

export function trimOutputBuffer(
	output: string,
	lastAlertLength: number,
	maxChars: number = BG_OUTPUT_BUFFER_MAX_CHARS,
): { output: string; lastAlertLength: number } {
	if (output.length <= maxChars) {
		return { lastAlertLength, output };
	}

	const overflow = output.length - maxChars;
	return {
		lastAlertLength: Math.max(0, lastAlertLength - overflow),
		output: output.slice(-maxChars),
	};
}

export function formatDuration(ms: number): string {
	const safeMs = Math.max(0, ms);
	if (safeMs < 1000) {
		return `${safeMs}ms`;
	}

	const seconds = safeMs / 1000;
	if (seconds < 60) {
		return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
	}

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.floor(seconds % 60);
	if (minutes < 60) {
		return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
	const diff = Math.max(0, now - timestamp);
	if (diff < 1000) {
		return "just now";
	}
	if (diff < 60_000) {
		return `${Math.floor(diff / 1000)}s ago`;
	}
	if (diff < 3_600_000) {
		return `${Math.floor(diff / 60_000)}m ago`;
	}
	if (diff < 86_400_000) {
		return `${Math.floor(diff / 3_600_000)}h ago`;
	}
	return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function summarizeTaskStatus(status: BackgroundTaskStatus, exitCode: number | null): string {
	if (status === "running") {
		return "running";
	}

	if (status === "completed") {
		return `completed (exit ${exitCode ?? 0})`;
	}

	if (status === "failed") {
		return `failed (exit ${exitCode ?? "?"})`;
	}

	return exitCode === null ? "stopped" : `stopped (exit ${exitCode})`;
}

export function taskDisplayName(task: Pick<BackgroundTaskSnapshot, "title" | "command">): string {
	return task.title.trim() || task.command.trim();
}

export function buildTaskSummaryLine(task: BackgroundTaskSnapshot, now: number = Date.now()): string {
	const activityAt = task.lastOutputAt ?? task.updatedAt;
	return `${task.id} · ${summarizeTaskStatus(
		task.status,
		task.exitCode,
	)} · pid ${task.pid} · ${taskDisplayName(task)} · ${formatRelativeTime(activityAt, now)}`;
}

export function isBackgroundTaskEventDetails(value: unknown): value is BackgroundTaskEventDetails {
	if (!value || typeof value !== "object") {
		return false;
	}

	const candidate = value as Partial<BackgroundTaskEventDetails>;
	return (
		(candidate.eventType === "output" || candidate.eventType === "exit") &&
		Boolean(candidate.task) &&
		typeof candidate.task === "object" &&
		typeof candidate.outputTail === "string"
	);
}

export function resolveTaskByToken<T extends Pick<BackgroundTaskSnapshot, "id" | "pid">>(
	tasks: Iterable<T>,
	token: string | number | undefined,
): T | null {
	if (token === undefined || token === null || token === "") {
		return null;
	}

	const normalized = String(token).trim();
	if (!normalized) {
		return null;
	}

	for (const task of tasks) {
		if (task.id === normalized) {
			return task;
		}
		if (String(task.pid) === normalized) {
			return task;
		}
	}

	return null;
}
