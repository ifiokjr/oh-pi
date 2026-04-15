import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { SchedulerRuntime } from "./scheduler.js";
import {
	formatDurationShort,
	normalizeDuration,
	parseDuration,
	parseLoopScheduleArgs,
	parseRemindScheduleArgs,
	validateSchedulePromptAddInput,
} from "./scheduler-parsing.js";
import { DEFAULT_LOOP_INTERVAL, MAX_TASKS, type ScheduleScope, type TaskKind } from "./scheduler-shared.js";

const SchedulePromptToolParams = Type.Object({
	action: Type.Union(
		[
			Type.Literal("add"),
			Type.Literal("list"),
			Type.Literal("delete"),
			Type.Literal("clear"),
			Type.Literal("enable"),
			Type.Literal("disable"),
			Type.Literal("adopt"),
			Type.Literal("release"),
			Type.Literal("clear_foreign"),
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
	scope: Type.Optional(
		Type.Union([Type.Literal("instance"), Type.Literal("workspace")], {
			description: "Task ownership scope. Use workspace for monitors that should survive instance changes.",
		}),
	),
	id: Type.Optional(Type.String({ description: "Task id for delete/enable/disable/adopt/release action" })),
	continueUntilComplete: Type.Optional(
		Type.Union([Type.Literal(true), Type.Literal(false)], {
			description: "Keep re-running this task until completion is detected.",
		}),
	),
	completionSignal: Type.Optional(
		Type.String({
			description: "Optional completion marker (substring or /regex/flags) that indicates the task is complete.",
		}),
	),
	retryInterval: Type.Optional(
		Type.String({
			description: "Delay between retries while waiting for completion (e.g. 2m, 10m).",
		}),
	),
	maxAttempts: Type.Optional(
		Type.Number({ description: "Optional maximum number of runs when continueUntilComplete is enabled." }),
	),
});

type ToolResult = { content: { type: "text"; text: string }[]; details: Record<string, unknown> };

function parseScopeFlag(input: string): { scope: ScheduleScope | undefined; rest: string } {
	const trimmed = input.trim();
	if (trimmed.startsWith("--workspace ") || trimmed === "--workspace") {
		return { scope: "workspace", rest: trimmed.slice("--workspace".length).trim() };
	}
	if (trimmed.startsWith("--instance ") || trimmed === "--instance") {
		return { scope: "instance", rest: trimmed.slice("--instance".length).trim() };
	}
	return { scope: undefined, rest: trimmed };
}

export function registerCommands(pi: ExtensionAPI, runtime: SchedulerRuntime) {
	pi.registerCommand("loop", {
		description:
			"Schedule recurring prompt: /loop 5m <prompt>, /loop --workspace 5m <prompt>, or /loop cron <expr> <prompt>",
		handler: async (args, ctx) => {
			const scoped = parseScopeFlag(args);
			const parsed = parseLoopScheduleArgs(scoped.rest);
			if (!parsed) {
				ctx.ui.notify(
					"Usage: /loop 5m check build OR /loop --workspace 5m check build OR /loop cron '*/5 * * * *' check build (minimum cron cadence is 1m)",
					"warning",
				);
				return;
			}

			if (runtime.taskCount >= MAX_TASKS) {
				ctx.ui.notify(`Task limit reached (${MAX_TASKS}). Delete one with /schedule delete <id>.`, "error");
				return;
			}

			if (parsed.recurring.mode === "cron") {
				const task = runtime.addRecurringCronTask(parsed.prompt, parsed.recurring.cronExpression, {
					scope: scoped.scope,
				});
				if (!task) {
					ctx.ui.notify("Invalid cron schedule. Cron tasks must run no more often than once per minute.", "error");
					return;
				}
				ctx.ui.notify(
					`Scheduled cron ${task.cronExpression} (id: ${task.id}). Expires in 3 days. Scope: ${task.scope ?? "instance"}.`,
					"info",
				);
				if (parsed.recurring.note) {
					ctx.ui.notify(parsed.recurring.note, "info");
				}
				return;
			}

			const task = runtime.addRecurringIntervalTask(parsed.prompt, parsed.recurring.durationMs, {
				scope: scoped.scope,
			});
			ctx.ui.notify(
				`Scheduled every ${formatDurationShort(parsed.recurring.durationMs)} (id: ${task.id}). Expires in 3 days. Scope: ${task.scope ?? "instance"}.`,
				"info",
			);
			if (parsed.recurring.note) {
				ctx.ui.notify(parsed.recurring.note, "info");
			}
		},
	});

	pi.registerCommand("remind", {
		description: "Schedule one-time reminder: /remind in 45m <prompt> or /remind --workspace in 45m <prompt>",
		handler: async (args, ctx) => {
			const scoped = parseScopeFlag(args);
			const parsed = parseRemindScheduleArgs(scoped.rest);
			if (!parsed) {
				ctx.ui.notify("Usage: /remind in 45m check deployment", "warning");
				return;
			}

			if (runtime.taskCount >= MAX_TASKS) {
				ctx.ui.notify(`Task limit reached (${MAX_TASKS}). Delete one with /schedule delete <id>.`, "error");
				return;
			}

			const task = runtime.addOneShotTask(parsed.prompt, parsed.durationMs, { scope: scoped.scope });
			ctx.ui.notify(
				`Reminder set for ${runtime.formatRelativeTime(task.nextRunAt)} (id: ${task.id}, scope: ${task.scope ?? "instance"}).`,
				"info",
			);
			if (parsed.note) {
				ctx.ui.notify(parsed.note, "info");
			}
		},
	});

	pi.registerCommand("schedule", {
		description:
			"Manage scheduled reminders and future check-ins. No args opens TUI manager. Also: list | enable <id> | disable <id> | delete <id> | clear | adopt <id|all> | release <id|all> | clear-foreign",
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Command router with multiple subcommands.
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (!trimmed || trimmed === "tui") {
				await runtime.openTaskManager(ctx);
				return;
			}

			const [rawAction, rawArg, rawExtra] = trimmed.split(/\s+/, 3);
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

			if (action === "adopt") {
				const target = rawArg?.trim() || "all";
				const result = runtime.adoptTasks(target);
				if (result.error) {
					ctx.ui.notify(result.error, "warning");
					return;
				}
				ctx.ui.notify(`Adopted ${result.count} scheduled task${result.count === 1 ? "" : "s"}.`, "info");
				return;
			}

			if (action === "release") {
				const target = rawArg?.trim() || "all";
				const result = runtime.releaseTasks(target);
				if (result.error) {
					ctx.ui.notify(result.error, "warning");
					return;
				}
				ctx.ui.notify(`Released ${result.count} scheduled task${result.count === 1 ? "" : "s"}.`, "info");
				return;
			}

			if (action === "clear-foreign") {
				const result = runtime.clearForeignTasks();
				ctx.ui.notify(`Cleared ${result.count} foreign scheduled task${result.count === 1 ? "" : "s"}.`, "info");
				return;
			}

			if (action === "scope") {
				ctx.ui.notify(
					"Change scope by recreating with --workspace/--instance or by adopting and re-scheduling. /schedule scope is not supported yet.",
					"info",
				);
				return;
			}

			if (action === "adopt" || action === "release") {
				ctx.ui.notify(`Usage: /schedule ${action} <id|all>`, "warning");
				return;
			}

			if (rawExtra) {
				ctx.ui.notify("Too many arguments for /schedule.", "warning");
				return;
			}

			ctx.ui.notify(
				"Usage: /schedule [tui|list|enable <id>|disable <id>|delete <id>|clear|adopt <id|all>|release <id|all>|clear-foreign]",
				"warning",
			);
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
			"Create/list/enable/disable/delete/adopt/release/clear scheduled prompts. Use this when the user asks for reminders, to check back later, or to follow up on PRs, CI, builds, deployments, or any recurring check. add requires prompt; once tasks require duration; recurring supports interval (duration) or cron expression (cron).",
		promptSnippet:
			"Create/list/enable/disable/delete/adopt/release/clear scheduled prompts for one-time reminders, future follow-ups, and recurring PR/CI/build/deployment checks. Supports intervals/cron and one-time reminders while this pi instance remains active unless scope='workspace' is used.",
		promptGuidelines: [
			"Use this tool when the user asks to remind/check back later, revisit something in the future, or monitor PRs, CI, builds, deploys, or background work.",
			"For recurring tasks use kind='recurring' with duration like 5m or 2h, or provide cron.",
			"For one-time reminders use kind='once' with duration like 30m or 1h.",
			"Set continueUntilComplete=true when the user explicitly wants retries until the task is done.",
			"Default scope is instance. Use scope='workspace' only for monitors that should be adoptable across pi instances in the same workspace.",
			"Scheduled tasks run only while pi is active and idle. Persisted overdue or foreign-owned tasks are restored for manual review instead of auto-running at startup.",
		],
		parameters: SchedulePromptToolParams,
		execute: async (
			_toolCallId,
			params: {
				action: string;
				kind?: TaskKind;
				prompt?: string;
				duration?: string;
				cron?: string;
				scope?: ScheduleScope;
				id?: string;
				continueUntilComplete?: boolean;
				completionSignal?: string;
				retryInterval?: string;
				maxAttempts?: number;
			},
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
			if (action === "adopt") {
				return handleToolAdopt(params, runtime);
			}
			if (action === "release") {
				return handleToolRelease(params, runtime);
			}
			if (action === "clear_foreign") {
				return handleToolClearForeign(runtime);
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
		const scheduleBase =
			task.kind === "once"
				? "-"
				: (task.cronExpression ?? formatDurationShort(task.intervalMs ?? DEFAULT_LOOP_INTERVAL));
		const schedule = task.continueUntilComplete ? `${scheduleBase} (until-complete)` : scheduleBase;
		const state = task.resumeRequired ? `due:${task.resumeReason ?? "unknown"}` : task.enabled ? "on" : "off";
		const status = task.resumeRequired ? "resume_required" : (task.lastStatus ?? "pending");
		const last = task.lastRunAt ? runtime.formatRelativeTime(task.lastRunAt) : "never";
		return `${task.id}\t${state}\t${task.kind}\t${task.scope ?? "instance"}\t${schedule}\t${runtime.formatRelativeTime(task.nextRunAt)}\t${task.runCount}\t${last}\t${status}\t${task.prompt}`;
	});
	return {
		content: [
			{
				type: "text",
				text: `Scheduled tasks (id\tstate\tkind\tscope\tschedule\tnext\truns\tlast\tstatus\tprompt):\n${lines.join("\n")}`,
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

function handleToolAdopt(params: { id?: string }, runtime: SchedulerRuntime): ToolResult {
	const target = params.id?.trim() || "all";
	const result = runtime.adoptTasks(target);
	if (result.error) {
		return {
			content: [{ type: "text", text: `Error: ${result.error}` }],
			details: { action: "adopt", error: result.error },
		};
	}
	return {
		content: [{ type: "text", text: `Adopted ${result.count} scheduled task${result.count === 1 ? "" : "s"}.` }],
		details: { action: "adopt", target, adopted: result.count },
	};
}

function handleToolRelease(params: { id?: string }, runtime: SchedulerRuntime): ToolResult {
	const target = params.id?.trim() || "all";
	const result = runtime.releaseTasks(target);
	if (result.error) {
		return {
			content: [{ type: "text", text: `Error: ${result.error}` }],
			details: { action: "release", error: result.error },
		};
	}
	return {
		content: [{ type: "text", text: `Released ${result.count} scheduled task${result.count === 1 ? "" : "s"}.` }],
		details: { action: "release", target, released: result.count },
	};
}

function handleToolClearForeign(runtime: SchedulerRuntime): ToolResult {
	const result = runtime.clearForeignTasks();
	return {
		content: [
			{ type: "text", text: `Cleared ${result.count} foreign scheduled task${result.count === 1 ? "" : "s"}.` },
		],
		details: { action: "clear_foreign", cleared: result.count },
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

function resolveCompletionOptions(params: {
	continueUntilComplete?: boolean;
	completionSignal?: string;
	retryInterval?: string;
	maxAttempts?: number;
}):
	| {
			ok: true;
			options: {
				continueUntilComplete?: boolean;
				completionSignal?: string;
				retryIntervalMs?: number;
				maxAttempts?: number;
			};
			note?: string;
	  }
	| { ok: false; error: string } {
	if (!params.continueUntilComplete) {
		return {
			ok: true,
			options: {
				continueUntilComplete: false,
			},
		};
	}

	let retryIntervalMs: number | undefined;
	let note: string | undefined;
	if (params.retryInterval) {
		const parsed = parseDuration(params.retryInterval);
		if (!parsed) {
			return { ok: false, error: "invalid_retry_interval" };
		}
		const normalized = normalizeDuration(parsed);
		retryIntervalMs = normalized.durationMs;
		note = normalized.note;
	}

	let maxAttempts: number | undefined;
	if (params.maxAttempts !== undefined) {
		if (!Number.isFinite(params.maxAttempts) || params.maxAttempts < 1) {
			return { ok: false, error: "invalid_max_attempts" };
		}
		maxAttempts = Math.floor(params.maxAttempts);
	}

	const completionSignal = params.completionSignal?.trim();
	return {
		ok: true,
		options: {
			continueUntilComplete: true,
			completionSignal: completionSignal || undefined,
			retryIntervalMs,
			maxAttempts,
		},
		note,
	};
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handles validation + messaging for multiple schedule modes and completion policies.
function handleToolAdd(
	params: {
		kind?: TaskKind;
		prompt?: string;
		duration?: string;
		cron?: string;
		scope?: ScheduleScope;
		continueUntilComplete?: boolean;
		completionSignal?: string;
		retryInterval?: string;
		maxAttempts?: number;
	},
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

	const completion = resolveCompletionOptions({
		continueUntilComplete: params.continueUntilComplete,
		completionSignal: params.completionSignal,
		retryInterval: params.retryInterval,
		maxAttempts: params.maxAttempts,
	});
	if (!completion.ok) {
		return {
			content: [
				{
					type: "text",
					text:
						completion.error === "invalid_retry_interval"
							? "Error: retryInterval must be a duration like 2m, 10m, or 1h."
							: "Error: maxAttempts must be a positive number.",
				},
			],
			details: { action: "add", error: completion.error },
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
		const task = runtime.addOneShotTask(prompt, validated.plan.durationMs, {
			scope: params.scope,
			...completion.options,
		});
		return {
			content: [
				{
					type: "text",
					text: `Reminder scheduled (id: ${task.id}) for ${runtime.formatRelativeTime(task.nextRunAt)} as ${task.scope ?? "instance"}-scoped.${
						validated.plan.note ? ` ${validated.plan.note}` : ""
					}${completion.options.continueUntilComplete ? " Will retry until marked complete." : ""}${
						completion.note ? ` ${completion.note}` : ""
					}`,
				},
			],
			details: { action: "add", task },
		};
	}

	if (validated.plan.mode === "cron") {
		const task = runtime.addRecurringCronTask(prompt, validated.plan.cronExpression, {
			scope: params.scope,
			...completion.options,
		});
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
					text: `Recurring cron task scheduled (id: ${task.id}) with '${task.cronExpression}' as ${task.scope ?? "instance"}-scoped. Expires in 3 days.${
						validated.plan.note ? ` ${validated.plan.note}` : ""
					}${completion.options.continueUntilComplete ? " Will retry until marked complete." : ""}${
						completion.note ? ` ${completion.note}` : ""
					}`,
				},
			],
			details: { action: "add", task },
		};
	}

	const task = runtime.addRecurringIntervalTask(prompt, validated.plan.durationMs, {
		scope: params.scope,
		...completion.options,
	});
	return {
		content: [
			{
				type: "text",
				text: `Recurring task scheduled (id: ${task.id}) every ${formatDurationShort(validated.plan.durationMs)} as ${task.scope ?? "instance"}-scoped. Expires in 3 days.${
					validated.plan.note ? ` ${validated.plan.note}` : ""
				}${completion.options.continueUntilComplete ? " Will retry until marked complete." : ""}${
					completion.note ? ` ${completion.note}` : ""
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
		await runtime.handleStartupOwnership(ctx);
		runtime.startScheduler();
		runtime.notifyResumeRequiredTasks();
	});

	pi.on("session_switch", refreshRuntimeContext);
	pi.on("session_fork", refreshRuntimeContext);
	pi.on("session_tree", refreshRuntimeContext);

	pi.on("agent_end", (event) => {
		runtime.handleAgentEnd(event as { messages?: Array<{ role?: string; content?: unknown }> });
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		runtime.setRuntimeContext(ctx);
		runtime.stopScheduler();
		runtime.clearStatus(ctx);
	});

	// Listen for safe-mode changes to throttle scheduler ticks and suppress UI churn.
	pi.events.on("oh-pi:safe-mode", (data) => {
		runtime.setSafeModeEnabled(Boolean((data as { enabled?: boolean } | undefined)?.enabled));
	});
}
