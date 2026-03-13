import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { runSync } from "@ifi/pi-extension-subagents/execution.ts";
import { getFinalOutput } from "@ifi/pi-extension-subagents/utils.ts";
import type {
	NormalizedTaskAgentTask,
	PlanModeState,
	TaskAgentActivity,
	TaskAgentActivityKind,
	TaskAgentProgressDetails,
	TaskAgentRunDetails,
	TaskAgentRunRecord,
	TaskAgentTask,
	TaskAgentTaskProgress,
	TaskAgentTaskResult,
} from "./types.js";
import { resolveTaskAgentConcurrency } from "./utils.js";

type PlanningAgentConfig = {
	name: string;
	description: string;
	systemPrompt: string;
	source: "builtin";
	filePath: string;
	tools?: string[];
	model?: string;
	thinking?: string;
	skills?: string[];
	extensions?: string[];
	mcpDirectTools?: string[];
};

type TaskAgentProgressSnapshot = {
	currentTool?: string;
	currentToolArgs?: string;
	recentOutput?: string[];
};

type RunTaskAgentTaskOptions = {
	signal?: AbortSignal;
	onActivity?: (activity: TaskAgentActivity) => void;
	steeringInstruction?: string;
	previousOutput?: string;
	steeringNotes?: string[];
	runId: string;
	index: number;
};

const require = createRequire(import.meta.url);

function requirePiTui() {
	try {
		return require("@mariozechner/pi-tui");
	} catch (error) {
		const code = (error as { code?: string }).code;
		if (code !== "MODULE_NOT_FOUND") {
			throw error;
		}
		return require(path.join(os.homedir(), ".bun", "install", "global", "node_modules", "@mariozechner", "pi-tui"));
	}
}

function createRenderText(text: string) {
	const { Text } = requirePiTui() as {
		Text: new (text: string, x: number, y: number) => unknown;
	};
	return new Text(text, 0, 0);
}

function createTextContent(text: string) {
	return {
		type: "text" as const,
		text,
	};
}

const TASK_AGENT_PREVIEW_LIMIT = 4;
const PLANNING_AGENT_NAME = "plan-researcher";
const PLANNING_AGENT_DESCRIPTION = "Focused read-only research subagent for plan mode";
const PLANNING_AGENT_FILE_PATH = "virtual:@ifi/pi-plan/plan-researcher.md";
const PLANNING_AGENT_TOOL_ALLOWLIST = [
	"read",
	"grep",
	"find",
	"ls",
	"bash",
	"web_search",
	"fetch_content",
	"get_search_content",
	"mcp",
] as const;

function summarizeSnippet(text: string, maxLength: number = 120): string {
	const singleLine = text.replace(/\s+/g, " ").trim();
	if (!singleLine) {
		return "";
	}
	if (singleLine.length <= maxLength) {
		return singleLine;
	}
	return `${singleLine.slice(0, maxLength - 3)}...`;
}

function indentMultiline(text: string, indent: string): string[] {
	return text.replace(/\r\n/g, "\n").split("\n").map((line) => `${indent}${line}`);
}

function formatTaskAgentDuration(result: TaskAgentTaskResult): string {
	const durationMs = Math.max(0, result.finishedAt - result.startedAt);
	if (durationMs < 1_000) {
		return `${durationMs}ms`;
	}
	if (durationMs < 60_000) {
		return `${(durationMs / 1_000).toFixed(1)}s`;
	}
	return `${(durationMs / 60_000).toFixed(1)}m`;
}

function formatTaskAgentActivity(activity: TaskAgentActivity): string {
	switch (activity.kind) {
		case "tool":
			return `→ ${activity.text}`;
		case "assistant":
			return `✎ ${activity.text}`;
		case "toolResult":
			return `↳ ${activity.text}`;
		case "stderr":
			return `! ${activity.text}`;
		default:
			return `• ${activity.text}`;
	}
}

