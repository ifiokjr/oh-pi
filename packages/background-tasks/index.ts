/* c8 ignore file */

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import {
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type Theme,
	getShellConfig,
} from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import {
	BG_COMMAND,
	BG_DASHBOARD_MAX_HEIGHT,
	BG_DASHBOARD_WIDTH,
	BG_DEFAULT_TIMEOUT_MS,
	BG_INSTALL_SYMBOL,
	BG_LOG_TAIL_MAX_CHARS,
	BG_MESSAGE_TYPE,
	BG_OUTPUT_ALERT_MAX_CHARS,
	BG_OUTPUT_SETTLE_MS,
	BG_SHORTCUT,
	BG_WIDGET_KEY,
	type BackgroundTaskEventDetails,
	type BackgroundTaskSnapshot,
	type BackgroundTaskStatus,
	buildTaskSummaryLine,
	createBgProcessShellEnv,
	formatDuration,
	formatRelativeTime,
	getBgProcessLogFilePath,
	isBackgroundTaskEventDetails,
	parseOutputMatcher,
	resolveTaskByToken,
	summarizeTaskStatus,
	tailText,
	taskDisplayName,
	trimOutputBuffer,
} from "./background-tasks-shared.js";

type ManagedTask = BackgroundTaskSnapshot & {
	child: ReturnType<typeof spawn>;
	output: string;
	lastAlertLength: number;
	outputTimer: ReturnType<typeof setTimeout> | null;
	matcher: ((text: string) => boolean) | null;
	closed: boolean;
	stopRequested: boolean;
};

type SpawnTaskOptions = {
	command: string;
	title?: string;
	cwd?: string;
	reactToOutput?: boolean;
	notifyPattern?: string;
	child?: ReturnType<typeof spawn>;
	initialOutput?: string;
	initialLastAlertLength?: number;
	logFile?: string;
	expiresAt?: number | null;
};

type ThemeLike = Theme;

function taskSnapshot(task: ManagedTask): BackgroundTaskSnapshot {
	return {
		id: task.id,
		title: task.title,
		command: task.command,
		cwd: task.cwd,
		pid: task.pid,
		logFile: task.logFile,
		startedAt: task.startedAt,
		updatedAt: task.updatedAt,
		lastOutputAt: task.lastOutputAt,
		expiresAt: task.expiresAt,
		status: task.status,
		exitCode: task.exitCode,
		reactToOutput: task.reactToOutput,
		notifyPattern: task.notifyPattern,
		outputBytes: task.outputBytes,
	};
}

function renderBackgroundMessage(text: string, theme: ThemeLike): Text {
	return new Text(text, 1, 0, (segment: string) => theme.bg("customMessageBg", segment));
}

function buildTaskEventLines(details: BackgroundTaskEventDetails, theme: ThemeLike, expanded: boolean): string[] {
	const heading =
		details.eventType === "exit"
			? `${theme.fg("success", theme.bold("⚙ Background task finished"))}`
			: `${theme.fg("accent", theme.bold("⚙ Background task output"))}`;
	const lines = [
		heading,
		`${theme.fg("muted", "Task")}: ${details.task.id} · ${taskDisplayName(details.task)}`,
		`${theme.fg("muted", "Status")}: ${summarizeTaskStatus(details.task.status, details.task.exitCode)} · pid ${details.task.pid}`,
		`${theme.fg("muted", "Started")}: ${formatRelativeTime(details.task.startedAt, details.eventAt)} · ${formatDuration(details.eventAt - details.task.startedAt)} elapsed`,
	];

	if (details.task.expiresAt != null) {
		lines.push(`${theme.fg("muted", "Expiry")}: ${formatRelativeTime(details.task.expiresAt, details.eventAt)} (${formatDuration(details.task.expiresAt - details.eventAt)} remaining)`);
	}

	lines.push(
		`${theme.fg("muted", "Command")}: ${details.task.command}`,
		`${theme.fg("muted", "Log")}: ${details.task.logFile}`,
	);

	if (details.matchedPattern) {
		lines.push(`${theme.fg("muted", "Pattern")}: ${details.matchedPattern}`);
	}

	const preview = details.eventType === "output" ? details.newOutputTail || details.outputTail : details.outputTail;
	lines.push("");
	lines.push(theme.fg("accent", theme.bold("Recent output")));
	const outputLines = preview.trim().length > 0 ? preview.split(/\r?\n/) : ["(no output yet)"];
	const visible = expanded ? outputLines : outputLines.slice(-8);
	lines.push(...visible);

	if (!expanded && outputLines.length > visible.length) {
		lines.push(theme.fg("dim", "Expand to inspect more buffered output."));
	}

	return lines;
}

