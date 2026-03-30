import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { SchedulerRuntime } from "./scheduler.js";
import {
	formatDurationShort,
	parseLoopScheduleArgs,
	parseRemindScheduleArgs,
	validateSchedulePromptAddInput,
} from "./scheduler-parsing.js";
import { DEFAULT_LOOP_INTERVAL, MAX_TASKS, type TaskKind } from "./scheduler-shared.js";

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

type ToolResult = { content: { type: "text"; text: string }[]; details: Record<string, unknown> };

export function registerCommands(pi: ExtensionAPI, runtime: SchedulerRuntime) {
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
			"Manage scheduled reminders and future check-ins. No args opens TUI manager. Also: list | enable <id> | disable <id> | delete <id> | clear",
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

export function registerTools(pi: ExtensionAPI, runtime: SchedulerRuntime) {
	pi.registerTool({
		name: "schedule_prompt",
		label: "Schedule Prompt",
		description:
			"Create/list/enable/disable/delete scheduled prompts. Use this when the user asks for reminders, to check back later, or to follow up on PRs, CI, builds, deployments, or any recurring check. add requires prompt; once tasks require duration; recurring supports interval (duration) or cron expression (cron).",
		promptSnippet:
			"Create/list/enable/disable/delete scheduled prompts for one-time reminders, future follow-ups, and recurring PR/CI/build/deployment checks. Supports intervals/cron and one-time reminders while this pi session remains active.",
		promptGuidelines: [
			"Use this tool when the user asks to remind/check back later, revisit something in the future, or monitor PRs, CI, builds, deploys, or background work.",
			"For recurring tasks use kind='recurring' with duration like 5m or 2h, or provide cron.",
			"For one-time reminders use kind='once' with duration like 30m or 1h.",
			"Scheduled tasks run only while pi is active and idle. Persisted overdue tasks are restored for manual review instead of auto-running at startup.",
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
		const state = task.resumeRequired ? "due" : task.enabled ? "on" : "off";
		const status = task.resumeRequired ? "resume_required" : (task.lastStatus ?? "pending");
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

export function registerEvents(pi: ExtensionAPI, runtime: SchedulerRuntime) {
	const refreshRuntimeContext = (_event: unknown, ctx: ExtensionContext) => {
		runtime.setRuntimeContext(ctx);
		runtime.updateStatus();
	};

	pi.on("session_start", async (event, ctx) => {
		refreshRuntimeContext(event, ctx);
		runtime.startScheduler();
		runtime.notifyResumeRequiredTasks();
	});

	pi.on("session_switch", refreshRuntimeContext);
	pi.on("session_fork", refreshRuntimeContext);
	pi.on("session_tree", refreshRuntimeContext);

	pi.on("session_shutdown", async (_event, ctx) => {
		runtime.setRuntimeContext(ctx);
		runtime.stopScheduler();
		runtime.clearStatus(ctx);
	});
}