function cloneTaskAgentProgress(tasks: TaskAgentTaskProgress[]): TaskAgentTaskProgress[] {
	return tasks.map((task) => ({ ...task }));
}

function buildTaskAgentProgressText(
	runId: string,
	tasks: TaskAgentTaskProgress[],
	completed: number,
	total: number,
): string {
	const lines: string[] = [`Task agent run ${runId}: ${completed}/${total} complete`];
	for (const task of tasks) {
		const status = task.status.padEnd(9, " ");
		const latest = task.latestActivity ? ` — ${task.latestActivity}` : "";
		lines.push(`[${task.taskId}] ${status}${latest}`);
	}
	return lines.join("\n");
}

function resolvePlanningAgentTools(pi: ExtensionAPI): string[] | undefined {
	const activeTools = new Set(pi.getActiveTools());
	const tools = PLANNING_AGENT_TOOL_ALLOWLIST.filter((toolName) => activeTools.has(toolName));
	return tools.length > 0 ? [...tools] : undefined;
}

function buildPlanningAgentConfig(pi: ExtensionAPI): PlanningAgentConfig {
	return {
		name: PLANNING_AGENT_NAME,
		description: PLANNING_AGENT_DESCRIPTION,
		systemPrompt: [
			"You are a focused research subagent working for a planning workflow.",
			"Stay read-only. Do not edit files or write patches.",
			"Prefer direct local inspection before making assumptions.",
			"Return markdown with the sections: Summary and References.",
			"In References, include concrete file paths, symbols, commands, and URLs you relied on. If none, write 'None'.",
		].join("\n\n"),
		source: "builtin",
		filePath: PLANNING_AGENT_FILE_PATH,
		tools: resolvePlanningAgentTools(pi),
	};
}

function extractReferences(text: string): string[] {
	const references = new Set<string>();
	for (const match of text.matchAll(/https?:\/\/\S+/g)) {
		references.add(match[0].replace(/[),.;]+$/, ""));
	}

	const lines = text.replace(/\r\n/g, "\n").split("\n");
	let insideReferences = false;
	for (const line of lines) {
		const trimmed = line.trim();
		if (/^#{1,6}\s*references\b/i.test(trimmed) || /^references\s*:?[\s]*$/i.test(trimmed)) {
			insideReferences = true;
			continue;
		}
		if (!insideReferences) {
			continue;
		}
		if (/^#{1,6}\s+/.test(trimmed)) {
			break;
		}
		const bullet = trimmed.match(/^[-*]\s+(.+)$/) ?? trimmed.match(/^\d+\.\s+(.+)$/);
		if (bullet?.[1]) {
			references.add(bullet[1].trim());
		}
	}

	return Array.from(references);
}

function createTaskAgentRunId(): string {
	return `run-${randomBytes(4).toString("hex")}`;
}

function normalizeTaskAgentTaskId(rawId: string | undefined, index: number, used: Set<string>): string {
	const fallback = `task-${index + 1}`;
	const base =
		rawId
			?.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^[-_]+|[-_]+$/g, "") || fallback;

	let id = base;
	let suffix = 2;
	while (used.has(id)) {
		id = `${base}-${suffix}`;
		suffix += 1;
	}

	used.add(id);
	return id;
}

export function normalizeTaskAgentTasks(tasks: TaskAgentTask[]): NormalizedTaskAgentTask[] {
	const used = new Set<string>();
	return tasks.map((task, index) => ({
		id: normalizeTaskAgentTaskId(task.id, index, used),
		prompt: task.prompt,
		cwd: task.cwd,
	}));
}

async function runWithConcurrencyLimit<TIn, TOut>(
	items: TIn[],
	concurrency: number,
	runner: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
	if (items.length === 0) {
		return [];
	}

	const normalizedConcurrency = Number.isFinite(concurrency) ? Math.floor(concurrency) : 1;
	const limit = Math.max(1, Math.min(normalizedConcurrency, items.length));
	const results = new Array<TOut>(items.length);
	let nextIndex = 0;

	const workers = new Array(limit).fill(null).map(async () => {
		while (true) {
			const index = nextIndex++;
			if (index >= items.length) {
				return;
			}
			results[index] = await runner(items[index], index);
		}
	});

	await Promise.all(workers);
	return results;
}