function renderTaskEventMessage(message: { content?: unknown; details?: unknown }, expanded: boolean, theme: ThemeLike): Text {
	if (!isBackgroundTaskEventDetails(message.details)) {
		return renderBackgroundMessage(String(message.content ?? "Background task update"), theme);
	}

	return renderBackgroundMessage(buildTaskEventLines(message.details, theme, expanded).join("\n"), theme);
}

const DASHBOARD_TASK_VIEWPORT = 12;
const DASHBOARD_OUTPUT_VIEWPORT = 14;
const DASHBOARD_MIN_TASK_PANE_WIDTH = 30;
const DASHBOARD_MAX_TASK_PANE_WIDTH = 42;

type DashboardPane = "tasks" | "output";

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function padAnsi(text: string, width: number): string {
	const truncated = truncateToWidth(text, width);
	const padding = Math.max(0, width - visibleWidth(truncated));
	return `${truncated}${" ".repeat(padding)}`;
}

function splitOutputLines(output: string): string[] {
	const text = tailText(output, BG_LOG_TAIL_MAX_CHARS).trim();
	return text.length > 0 ? text.split(/\r?\n/) : ["(no output yet)"];
}

export default function backgroundTasksExtension(pi: ExtensionAPI): void {
	const installedPi = pi as unknown as Record<PropertyKey, unknown>;
	if (installedPi[BG_INSTALL_SYMBOL]) {
		return;
	}
	installedPi[BG_INSTALL_SYMBOL] = true;

	let activeCtx: ExtensionContext | null = null;
	let requestWidgetRender: (() => void) | null = null;
	let taskCounter = 0;
	const tasks = new Map<string, ManagedTask>();

	const getSortedTasks = (): ManagedTask[] => [...tasks.values()].sort((left, right) => right.startedAt - left.startedAt);

	const getTaskOutput = (task: ManagedTask): string => {
		if (task.output.length > 0) {
			return task.output;
		}
		if (!existsSync(task.logFile)) {
			return "";
		}
		try {
			return readFileSync(task.logFile, "utf-8");
		} catch {
			return "";
		}
	};

	const clearOutputTimer = (task: ManagedTask) => {
		if (!task.outputTimer) {
			return;
		}
		clearTimeout(task.outputTimer);
		task.outputTimer = null;
	};

	const checkExpiredTasks = () => {
		const now = Date.now();
		for (const task of tasks.values()) {
			if (task.status !== "running") {
				continue;
			}
			if (task.expiresAt != null && now >= task.expiresAt) {
				const remaining = getTaskOutput(task);
				if (remaining.trim()) {
					appendFileSync(task.logFile, `\n[expired] Background task timed out after ${formatDuration(task.expiresAt! - task.startedAt)}.\n`);
				}
				finalizeTask(task, task.exitCode, "stopped");
				sendTaskEvent("exit", task);
			}
		}
	};

	const clearFinishedTasks = (): number => {
		let removed = 0;
		for (const [id, task] of tasks) {
			if (task.status === "running") {
				continue;
			}
			tasks.delete(id);
			removed += 1;
		}
		return removed;
	};

	const renderWidgetLines = (theme: ThemeLike): string[] => {
		const running = getSortedTasks().filter((task) => task.status === "running");
		const finished = tasks.size - running.length;
		const latest = getSortedTasks()[0];
		const summary = `${theme.fg("accent", theme.bold("⚙ Background tasks"))} ${theme.fg("muted", `${running.length} running · ${finished} finished`)}`;

		if (!latest) {
			return [summary];
		}

		const latestActivity = latest.lastOutputAt ?? latest.updatedAt;
		return [
			summary,
			`${theme.fg("dim", `${latest.id} · ${taskDisplayName(latest)} · ${formatRelativeTime(latestActivity)}`)} · ${theme.fg("muted", `${BG_SHORTCUT} dashboard`)}`,
		];
	};

	const clearWidget = () => {
		activeCtx?.ui.setWidget(BG_WIDGET_KEY, undefined);
		requestWidgetRender = null;
	};

	const syncWidget = (ctx: ExtensionContext) => {
		activeCtx = ctx;
		if (tasks.size === 0) {
			clearWidget();
			return;
		}

		ctx.ui.setWidget(
			BG_WIDGET_KEY,
			(tui, theme) => {
				requestWidgetRender = () => tui.requestRender();
				let timer: ReturnType<typeof setInterval> | null = null;

				const ensureTimer = () => {
					const hasRunning = getSortedTasks().some((task) => task.status === "running");
					if (!hasRunning) {
						if (timer) {
							clearInterval(timer);
							timer = null;
						}
						return;
					}

					if (timer) {
						return;
					}

					timer = setInterval(() => tui.requestRender(), 1_000);
					timer.unref?.();
				};

				return {
					dispose() {
						if (timer) {
							clearInterval(timer);
						}
						if (requestWidgetRender) {
							requestWidgetRender = null;
						}
					},
					// biome-ignore lint/suspicious/noEmptyBlockStatements: Required by the widget component interface.
					invalidate() {},
					render(width: number) {
						ensureTimer();
						return renderWidgetLines(theme).map((line) => truncateToWidth(line, width));
					},
				};
			},
			{ placement: "belowEditor" },
		);
	};

	const refreshUi = () => {
		checkExpiredTasks();
		if (activeCtx) {
			syncWidget(activeCtx);
		}
		requestWidgetRender?.();
	};

	const sendTaskEvent = (
		eventType: BackgroundTaskEventDetails["eventType"],
		task: ManagedTask,
		options: { newOutputTail?: string; matchedPattern?: string } = {},
	) => {
		const details: BackgroundTaskEventDetails = {
			eventType,
			task: taskSnapshot(task),
			eventAt: Date.now(),
			outputTail: tailText(getTaskOutput(task), BG_OUTPUT_ALERT_MAX_CHARS),
			newOutputTail: options.newOutputTail,
			matchedPattern: options.matchedPattern,
		};
		const headline =
			eventType === "exit"
				? `Background task ${task.id} finished (${summarizeTaskStatus(task.status, task.exitCode)}).`
				: `Background task ${task.id} emitted new output.`;

		pi.sendMessage(
			{
				customType: BG_MESSAGE_TYPE,
				content: `${headline}\nCommand: ${task.command}`,
				display: true,
				details,
			},
			eventType === "exit" ? { triggerTurn: true, deliverAs: "followUp" } : { triggerTurn: false },
		);
	};

	const scheduleOutputReaction = (task: ManagedTask) => {
		if (!task.reactToOutput || task.status !== "running") {
			return;
		}

		clearOutputTimer(task);
		task.outputTimer = setTimeout(() => {
			task.outputTimer = null;
			const unseenOutput = getTaskOutput(task).slice(task.lastAlertLength);
			if (!unseenOutput.trim()) {
				task.lastAlertLength = getTaskOutput(task).length;
				return;
			}

			if (task.matcher && !(task.matcher(unseenOutput) || task.matcher(getTaskOutput(task)))) {
				return;
			}

			task.lastAlertLength = getTaskOutput(task).length;
			sendTaskEvent("output", task, {
				newOutputTail: tailText(unseenOutput, BG_OUTPUT_ALERT_MAX_CHARS),
				matchedPattern: task.notifyPattern,
			});
			refreshUi();
		}, BG_OUTPUT_SETTLE_MS);
		task.outputTimer.unref?.();
	};

	const finalizeTask = (
		task: ManagedTask,
		exitCode: number | null,
		statusOverride?: BackgroundTaskStatus,
	): ManagedTask => {
		if (task.closed) {
			return task;
		}

		task.closed = true;
		task.updatedAt = Date.now();
		task.exitCode = exitCode;
		clearOutputTimer(task);

		if (statusOverride) {
			task.status = statusOverride;
		} else if (task.stopRequested) {
			task.status = "stopped";
		} else {
			task.status = exitCode === 0 ? "completed" : "failed";
		}

		sendTaskEvent("exit", task);
		refreshUi();
		return task;
	};

	const stopTask = (task: ManagedTask | null): { ok: boolean; message: string } => {
		if (!task) {
			return { ok: false, message: "No background task matched that id or pid." };
		}

		if (task.status !== "running") {
			return { ok: true, message: `${task.id} is already ${summarizeTaskStatus(task.status, task.exitCode)}.` };
		}

		task.stopRequested = true;
		task.updatedAt = Date.now();
		clearOutputTimer(task);

		if (task.pid > 0) {
			try {
				process.kill(task.pid, "SIGTERM");
			} catch {
				finalizeTask(task, task.exitCode, "stopped");
			}
		} else {
			finalizeTask(task, task.exitCode, "stopped");
		}

		refreshUi();
		return { ok: true, message: `Stopping ${task.id} (${task.command}).` };
	};

	const spawnTask = (options: SpawnTaskOptions): ManagedTask => {
		const command = options.command.trim();
		const cwd = options.cwd?.trim() || activeCtx?.cwd || process.cwd();
		const id = `bg-${++taskCounter}`;
		const logFile = options.logFile ?? getBgProcessLogFilePath(Date.now(), undefined, id);
		const title = options.title?.trim() || command;
		const reactToOutput = options.reactToOutput ?? true;
		const notifyPattern = options.notifyPattern?.trim() || undefined;
		const expiresAt = options.expiresAt !== undefined ? options.expiresAt : Date.now() + BG_DEFAULT_TIMEOUT_MS;
		const child =
			options.child ??
			(() => {
				const { shell, args } = getShellConfig();
				return spawn(shell, [...args, command], {
					cwd,
					env: createBgProcessShellEnv(),
					stdio: ["ignore", "pipe", "pipe"],
				});
			})();
		const initialOutput = options.initialOutput ?? "";
		const initialBuffer = trimOutputBuffer(initialOutput, options.initialLastAlertLength ?? initialOutput.length);

		writeFileSync(logFile, initialOutput);

		const task: ManagedTask = {
			id,
			title,
			command,
			cwd,
			pid: child.pid ?? 0,
			logFile,
			startedAt: Date.now(),
			updatedAt: Date.now(),
			lastOutputAt: initialOutput.trim().length > 0 ? Date.now() : null,
			expiresAt,
			status: "running",
			exitCode: null,
			reactToOutput,
			notifyPattern,
			outputBytes: Buffer.byteLength(initialOutput),
			child,
			output: initialBuffer.output,
			lastAlertLength: initialBuffer.lastAlertLength,
			outputTimer: null,
			matcher: parseOutputMatcher(notifyPattern),
			closed: false,
			stopRequested: false,
		};
		tasks.set(task.id, task);

		const handleChunk = (chunk: Buffer) => {
			const text = chunk.toString();
			task.updatedAt = Date.now();
			task.lastOutputAt = task.updatedAt;
			task.outputBytes += chunk.byteLength;
			task.output += text;
			const trimmed = trimOutputBuffer(task.output, task.lastAlertLength);
			task.output = trimmed.output;
			task.lastAlertLength = trimmed.lastAlertLength;

			try {
				appendFileSync(task.logFile, text);
			} catch {
				// Ignore transient log write failures and keep the in-memory buffer.
			}

			scheduleOutputReaction(task);
			refreshUi();
		};

		child.stdout?.on("data", handleChunk);
		child.stderr?.on("data", handleChunk);
		child.on("close", (code) => {
			finalizeTask(task, typeof code === "number" ? code : null);
		});
		child.on("error", (error) => {
			handleChunk(Buffer.from(`\n[spawn error] ${error.message}\n`));
			finalizeTask(task, 1, "failed");
		});

		refreshUi();
		return task;
	};

	const formatTaskListText = (): string => {
		const sorted = getSortedTasks();
		if (sorted.length === 0) {
			return "No background tasks.";
		}
		return sorted.map((task) => buildTaskSummaryLine(taskSnapshot(task))).join("\n\n");
	};

	const openDashboard = async (
		ctx: ExtensionCommandContext | ExtensionContext,
		initialTask: ManagedTask | null = null,
		initialPane: DashboardPane = "tasks",
	): Promise<void> => {
		if (!ctx.hasUI) {
			ctx.ui.notify(formatTaskListText(), "info");
			return;
		}

		await ctx.ui.custom(
			(tui, theme, _keybindings, done) => {
				let selectedId: string | null = initialTask?.id ?? getSortedTasks()[0]?.id ?? null;
				let focusedPane: DashboardPane = initialPane;
				let taskScroll = 0;
				let outputScroll = 0;
				let followOutput = true;
				let timer: ReturnType<typeof setInterval> | null = setInterval(() => tui.requestRender(), 1_000);
				timer.unref?.();

				const selectedTask = (): ManagedTask | null => {
					const sorted = getSortedTasks();
					if (sorted.length === 0) {
						return null;
					}
					const current = selectedId ? tasks.get(selectedId) ?? null : null;
					if (current) {
						return current;
					}
					selectedId = sorted[0]?.id ?? null;
					return selectedId ? tasks.get(selectedId) ?? null : null;
				};

				const getOutputLines = (task: ManagedTask | null): string[] => splitOutputLines(task ? getTaskOutput(task) : "");

				const getMaxOutputScroll = (task: ManagedTask | null): number =>
					Math.max(0, getOutputLines(task).length - DASHBOARD_OUTPUT_VIEWPORT);

				const syncOutputScroll = (task: ManagedTask | null, forceBottom = false) => {
					const maxScroll = getMaxOutputScroll(task);
					if (forceBottom || followOutput) {
						outputScroll = maxScroll;
						return;
					}
					outputScroll = clamp(outputScroll, 0, maxScroll);
				};

				const syncTaskScroll = () => {
					const sorted = getSortedTasks();
					const index = Math.max(
						0,
						sorted.findIndex((task) => task.id === selectedId),
					);
					const maxScroll = Math.max(0, sorted.length - DASHBOARD_TASK_VIEWPORT);
					if (index < taskScroll) {
						taskScroll = index;
					} else if (index >= taskScroll + DASHBOARD_TASK_VIEWPORT) {
						taskScroll = index - DASHBOARD_TASK_VIEWPORT + 1;
					}
					taskScroll = clamp(taskScroll, 0, maxScroll);
				};

				const moveSelection = (delta: number) => {
					const sorted = getSortedTasks();
					if (sorted.length === 0) {
						selectedId = null;
						return;
					}

					const currentIndex = Math.max(
						0,
						sorted.findIndex((task) => task.id === selectedId),
					);
					const nextIndex = clamp(currentIndex + delta, 0, sorted.length - 1);
					selectedId = sorted[nextIndex]?.id ?? null;
					syncTaskScroll();
					syncOutputScroll(selectedTask(), true);
					tui.requestRender();
				};

				const moveOutput = (delta: number) => {
					const task = selectedTask();
					if (!task) {
						return;
					}
					const maxScroll = getMaxOutputScroll(task);
					if (maxScroll === 0) {
						outputScroll = 0;
						followOutput = true;
						tui.requestRender();
						return;
					}

					followOutput = false;
					outputScroll = clamp(outputScroll + delta, 0, maxScroll);
					if (outputScroll >= maxScroll) {
						followOutput = true;
					}
					tui.requestRender();
				};

				const jumpOutput = (mode: "start" | "end") => {
					const task = selectedTask();
					if (!task) {
						return;
					}
					const maxScroll = getMaxOutputScroll(task);
					outputScroll = mode === "start" ? 0 : maxScroll;
					followOutput = mode === "end";
					tui.requestRender();
				};

				const renderLines = (width: number): string[] => {
					const sorted = getSortedTasks();
					const runningCount = sorted.filter((task) => task.status === "running").length;
					const finishedCount = sorted.length - runningCount;
					const selected = selectedTask();
					syncTaskScroll();
					syncOutputScroll(selected);

					const lines = [
						`${theme.fg("accent", theme.bold("⚙ Background tasks"))} ${theme.fg("muted", `${runningCount} running · ${finishedCount} finished`)}`,
						theme.fg(
							"dim",
							`[tab] switch pane · [↑↓] move · [shift+↑/↓] page · [f] follow · [s] stop · [c] clear · [q] close`,
						),
						"",
					];

					if (sorted.length === 0) {
						lines.push(theme.fg("dim", "No background tasks yet. Use /bg run <command> or the bg_task tool."));
						return lines.map((line) => truncateToWidth(line, width));
					}

					const taskPaneWidth = clamp(Math.floor(width * 0.34), DASHBOARD_MIN_TASK_PANE_WIDTH, DASHBOARD_MAX_TASK_PANE_WIDTH);
					const detailPaneWidth = Math.max(24, width - taskPaneWidth - 3);
					const divider = theme.fg("dim", " │ ");
					const left: string[] = [];
					const right: string[] = [];

					left.push(
						`${theme.fg(focusedPane === "tasks" ? "accent" : "muted", theme.bold("Tasks"))} ${theme.fg("dim", `(${sorted.length})`)}`,
					);
					left.push(theme.fg("dim", `Focus: ${focusedPane === "tasks" ? "selection" : "watch pane"}`));
					left.push("");

					if (taskScroll > 0) {
						left.push(theme.fg("dim", `↑ ${taskScroll} earlier task(s)`));
					}

					for (const task of sorted.slice(taskScroll, taskScroll + DASHBOARD_TASK_VIEWPORT)) {
						const marker = task.id === selected?.id ? theme.fg("accent", "→") : theme.fg("dim", "·");
						const statusColor = task.status === "running" ? "success" : task.status === "failed" ? "error" : "muted";
						left.push(
							`${marker} ${theme.fg(statusColor, task.id)} ${theme.fg("dim", summarizeTaskStatus(task.status, task.exitCode))}`,
						);
						left.push(`  ${taskDisplayName(task)}`);
					}

					const hiddenBelow = Math.max(0, sorted.length - (taskScroll + DASHBOARD_TASK_VIEWPORT));
					if (hiddenBelow > 0) {
						left.push(theme.fg("dim", `↓ ${hiddenBelow} more task(s)`));
					}

					if (!selected) {
						right.push(theme.fg("dim", "Select a task to inspect output."));
					} else {
						const outputLines = getOutputLines(selected);
						const maxOutputScroll = Math.max(0, outputLines.length - DASHBOARD_OUTPUT_VIEWPORT);
						const visibleOutput = outputLines.slice(outputScroll, outputScroll + DASHBOARD_OUTPUT_VIEWPORT);
						right.push(
							`${theme.fg(focusedPane === "output" ? "accent" : "muted", theme.bold(`Watch ${selected.id}`))} ${theme.fg("dim", followOutput ? "follow" : `line ${outputScroll + 1}`)}`,
						);
						right.push(`${theme.fg("muted", "Status")}: ${summarizeTaskStatus(selected.status, selected.exitCode)} · pid ${selected.pid}`);
						right.push(`${theme.fg("muted", "Started")}: ${formatRelativeTime(selected.startedAt)} · ${formatDuration(Date.now() - selected.startedAt)} elapsed`);
						if (selected.expiresAt != null) {
							right.push(`${theme.fg("muted", "Expiry")}: ${formatRelativeTime(selected.expiresAt)} (${formatDuration(selected.expiresAt - Date.now())} remaining)`);
						}
						right.push(`${theme.fg("muted", "Command")}: ${selected.command}`);
						right.push(`${theme.fg("muted", "Cwd")}: ${selected.cwd}`);
						right.push(`${theme.fg("muted", "Log")}: ${selected.logFile}`);
						right.push(
							`${theme.fg("muted", "Wakeups")}: ${selected.reactToOutput ? (selected.notifyPattern ?? "on output") : "exit only"}`,
						);
						right.push("");
						right.push(theme.fg("accent", theme.bold("Output")));
						if (outputScroll > 0) {
							right.push(theme.fg("dim", `↑ ${outputScroll} older line(s)`));
						}
						right.push(...visibleOutput);
						const hiddenOutputBelow = Math.max(0, outputLines.length - (outputScroll + DASHBOARD_OUTPUT_VIEWPORT));
						if (hiddenOutputBelow > 0) {
							right.push(theme.fg("dim", `↓ ${hiddenOutputBelow} newer line(s)`));
						}
						right.push("");
						right.push(theme.fg("dim", `Output ${outputScroll + 1}-${Math.min(outputLines.length, outputScroll + DASHBOARD_OUTPUT_VIEWPORT)} of ${outputLines.length} · max scroll ${maxOutputScroll}`));
					}

					const rowCount = Math.max(left.length, right.length);
					for (let index = 0; index < rowCount; index += 1) {
						const leftLine = padAnsi(left[index] ?? "", taskPaneWidth);
						const rightLine = truncateToWidth(right[index] ?? "", detailPaneWidth);
						lines.push(`${leftLine}${divider}${rightLine}`);
					}

					return lines.map((line) => truncateToWidth(line, width));
				};

				return {
					dispose() {
						if (timer) {
							clearInterval(timer);
							timer = null;
						}
					},
					handleInput(data: string) {
						if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || data === "q") {
							done(undefined);
							return;
						}

						if (matchesKey(data, "tab")) {
							focusedPane = focusedPane === "tasks" ? "output" : "tasks";
							tui.requestRender();
							return;
						}

						if (matchesKey(data, "return")) {
							if (focusedPane === "tasks") {
								focusedPane = "output";
								syncOutputScroll(selectedTask(), true);
							} else {
								followOutput = !followOutput;
								syncOutputScroll(selectedTask(), followOutput);
							}
							tui.requestRender();
							return;
						}

						if (data === "f") {
							followOutput = !followOutput;
							syncOutputScroll(selectedTask(), followOutput);
							tui.requestRender();
							return;
						}

						if (data === "r") {
							tui.requestRender();
							return;
						}

						if (data === "c") {
							clearFinishedTasks();
							tui.requestRender();
							refreshUi();
							return;
						}

						if (data === "s") {
							stopTask(selectedTask());
							syncOutputScroll(selectedTask(), followOutput);
							tui.requestRender();
							return;
						}

						if (matchesKey(data, "home") || data === "g") {
							if (focusedPane === "tasks") {
								moveSelection(-Number.MAX_SAFE_INTEGER);
							} else {
								jumpOutput("start");
							}
							return;
						}

						if (matchesKey(data, "end") || data === "G") {
							if (focusedPane === "tasks") {
								moveSelection(Number.MAX_SAFE_INTEGER);
							} else {
								jumpOutput("end");
							}
							return;
						}

						if (matchesKey(data, "shift+up")) {
							if (focusedPane === "tasks") {
								moveSelection(-DASHBOARD_TASK_VIEWPORT);
							} else {
								moveOutput(-DASHBOARD_OUTPUT_VIEWPORT);
							}
							return;
						}

						if (matchesKey(data, "shift+down")) {
							if (focusedPane === "tasks") {
								moveSelection(DASHBOARD_TASK_VIEWPORT);
							} else {
								moveOutput(DASHBOARD_OUTPUT_VIEWPORT);
							}
							return;
						}

						if (matchesKey(data, "up") || data === "k") {
							if (focusedPane === "tasks") {
								moveSelection(-1);
							} else {
								moveOutput(-1);
							}
							return;
						}

						if (matchesKey(data, "down") || data === "j") {
							if (focusedPane === "tasks") {
								moveSelection(1);
							} else {
								moveOutput(1);
							}
						}
					},
					// biome-ignore lint/suspicious/noEmptyBlockStatements: required by the Component interface.
					invalidate() {},
					render(width: number) {
						return renderLines(width);
					},
				};
			},
			{ overlay: true, overlayOptions: { anchor: "center", width: BG_DASHBOARD_WIDTH, maxHeight: BG_DASHBOARD_MAX_HEIGHT } },
		);
	};

	const taskPromptOptions = () =>
		getSortedTasks().map((task) => ({
			value: task.id,
			label: task.id,
			description: `${summarizeTaskStatus(task.status, task.exitCode)} · ${task.command}`,
		}));

	const resolveTask = (id?: string, pid?: number): ManagedTask | null => resolveTaskByToken(tasks.values(), id ?? pid);

	const makeToolResult = (
		text: string,
		options: { details?: Record<string, unknown>; isError?: boolean } = {},
	): any => ({
		content: [{ type: "text", text }],
		details: options.details ?? {},
		isError: options.isError,
	});

	pi.registerMessageRenderer(BG_MESSAGE_TYPE, (message, { expanded }, theme) =>
		renderTaskEventMessage(message, expanded, theme),
	);

	pi.on("session_start", (_event, ctx) => {
		activeCtx = ctx;
		syncWidget(ctx);
	});

	pi.on("session_switch", (_event, ctx) => {
		activeCtx = ctx;
		syncWidget(ctx);
	});

	pi.on("session_tree", (_event, ctx) => {
		activeCtx = ctx;
		syncWidget(ctx);
	});

	pi.on("session_fork", (_event, ctx) => {
		activeCtx = ctx;
		syncWidget(ctx);
	});

	pi.on("before_agent_start", (_event, ctx) => {
		activeCtx = ctx;
		syncWidget(ctx);
	});

	pi.on("session_shutdown", () => {
		for (const task of tasks.values()) {
			if (task.status !== "running") {
				continue;
			}
			task.stopRequested = true;
			clearOutputTimer(task);
			if (task.pid > 0) {
				try {
					process.kill(task.pid, "SIGTERM");
				} catch {
					finalizeTask(task, task.exitCode, "stopped");
				}
			}
		}
		clearWidget();
	});

	pi.registerTool({
		name: "bg_status",
		label: "Background Process Status",
		description: "Check status, view output, or stop background tasks that were spawned explicitly.",
		parameters: Type.Object({
			action: StringEnum(["list", "log", "stop"] as const, {
				description: "list=show tasks, log=view task output, stop=terminate a task",
			}),
			pid: Type.Optional(Type.Number({ description: "Task pid for action=log or stop" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx): Promise<any> {
			if (params.action === "list") {
				return makeToolResult(formatTaskListText());
			}

			const task = resolveTask(undefined, params.pid);
			if (!task) {
				return makeToolResult("No background task matched that pid.", { isError: true });
			}

			if (params.action === "log") {
				const output = getTaskOutput(task);
				return makeToolResult(tailText(output, BG_LOG_TAIL_MAX_CHARS) || "(empty)");
			}

			const stopped = stopTask(task);
			return makeToolResult(stopped.message, { details: { task: taskSnapshot(task) }, isError: !stopped.ok });
		},
	});

	pi.registerTool({
		name: "bg_task",
		label: "Background Task",
		description:
			"Spawn, inspect, and stop background shell tasks. Tasks keep running after the tool returns, append output to a log file, and can wake the agent up when new output arrives or when the task exits. Background tasks expire after 10 minutes by default to prevent indefinite runs. Pass expiresAt=null to disable the expiry.",
		parameters: Type.Object({
			action: StringEnum(["spawn", "list", "log", "stop", "clear"] as const, {
				description: "spawn=start a new task, list=show tasks, log=view task output, stop=terminate, clear=remove finished tasks",
			}),
			command: Type.Optional(Type.String({ description: "Shell command to run for action=spawn" })),
			id: Type.Optional(Type.String({ description: "Task id for action=log or stop" })),
			pid: Type.Optional(Type.Number({ description: "PID for action=log or stop" })),
			title: Type.Optional(Type.String({ description: "Optional label for action=spawn" })),
			cwd: Type.Optional(Type.String({ description: "Optional working directory for action=spawn" })),
			reactToOutput: Type.Optional(
				Type.Boolean({ description: "Wake the agent up when new output arrives. Defaults to true." }),
			),
			notifyPattern: Type.Optional(
				Type.String({ description: "Optional substring or /regex/flags gate for output wakeups." }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx): Promise<any> {
			const { action } = params;

			if (action === "list") {
				return makeToolResult(formatTaskListText());
			}

			if (action === "clear") {
				const removed = clearFinishedTasks();
				refreshUi();
				return makeToolResult(`Removed ${removed} finished background task(s).`);
			}

			if (action === "spawn") {
				const command = params.command?.trim();
				if (!command) {
					return makeToolResult("Error: command is required for action=spawn", { isError: true });
				}

				const task = spawnTask({
					command,
					title: params.title,
					cwd: params.cwd,
					reactToOutput: params.reactToOutput,
					notifyPattern: params.notifyPattern,
				});

				return makeToolResult(
					`Started ${task.id} (pid ${task.pid}) in the background.\nCommand: ${task.command}\nCwd: ${task.cwd}\nLog: ${task.logFile}\nExpiry: ${task.expiresAt != null ? formatRelativeTime(task.expiresAt) : "none"}\nWakeups: ${task.reactToOutput ? task.notifyPattern ?? "on output" : "exit only"}`,
					{ details: { task: taskSnapshot(task) } },
				);
			}

			const task = resolveTask(params.id, params.pid);
			if (!task) {
				return makeToolResult("No background task matched that id or pid.", { isError: true });
			}

			if (action === "log") {
				const output = getTaskOutput(task);
				return makeToolResult(tailText(output, BG_LOG_TAIL_MAX_CHARS) || "(empty)");
			}

			const stopped = stopTask(task);
			return makeToolResult(stopped.message, { details: { task: taskSnapshot(task) }, isError: !stopped.ok });
		},
	});

	pi.registerCommand(BG_COMMAND, {
		description: "Manage background shell tasks: /bg, /bg run <cmd>, /bg stop <id>, /bg watch [--follow] <id>, /bg clear.",
		getArgumentCompletions(prefix) {
			const trimmed = prefix.trimStart();
			const parts = trimmed.split(/\s+/).filter(Boolean);
			if (parts.length <= 1) {
				const options = [
					{ value: "dashboard", label: "dashboard", description: "Open the background task dashboard" },
					{ value: "list", label: "list", description: "Show a textual summary of tracked tasks" },
					{ value: "run ", label: "run", description: "Spawn a new background shell task" },
					{ value: "watch ", label: "watch", description: "Open the dashboard focused on a task" },
					{ value: "watch --follow ", label: "watch --follow", description: "Open the output pane with follow-tail enabled" },
					{ value: "stop ", label: "stop", description: "Terminate a running task" },
					{ value: "clear", label: "clear", description: "Remove finished tasks from the dashboard" },
				];
				const needle = trimmed.toLowerCase();
				return options.filter((option) => option.value.trim().startsWith(needle));
			}

			const [subcommand, maybeFlag] = parts;
			if (!(subcommand === "watch" || subcommand === "stop" || subcommand === "log")) {
				return null;
			}

			if (subcommand === "watch" && maybeFlag === "--follow") {
				return taskPromptOptions();
			}

			return taskPromptOptions();
		},
		handler: async (args, ctx) => {
			activeCtx = ctx;
			const trimmed = args.trim();
			if (!trimmed || trimmed === "dashboard") {
				await openDashboard(ctx);
				return;
			}

			if (trimmed === "list" || trimmed === "status") {
				ctx.ui.notify(formatTaskListText(), "info");
				return;
			}

			if (trimmed === "clear") {
				const removed = clearFinishedTasks();
				refreshUi();
				ctx.ui.notify(`Removed ${removed} finished background task(s).`, "info");
				return;
			}

			if (trimmed.startsWith("run ")) {
				const command = trimmed.slice(4).trim();
				if (!command) {
					ctx.ui.notify(`Usage: /${BG_COMMAND} run <command>`, "warning");
					return;
				}

				const task = spawnTask({ command, cwd: ctx.cwd });
				ctx.ui.notify(`Started ${task.id} (pid ${task.pid}) in the background.`, "info");
				return;
			}

			const watchMatch = trimmed.match(/^(watch|log)(?:\s+--follow)?\s+(.+)$/);
			if (watchMatch) {
				const [, action, token] = watchMatch;
				const task = resolveTask(token.trim());
				if (!task) {
					ctx.ui.notify("No background task matched that id or pid.", "warning");
					return;
				}
				await openDashboard(ctx, task, action === "watch" ? "output" : "tasks");
				return;
			}

			if (trimmed.startsWith("stop ")) {
				const token = trimmed.slice(5).trim();
				const task = resolveTask(token);
				const stopped = stopTask(task);
				ctx.ui.notify(stopped.message, stopped.ok ? "info" : "warning");
				return;
			}

			ctx.ui.notify(
				`Unknown /${BG_COMMAND} action. Try /${BG_COMMAND}, /${BG_COMMAND} run <command>, /${BG_COMMAND} watch [--follow] <id>, /${BG_COMMAND} stop <id>, or /${BG_COMMAND} clear.`,
				"warning",
			);
		},
	});

	pi.registerShortcut(BG_SHORTCUT, {
		description: "Open the background task dashboard",
		handler: async (ctx) => {
			activeCtx = ctx as ExtensionContext;
			await openDashboard(ctx as ExtensionContext);
		},
	});
}

export const backgroundTasksInternals = {
	renderTaskEventMessage,
	buildTaskEventLines,
};

export { createBgProcessShellEnv, getBgProcessLogFilePath } from "./background-tasks-shared.js";