function buildTaskAgentPrompt(task: NormalizedTaskAgentTask, options?: RunTaskAgentTaskOptions): string {
	const promptParts = [
		"You are helping produce an implementation plan.",
		`Task ID: ${task.id}`,
		`Task: ${task.prompt}`,
		"Return markdown with the sections Summary and References.",
	];

	if (options?.steeringInstruction?.trim()) {
		promptParts.push(`Steering update from the main planning agent:\n${options.steeringInstruction.trim()}`);
		if (options.previousOutput?.trim()) {
			promptParts.push(`Most recent output for this task:\n${options.previousOutput.trim()}`);
		}
	}

	return promptParts.join("\n\n");
}

function recordTaskAgentActivity(
	activities: TaskAgentActivity[],
	kind: TaskAgentActivityKind,
	text: string,
	onActivity?: (activity: TaskAgentActivity) => void,
): void {
	const normalized = summarizeSnippet(text, 180);
	if (!normalized) {
		return;
	}
	const last = activities[activities.length - 1];
	if (last?.kind === kind && last.text === normalized) {
		return;
	}

	const activity: TaskAgentActivity = {
		kind,
		text: normalized,
		timestamp: Date.now(),
	};
	activities.push(activity);
	if (activities.length > 120) {
		activities.shift();
	}
	onActivity?.(activity);
}

async function runTaskAgentTask(
	pi: ExtensionAPI,
	task: NormalizedTaskAgentTask,
	defaultCwd: string,
	options: RunTaskAgentTaskOptions,
): Promise<TaskAgentTaskResult> {
	const activities: TaskAgentActivity[] = [];
	const cwd = task.cwd?.trim() ? task.cwd : defaultCwd;
	const startedAt = Date.now();
	let latestProgress: TaskAgentProgressSnapshot | undefined;

	recordTaskAgentActivity(activities, "status", "started", options.onActivity);

	const result = await runSync(
		defaultCwd,
		[buildPlanningAgentConfig(pi)],
		PLANNING_AGENT_NAME,
		buildTaskAgentPrompt(task, options),
		{
			cwd,
			runId: `${options.runId}-${task.id}`,
			index: options.index,
			signal: options.signal,
			onUpdate: (update) => {
				const details = update.details as { progress?: TaskAgentProgressSnapshot[] } | undefined;
				const progress = details?.progress?.[0];
				if (!progress) {
					return;
				}

				if (progress.currentTool) {
					const argsPreview = progress.currentToolArgs?.trim();
					const toolSummary = argsPreview ? `${progress.currentTool} ${argsPreview}` : progress.currentTool;
					recordTaskAgentActivity(activities, "tool", toolSummary, options.onActivity);
				}

				const latestOutput = progress.recentOutput?.[progress.recentOutput.length - 1];
				if (latestOutput) {
					recordTaskAgentActivity(activities, "assistant", latestOutput, options.onActivity);
				}

				latestProgress = progress;
			},
		},
	);

	const output = getFinalOutput(result.messages).trim();
	if (output) {
		recordTaskAgentActivity(activities, "assistant", output, options.onActivity);
	}
	if (result.error?.trim()) {
		recordTaskAgentActivity(activities, "stderr", result.error.trim(), options.onActivity);
	}
	if (latestProgress?.currentTool) {
		recordTaskAgentActivity(activities, "toolResult", `finished ${latestProgress.currentTool}`, options.onActivity);
	}
	recordTaskAgentActivity(
		activities,
		"status",
		`finished (${result.exitCode === 0 ? "ok" : "failed"})`,
		options.onActivity,
	);

	return {
		taskId: task.id,
		task: task.prompt,
		cwd,
		output,
		references: extractReferences(output),
		exitCode: result.exitCode,
		stderr: result.error?.trim() ?? "",
		activities,
		startedAt,
		finishedAt: Date.now(),
		steeringNotes: options.steeringNotes ?? [],
	};
}

function formatTaskAgentResult(result: TaskAgentTaskResult, index: number): string {
	const status = result.exitCode === 0 ? "completed" : "failed";
	const header = `Task ${index + 1} (${result.taskId}): ${status}`;
	const output = result.output.trim().length > 0 ? result.output.trim() : "(no output)";
	const refs = result.references.length > 0 ? result.references.map((ref) => `- ${ref}`).join("\n") : "- None";
	const recentActivities = result.activities.slice(-6);
	const activityText =
		recentActivities.length > 0
			? recentActivities.map((activity) => `- ${formatTaskAgentActivity(activity)}`).join("\n")
			: "- (no activity captured)";

	if (result.exitCode !== 0) {
		const stderr = result.stderr.trim().length > 0 ? result.stderr.trim() : "unknown error";
		return `${header}\nPrompt: ${result.task}\nCWD: ${result.cwd}\nDuration: ${formatTaskAgentDuration(result)}\nRecent activity:\n${activityText}\nError: ${stderr}`;
	}

	return `${header}\nPrompt: ${result.task}\nCWD: ${result.cwd}\nDuration: ${formatTaskAgentDuration(result)}\nRecent activity:\n${activityText}\n\n${output}\n\nReferences:\n${refs}`;
}

export function buildTaskAgentRunDetails(runId: string, results: TaskAgentTaskResult[]): TaskAgentRunDetails {
	const successCount = results.filter((result) => result.exitCode === 0).length;
	return {
		runId,
		tasks: results,
		successCount,
		totalCount: results.length,
	};
}

function isTaskAgentProgressDetails(details: unknown): details is TaskAgentProgressDetails {
	if (!details || typeof details !== "object") {
		return false;
	}
	const value = details as Partial<TaskAgentProgressDetails>;
	return (
		typeof value.runId === "string" &&
		typeof value.completed === "number" &&
		typeof value.total === "number" &&
		Array.isArray(value.tasks)
	);
}

function isTaskAgentRunDetails(details: unknown): details is TaskAgentRunDetails {
	if (!details || typeof details !== "object") {
		return false;
	}
	const value = details as Partial<TaskAgentRunDetails>;
	return (
		typeof value.runId === "string" &&
		typeof value.successCount === "number" &&
		typeof value.totalCount === "number" &&
		Array.isArray(value.tasks)
	);
}

function statusIcon(status: TaskAgentTaskProgress["status"]): string {
	switch (status) {
		case "completed":
			return "✓";
		case "failed":
			return "✗";
		case "running":
			return "⏳";
		default:
			return "○";
	}
}

export function registerTaskAgentTools(
	pi: ExtensionAPI,
	dependencies: {
		getState: () => PlanModeState;
		taskAgentsSchema: unknown;
		steerTaskAgentSchema: unknown;
	},
) {
	const taskAgentRuns = new Map<string, TaskAgentRunRecord>();

	const rememberTaskAgentRun = (run: TaskAgentRunRecord) => {
		taskAgentRuns.set(run.runId, run);
		while (taskAgentRuns.size > 20) {
			const oldestRunId = taskAgentRuns.keys().next().value;
			if (!oldestRunId) {
				break;
			}
			taskAgentRuns.delete(oldestRunId);
		}
	};

	pi.registerTool({
		name: "task_agents",
		label: "task agents",
		description:
			"Run one or more isolated research task agents in parallel using the bundled subagent runtime, with activity traces and run IDs for follow-up steering.",
		parameters: dependencies.taskAgentsSchema,
		renderCall(args, theme) {
			const tasks = (args.tasks as TaskAgentTask[] | undefined) ?? [];
			const lines: string[] = [
				`${theme.fg("toolTitle", theme.bold("task agents "))}${theme.fg("accent", `${tasks.length} task${tasks.length === 1 ? "" : "s"}`)}`,
			];
			for (const task of tasks.slice(0, TASK_AGENT_PREVIEW_LIMIT)) {
				const taskId = task.id?.trim() || "(auto-id)";
				lines.push(`${theme.fg("muted", `- ${taskId}:`)} ${summarizeSnippet(task.prompt, 90)}`);
			}
			if (tasks.length > TASK_AGENT_PREVIEW_LIMIT) {
				lines.push(theme.fg("muted", `... +${tasks.length - TASK_AGENT_PREVIEW_LIMIT} more (Ctrl+O to expand after start)`));
			}
			return createRenderText(lines.join("\n"));
		},
		renderResult(result, { expanded, isPartial }, theme) {
			const details = result.details;
			if (isPartial && isTaskAgentProgressDetails(details)) {
				const lines: string[] = [
					`${theme.fg("toolTitle", theme.bold("task agents "))}${theme.fg("accent", details.runId)} ${theme.fg("muted", `${details.completed}/${details.total}`)}`,
				];
				const visibleTasks = expanded ? details.tasks : details.tasks.slice(0, TASK_AGENT_PREVIEW_LIMIT);
				for (const task of visibleTasks) {
					const color = task.status === "failed" ? "error" : task.status === "completed" ? "success" : "warning";
					const suffix = task.latestActivity ? ` ${theme.fg("dim", summarizeSnippet(task.latestActivity, 80))}` : "";
					lines.push(`${theme.fg(color, statusIcon(task.status))} ${theme.fg("accent", task.taskId)} ${theme.fg("muted", task.status)}${suffix}`);
				}
				if (!expanded && details.tasks.length > TASK_AGENT_PREVIEW_LIMIT) {
					lines.push(theme.fg("muted", `... +${details.tasks.length - TASK_AGENT_PREVIEW_LIMIT} more running tasks`));
					lines.push(theme.fg("muted", "Press Ctrl+O to expand and show every task."));
				}
				return createRenderText(lines.join("\n"));
			}

			if (!isTaskAgentRunDetails(details)) {
				const text = result.content.find((item) => item.type === "text");
				return createRenderText(text?.type === "text" ? text.text : "(no output)");
			}

			const lines: string[] = [
				`${theme.fg("toolTitle", theme.bold("task agents "))}${theme.fg("accent", details.runId)} ${theme.fg("muted", `${details.successCount}/${details.totalCount} succeeded`)}`,
			];
			const visibleTasks = expanded ? details.tasks : details.tasks.slice(0, TASK_AGENT_PREVIEW_LIMIT);
			for (const task of visibleTasks) {
				const icon = task.exitCode === 0 ? theme.fg("success", "✓") : theme.fg("error", "✗");
				if (!expanded) {
					lines.push(`${icon} ${theme.fg("accent", task.taskId)} ${theme.fg("muted", summarizeSnippet(task.task, 80))}`);
					continue;
				}

				const taskStatus = task.exitCode === 0 ? theme.fg("success", "completed") : theme.fg("error", "failed");
				lines.push(`${icon} ${theme.fg("accent", task.taskId)} ${taskStatus}`);
				lines.push(...indentMultiline(`Prompt: ${task.task}`, "  "));
				lines.push(`  ${theme.fg("muted", "CWD:")} ${task.cwd}`);
				lines.push(`  ${theme.fg("muted", "Duration:")} ${formatTaskAgentDuration(task)}`);

				if (task.steeringNotes.length > 0) {
					lines.push(`  ${theme.fg("muted", "Steering notes:")}`);
					for (const note of task.steeringNotes) {
						lines.push(...indentMultiline(`- ${note}`, "    "));
					}
				}

				lines.push(`  ${theme.fg("muted", "Activity:")}`);
				if (task.activities.length === 0) {
					lines.push(`    ${theme.fg("dim", "(no activity captured)")}`);
				} else {
					for (const activity of task.activities) {
						lines.push(`    ${theme.fg("dim", formatTaskAgentActivity(activity))}`);
					}
				}

				if (task.exitCode !== 0) {
					const stderr = task.stderr.trim().length > 0 ? task.stderr.trim() : "unknown error";
					lines.push(`  ${theme.fg("error", "Error:")}`);
					lines.push(...indentMultiline(stderr, "    "));
					continue;
				}

				const output = task.output.trim().length > 0 ? task.output.trim() : "(no output)";
				lines.push(`  ${theme.fg("muted", "Output:")}`);
				lines.push(...indentMultiline(output, "    "));
				lines.push(`  ${theme.fg("muted", "References:")}`);
				if (task.references.length === 0) {
					lines.push("    - None");
				} else {
					for (const reference of task.references) {
						lines.push(`    - ${reference}`);
					}
				}
			}

			if (!expanded) {
				if (details.tasks.length > TASK_AGENT_PREVIEW_LIMIT) {
					lines.push(theme.fg("muted", `... +${details.tasks.length - TASK_AGENT_PREVIEW_LIMIT} more tasks`));
				}
				lines.push(theme.fg("muted", "Press Ctrl+O to expand and show all tasks, outputs, and activity traces."));
			} else {
				lines.push(theme.fg("muted", "Ctrl+O to collapse."));
			}
			return createRenderText(lines.join("\n"));
		},
		async execute(_toolCallId, params, signal, onUpdate, ctx): Promise<AgentToolResult<TaskAgentRunDetails>> {
			if (!dependencies.getState().active) {
				return {
					isError: true,
					content: [createTextContent("task_agents is only available while plan mode is active.")],
				};
			}

			const tasks = normalizeTaskAgentTasks(params.tasks as TaskAgentTask[]);
			const concurrency = resolveTaskAgentConcurrency(params.concurrency);
			if (concurrency === null) {
				return {
					isError: true,
					content: [createTextContent("concurrency must be an integer between 1 and 4.")],
				};
			}
			const runId = createTaskAgentRunId();
			let completed = 0;

			const progress: TaskAgentTaskProgress[] = tasks.map((task) => ({
				taskId: task.id,
				prompt: task.prompt,
				status: "queued",
				activityCount: 0,
			}));

			const emitProgress = () => {
				onUpdate?.({
					content: [createTextContent(buildTaskAgentProgressText(runId, progress, completed, tasks.length))],
					details: {
						runId,
						completed,
						total: tasks.length,
						tasks: cloneTaskAgentProgress(progress),
					} satisfies TaskAgentProgressDetails,
				});
			};

			emitProgress();

			const results = await runWithConcurrencyLimit(tasks, concurrency, async (task, index) => {
				progress[index] = {
					...progress[index],
					status: "running",
					latestActivity: "started",
				};
				emitProgress();

				const result = await runTaskAgentTask(pi, task, ctx.cwd, {
					signal,
					runId,
					index,
					onActivity: (activity) => {
						progress[index] = {
							...progress[index],
							latestActivity: formatTaskAgentActivity(activity),
							activityCount: progress[index].activityCount + 1,
						};
						emitProgress();
					},
				});

				completed += 1;
				progress[index] = {
					...progress[index],
					status: result.exitCode === 0 ? "completed" : "failed",
					latestActivity: `finished (${result.exitCode === 0 ? "ok" : "failed"})`,
				};
				emitProgress();
				return result;
			});

			const details = buildTaskAgentRunDetails(runId, results);
			rememberTaskAgentRun({
				runId,
				createdAt: Date.now(),
				tasks: results,
			});

			const formatted = results.map((result, index) => formatTaskAgentResult(result, index)).join("\n\n---\n\n");
			const summaryHeader = `Task agent research run ${runId}: ${details.successCount}/${details.totalCount} tasks succeeded.`;
			const steeringHint =
				`Use steer_task_agent with runId "${runId}" and a taskId to rerun a specific task with extra instruction.`;

			return {
				content: [createTextContent(`${summaryHeader}\n${steeringHint}\n\n${formatted}`)],
				details,
				isError: details.successCount !== details.totalCount,
			};
		},
	});

	pi.registerTool({
		name: "steer_task_agent",
		label: "steer task agent",
		description:
			"Rerun one task from a previous task_agents run using the subagent runtime with an extra steering instruction.",
		parameters: dependencies.steerTaskAgentSchema,
		renderCall(args, theme) {
			const instruction = summarizeSnippet(args.instruction ?? "", 90);
			return createRenderText(
				`${theme.fg("toolTitle", theme.bold("steer task agent "))}${theme.fg("accent", `${args.runId}/${args.taskId}`)}\n${theme.fg("muted", instruction)}`,
			);
		},
		async execute(_toolCallId, params, signal, onUpdate, ctx): Promise<AgentToolResult<TaskAgentRunDetails>> {
			if (!dependencies.getState().active) {
				return {
					isError: true,
					content: [createTextContent("steer_task_agent is only available while plan mode is active.")],
				};
			}

			const runId = String(params.runId ?? "").trim();
			const taskId = String(params.taskId ?? "").trim();
			const instruction = String(params.instruction ?? "").trim();
			if (!runId || !taskId || !instruction) {
				return {
					isError: true,
					content: [createTextContent("runId, taskId, and instruction are required.")],
				};
			}

			const run = taskAgentRuns.get(runId);
			if (!run) {
				const knownRunIds = Array.from(taskAgentRuns.keys());
				return {
					isError: true,
					content: [
						createTextContent(
							knownRunIds.length > 0
								? `Unknown runId "${runId}". Known runIds: ${knownRunIds.join(", ")}`
								: `Unknown runId "${runId}". No prior task agent runs are available.`,
						),
					],
				};
			}

			const taskIndex = run.tasks.findIndex((task) => task.taskId === taskId);
			if (taskIndex === -1) {
				const knownTaskIds = run.tasks.map((task) => task.taskId).join(", ");
				return {
					isError: true,
					content: [createTextContent(`Unknown taskId "${taskId}" for run ${runId}. Known taskIds: ${knownTaskIds}`)],
				};
			}

			const previousTask = run.tasks[taskIndex];
			onUpdate?.({
				content: [createTextContent(`Steering ${taskId} in ${runId}...`)],
				details: {
					runId,
					completed: run.tasks.filter((task) => task.exitCode === 0).length,
					total: run.tasks.length,
					tasks: run.tasks.map((task, index) => ({
						taskId: task.taskId,
						prompt: task.task,
						status: index === taskIndex ? "running" : task.exitCode === 0 ? "completed" : "failed",
						latestActivity: index === taskIndex ? "re-running with steering" : undefined,
						activityCount: task.activities.length,
					})),
				} satisfies TaskAgentProgressDetails,
			});

			const steeringNotes = [...previousTask.steeringNotes, instruction];
			const rerunTask: NormalizedTaskAgentTask = {
				id: previousTask.taskId,
				prompt: previousTask.task,
				cwd: previousTask.cwd,
			};

			const rerunResult = await runTaskAgentTask(pi, rerunTask, ctx.cwd, {
				signal,
				runId,
				index: taskIndex,
				steeringInstruction: instruction,
				previousOutput: previousTask.output,
				steeringNotes,
				onActivity: (activity) => {
					onUpdate?.({
						content: [createTextContent(`Steering ${taskId}: ${formatTaskAgentActivity(activity)}`)],
					});
				},
			});

			run.tasks[taskIndex] = rerunResult;
			rememberTaskAgentRun(run);
			const details = buildTaskAgentRunDetails(runId, run.tasks);
			const summaryHeader = `Steered ${taskId} in run ${runId}. Run status: ${details.successCount}/${details.totalCount} succeeded.`;

			return {
				content: [createTextContent(`${summaryHeader}\n\n${formatTaskAgentResult(rerunResult, taskIndex)}`)],
				details,
				isError: rerunResult.exitCode !== 0,
			};
		},
	});
}
