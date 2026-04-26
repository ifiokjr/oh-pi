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
import {
	DEFAULT_LOOP_INTERVAL,
	DEFAULT_RECURRING_EXPIRY_MS,
	MAX_RECURRING_EXPIRY_MS,
	MAX_TASKS,
} from "./scheduler-shared.js";
import type { ScheduleScope, TaskKind } from "./scheduler-shared.js";

const STARTUP_OWNERSHIP_DELAY_MS = 250;

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
			Type.Literal("clear_other"),
		],
		{ description: "Action to perform" },
	),
	completionSignal: Type.Optional(
		Type.String({
			description: "Optional completion marker (substring or /regex/flags) that indicates the task is complete.",
		}),
	),
	continueUntilComplete: Type.Optional(
		Type.Union([Type.Literal(true), Type.Literal(false)], {
			description: "Keep re-running this task until completion is detected.",
		}),
	),
	cron: Type.Optional(
		Type.String({
			description:
				"Cron expression for recurring tasks. Accepts 5-field (minute hour dom month dow) or 6-field (sec minute hour dom month dow).",
		}),
	),
	duration: Type.Optional(
		Type.String({
			description:
				"Delay/interval like 5m, 2h, 1 day. For kind=once this is required. For kind=recurring this creates interval-based loops.",
		}),
	),
	expires: Type.Optional(
		Type.String({
			description: "Optional recurring task expiry like 30m, 1h, or 1 day. Defaults to 1 day and is capped at 1 day.",
		}),
	),
	id: Type.Optional(Type.String({ description: "Task id for delete/enable/disable/adopt/release action" })),
	kind: Type.Optional(Type.Union([Type.Literal("recurring"), Type.Literal("once")], { description: "Task kind" })),
	maxAttempts: Type.Optional(
		Type.Number({ description: "Optional maximum number of runs when continueUntilComplete is enabled." }),
	),
	prompt: Type.Optional(Type.String({ description: "Prompt text to run when the task fires" })),
	retryInterval: Type.Optional(
		Type.String({
			description: "Delay between retries while waiting for completion (e.g. 2m, 10m).",
		}),
	),
	scope: Type.Optional(
		Type.Union([Type.Literal("instance"), Type.Literal("workspace")], {
			description: "Task ownership scope. Use workspace for monitors that should survive instance changes.",
		}),
	),
});

interface ToolResult {
	content: { type: "text"; text: string }[];
	details: Record<string, unknown>;
}

function parseLeadingDurationValue(input: string): { duration: string; rest: string } | undefined {
	const tokens = input.trim().split(/\s+/).filter(Boolean);
	const maxPrefix = Math.min(3, tokens.length);
	for (let i = 1; i <= maxPrefix; i++) {
		const candidate = tokens.slice(0, i).join(" ");
		if (!parseDuration(candidate)) {
			continue;
		}
		return {
			duration: candidate,
			rest: tokens.slice(i).join(" ").trim(),
		};
	}
	return undefined;
}

function parseScheduleFlags(input: string): {
	scope: ScheduleScope | undefined;
	expires?: string;
	rest: string;
	error?: string;
} {
	let rest = input.trim();
	let scope: ScheduleScope | undefined;
	let expires: string | undefined;

	while (rest.startsWith("--")) {
		if (rest.startsWith("--workspace ") || rest === "--workspace") {
			scope = "workspace";
			rest = rest.slice("--workspace".length).trim();
			continue;
		}
		if (rest.startsWith("--instance ") || rest === "--instance") {
			scope = "instance";
			rest = rest.slice("--instance".length).trim();
			continue;
		}
		if (rest.startsWith("--expires ")) {
			const parsedExpiry = parseLeadingDurationValue(rest.slice("--expires".length).trim());
			if (!parsedExpiry) {
				return { error: "invalid_expires", expires, rest: input.trim(), scope };
			}
			expires = parsedExpiry.duration;
			({ rest } = parsedExpiry);
			continue;
		}
		return { error: "unknown_flag", expires, rest: input.trim(), scope };
	}

	return { expires, rest, scope };
}

export function registerCommands(pi: ExtensionAPI, runtime: SchedulerRuntime) {
	pi.registerCommand("loop", {
		description:
			"Schedule recurring prompt: /loop 5m <prompt>, /loop --workspace 5m <prompt>, /loop --expires 1h 5m <prompt>, or /loop cron <expr> <prompt>",
		// Biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Command handler validates flags, schedule forms, and user-facing notes.
		handler: async (args, ctx) => {
			const parsedFlags = parseScheduleFlags(args);
			if (parsedFlags.error) {
				ctx.ui.notify(
					parsedFlags.error === "invalid_expires"
						? "Usage: /loop --expires 1h 5m check build (expires must be a duration like 30m, 1h, or 1 day)."
						: "Usage: /loop [--workspace|--instance] [--expires <duration>] 5m check build",
					"warning",
				);
				return;
			}
			const parsed = parseLoopScheduleArgs(parsedFlags.rest);
			if (!parsed) {
				ctx.ui.notify(
					"Usage: /loop 5m check build OR /loop --workspace 5m check build OR /loop --expires 1h 5m check build OR /loop cron '*/5 * * * *' check build (minimum cron cadence is 1m)",
					"warning",
				);
				return;
			}

			if (runtime.taskCount >= MAX_TASKS) {
				ctx.ui.notify(`Task limit reached (${MAX_TASKS}). Delete one with /schedule:delete <id>.`, "error");
				return;
			}

			if (parsed.recurring.mode === "cron") {
				const expires = resolveRecurringExpiryOptions(parsedFlags.expires);
				const task = runtime.addRecurringCronTask(parsed.prompt, parsed.recurring.cronExpression, {
					expiresInMs: expires.ok ? expires.expiresInMs : DEFAULT_RECURRING_EXPIRY_MS,
					scope: parsedFlags.scope,
				});
				if (!task) {
					ctx.ui.notify("Invalid cron schedule. Cron tasks must run no more often than once per minute.", "error");
					return;
				}
				ctx.ui.notify(
					`Scheduled cron ${task.cronExpression} (id: ${task.id}). Expires in ${formatDurationShort(task.expiresAt! - task.createdAt)}. Scope: ${task.scope ?? "instance"}.`,
					"info",
				);
				if (parsed.recurring.note) {
					ctx.ui.notify(parsed.recurring.note, "info");
				}
				if (expires.ok && expires.note) {
					ctx.ui.notify(expires.note, "info");
				}
				return;
			}

			const expires = resolveRecurringExpiryOptions(parsedFlags.expires);
			const task = runtime.addRecurringIntervalTask(parsed.prompt, parsed.recurring.durationMs, {
				expiresInMs: expires.ok ? expires.expiresInMs : DEFAULT_RECURRING_EXPIRY_MS,
				scope: parsedFlags.scope,
			});
			ctx.ui.notify(
				`Scheduled every ${formatDurationShort(parsed.recurring.durationMs)} (id: ${task.id}). Expires in ${formatDurationShort(task.expiresAt! - task.createdAt)}. Scope: ${task.scope ?? "instance"}.`,
				"info",
			);
			if (parsed.recurring.note) {
				ctx.ui.notify(parsed.recurring.note, "info");
			}
			if (expires.ok && expires.note) {
				ctx.ui.notify(expires.note, "info");
			}
		},
	});

	pi.registerCommand("remind", {
		description: "Schedule one-time reminder: /remind in 45m <prompt> or /remind --workspace in 45m <prompt>",
		handler: async (args, ctx) => {
			const parsedFlags = parseScheduleFlags(args);
			if (parsedFlags.error) {
				ctx.ui.notify("Usage: /remind [--workspace|--instance] in 45m check deployment", "warning");
				return;
			}
			if (parsedFlags.expires) {
				ctx.ui.notify("/remind creates one-time tasks, so --expires is only supported with /loop.", "warning");
				return;
			}
			const parsed = parseRemindScheduleArgs(parsedFlags.rest);
			if (!parsed) {
				ctx.ui.notify("Usage: /remind in 45m check deployment", "warning");
				return;
			}

			if (runtime.taskCount >= MAX_TASKS) {
				ctx.ui.notify(`Task limit reached (${MAX_TASKS}). Delete one with /schedule:delete <id>.`, "error");
				return;
			}

			const task = runtime.addOneShotTask(parsed.prompt, parsed.durationMs, { scope: parsedFlags.scope });
			ctx.ui.notify(
				`Reminder set for ${runtime.formatRelativeTime(task.nextRunAt)} (id: ${task.id}, scope: ${task.scope ?? "instance"}).`,
				"info",
			);
			if (parsed.note) {
				ctx.ui.notify(parsed.note, "info");
			}
		},
	});

	const scheduleCommand = {
		description:
			"Manage scheduled reminders and future check-ins. No args opens TUI manager. Also: /schedule:tui | /schedule:list | /schedule:enable <id> | /schedule:disable <id> | /schedule:delete <id> | /schedule:clear | /schedule:clear-other | /schedule:adopt <id|all> | /schedule:release <id|all> | /schedule:clear-foreign",
		// Biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Command router with multiple subcommands.
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
					content: runtime.formatTaskList(),
					customType: "pi-scheduler",
					display: true,
				});
				return;
			}

			if (action === "enable" || action === "disable") {
				if (!rawArg) {
					ctx.ui.notify(`Usage: /schedule:${action} <id>`, "warning");
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
					ctx.ui.notify("Usage: /schedule:delete <id>", "warning");
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

			if (action === "clear-other") {
				const result = runtime.clearTasksNotCreatedHere();
				ctx.ui.notify(
					`Cleared ${result.count} scheduled task${result.count === 1 ? "" : "s"} not created in this instance.`,
					"info",
				);
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
					"Change scope by recreating with --workspace/--instance or by adopting and re-scheduling. /schedule:scope is not supported yet.",
					"info",
				);
				return;
			}

			if (rawExtra) {
				ctx.ui.notify("Too many arguments for /schedule.", "warning");
				return;
			}

			ctx.ui.notify(
				"Usage: /schedule:tui|list|enable <id>|disable <id>|delete <id>|clear|clear-other|adopt <id|all>|release <id|all>|clear-foreign",
				"warning",
			);
		},
	};

	pi.registerCommand("schedule", scheduleCommand);

	const scheduleAliases: { name: string; subcommand: string; description: string }[] = [
		{ description: "Open the scheduler TUI manager.", name: "schedule:tui", subcommand: "tui" },
		{ description: "Show all scheduled prompts in the message stream.", name: "schedule:list", subcommand: "list" },
		{ description: "Enable one scheduled prompt.", name: "schedule:enable", subcommand: "enable" },
		{ description: "Disable one scheduled prompt.", name: "schedule:disable", subcommand: "disable" },
		{ description: "Delete one scheduled prompt.", name: "schedule:delete", subcommand: "delete" },
		{ description: "Alias for /schedule:delete.", name: "schedule:remove", subcommand: "remove" },
		{ description: "Alias for /schedule:delete.", name: "schedule:rm", subcommand: "rm" },
		{ description: "Delete every scheduled prompt.", name: "schedule:clear", subcommand: "clear" },
		{
			description: "Delete tasks not created in this instance.",
			name: "schedule:clear-other",
			subcommand: "clear-other",
		},
		{ description: "Adopt one task or all tasks for this instance.", name: "schedule:adopt", subcommand: "adopt" },
		{
			description: "Release one task or all tasks from this instance.",
			name: "schedule:release",
			subcommand: "release",
		},
		{
			description: "Delete tasks owned by another instance.",
			name: "schedule:clear-foreign",
			subcommand: "clear-foreign",
		},
	];

	for (const alias of scheduleAliases) {
		pi.registerCommand(alias.name, {
			description: alias.description,
			handler: (args, ctx) => scheduleCommand.handler(args ? `${alias.subcommand} ${args}` : alias.subcommand, ctx),
		});
	}

	pi.registerCommand("unschedule", {
		description: "Alias for /schedule:delete <id>",
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
		description:
			"Create/list/enable/disable/delete/adopt/release/clear scheduled prompts. Supports clear_other for tasks not created in this instance and clear_foreign for tasks owned by another instance. Use this when the user asks for reminders, to check back later, or to follow up on PRs, CI, builds, deployments, or any recurring check. add requires prompt; once tasks require duration; recurring supports interval (duration) or cron expression (cron).",
		execute: async (
			_toolCallId,
			params: {
				action: string;
				kind?: TaskKind;
				prompt?: string;
				duration?: string;
				cron?: string;
				expires?: string;
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
			if (action === "clear_other") {
				return handleToolClearOther(runtime);
			}
			if (action === "add") {
				return handleToolAdd(params, runtime);
			}

			return {
				content: [{ type: "text", text: `Error: unsupported action '${String(action)}'.` }],
				details: { action, error: "unsupported_action" },
			};
		},
		label: "Schedule Prompt",
		name: "schedule_prompt",
		parameters: SchedulePromptToolParams,
		promptGuidelines: [
			"Use this tool when the user asks to remind/check back later, revisit something in the future, or monitor PRs, CI, builds, deploys, or background work.",
			"For recurring tasks use kind='recurring' with duration like 5m or 2h, or provide cron.",
			"For one-time reminders use kind='once' with duration like 30m or 1h.",
			"Set expires for recurring tasks when the monitor should stop automatically; defaults to 1 day and is capped at 1 day.",
			"Set continueUntilComplete=true when the user explicitly wants retries until the task is done.",
			"Default scope is instance. Use scope='workspace' only for monitors that should be adoptable across pi instances in the same workspace.",
			"Scheduled tasks run only while pi is active and idle. Persisted overdue or foreign-owned tasks are restored for manual review instead of auto-running at startup.",
		],
		promptSnippet:
			"Create/list/enable/disable/delete/adopt/release/clear scheduled prompts for one-time reminders, future follow-ups, and recurring PR/CI/build/deployment checks. Supports clear_other for tasks not created in this instance, clear_foreign for tasks owned by another instance, intervals/cron, and one-time reminders while this pi instance remains active unless scope='workspace' is used.",
	});
}

function handleToolList(runtime: SchedulerRuntime): ToolResult {
	const list = runtime.getSortedTasks();
	if (list.length === 0) {
		return { content: [{ text: "No scheduled tasks.", type: "text" }], details: { action: "list", tasks: [] } };
	}

	const lines = list.map((task) => {
		const scheduleBase =
			task.kind === "once"
				? "-"
				: (task.cronExpression ?? formatDurationShort(task.intervalMs ?? DEFAULT_LOOP_INTERVAL));
		const schedule = task.continueUntilComplete ? `${scheduleBase} (until-complete)` : scheduleBase;
		const creator = task.creatorInstanceId ?? "legacy";
		const state = task.resumeRequired ? `due:${task.resumeReason ?? "unknown"}` : task.enabled ? "on" : "off";
		const status = task.resumeRequired ? "resume_required" : (task.lastStatus ?? "pending");
		const last = task.lastRunAt ? runtime.formatRelativeTime(task.lastRunAt) : "never";
		return `${task.id}\t${creator}\t${state}\t${task.kind}\t${task.scope ?? "instance"}\t${schedule}\t${runtime.formatRelativeTime(task.nextRunAt)}\t${task.runCount}\t${last}\t${status}\t${task.prompt}`;
	});
	return {
		content: [
			{
				text: `Scheduled tasks (id\tcreator\tstate\tkind\tscope\tschedule\tnext\truns\tlast\tstatus\tprompt):\n${lines.join("\n")}`,
				type: "text",
			},
		],
		details: { action: "list", tasks: list },
	};
}

function handleToolClear(runtime: SchedulerRuntime): ToolResult {
	const count = runtime.clearTasks();
	return {
		content: [{ text: `Cleared ${count} scheduled task${count === 1 ? "" : "s"}.`, type: "text" }],
		details: { action: "clear", cleared: count },
	};
}

function handleToolDelete(params: { id?: string }, runtime: SchedulerRuntime): ToolResult {
	const id = params.id?.trim();
	if (!id) {
		return {
			content: [{ text: "Error: id is required for delete action.", type: "text" }],
			details: { action: "delete", error: "missing_id" },
		};
	}
	const removed = runtime.deleteTask(id);
	if (!removed) {
		return {
			content: [{ text: `Task not found: ${id}`, type: "text" }],
			details: { action: "delete", id, removed: false },
		};
	}
	return {
		content: [{ text: `Deleted scheduled task ${id}.`, type: "text" }],
		details: { action: "delete", id, removed: true },
	};
}

function handleToolToggle(params: { action: string; id?: string }, runtime: SchedulerRuntime): ToolResult {
	const { action } = params;
	const id = params.id?.trim();
	if (!id) {
		return {
			content: [{ text: `Error: id is required for ${action} action.`, type: "text" }],
			details: { action, error: "missing_id" },
		};
	}
	const enabled = action === "enable";
	const ok = runtime.setTaskEnabled(id, enabled);
	if (!ok) {
		return {
			content: [{ text: `Task not found: ${id}`, type: "text" }],
			details: { action, id, updated: false },
		};
	}
	return {
		content: [{ text: `${enabled ? "Enabled" : "Disabled"} scheduled task ${id}.`, type: "text" }],
		details: { action, enabled, id, updated: true },
	};
}

function handleToolAdopt(params: { id?: string }, runtime: SchedulerRuntime): ToolResult {
	const target = params.id?.trim() || "all";
	const result = runtime.adoptTasks(target);
	if (result.error) {
		return {
			content: [{ text: `Error: ${result.error}`, type: "text" }],
			details: { action: "adopt", error: result.error },
		};
	}
	return {
		content: [{ text: `Adopted ${result.count} scheduled task${result.count === 1 ? "" : "s"}.`, type: "text" }],
		details: { action: "adopt", adopted: result.count, target },
	};
}

function handleToolRelease(params: { id?: string }, runtime: SchedulerRuntime): ToolResult {
	const target = params.id?.trim() || "all";
	const result = runtime.releaseTasks(target);
	if (result.error) {
		return {
			content: [{ text: `Error: ${result.error}`, type: "text" }],
			details: { action: "release", error: result.error },
		};
	}
	return {
		content: [{ text: `Released ${result.count} scheduled task${result.count === 1 ? "" : "s"}.`, type: "text" }],
		details: { action: "release", released: result.count, target },
	};
}

function handleToolClearForeign(runtime: SchedulerRuntime): ToolResult {
	const result = runtime.clearForeignTasks();
	return {
		content: [
			{ text: `Cleared ${result.count} foreign scheduled task${result.count === 1 ? "" : "s"}.`, type: "text" },
		],
		details: { action: "clear_foreign", cleared: result.count },
	};
}

function handleToolClearOther(runtime: SchedulerRuntime): ToolResult {
	const result = runtime.clearTasksNotCreatedHere();
	return {
		content: [
			{
				text: `Cleared ${result.count} scheduled task${result.count === 1 ? "" : "s"} not created in this instance.`,
				type: "text",
			},
		],
		details: {
			action: "clear_other",
			cleared: result.count,
			legacyCount: result.legacyCount ?? 0,
			otherCount: result.otherCount ?? 0,
		},
	};
}

function validationErrorMessage(error: string): string {
	switch (error) {
		case "missing_duration": {
			return "Error: duration is required for one-time reminders.";
		}
		case "invalid_duration": {
			return "Error: invalid duration. Use values like 5m, 2h, 1 day.";
		}
		case "invalid_cron_for_once": {
			return "Error: cron is only valid for recurring tasks.";
		}
		case "conflicting_schedule_inputs": {
			return "Error: provide either duration or cron for recurring tasks, not both.";
		}
		case "invalid_cron": {
			return "Error: invalid cron expression (minimum cadence is 1 minute).";
		}
		default: {
			return `Error: ${error}`;
		}
	}
}

function resolveRecurringExpiryOptions(
	expires: string | undefined,
): { ok: true; expiresInMs: number; note?: string } | { ok: false; error: string } {
	if (!expires?.trim()) {
		return { expiresInMs: DEFAULT_RECURRING_EXPIRY_MS, ok: true };
	}

	const parsed = parseDuration(expires);
	if (!parsed) {
		return { error: "invalid_expiry", ok: false };
	}

	const normalized = normalizeDuration(parsed);
	const expiresInMs = Math.min(normalized.durationMs, MAX_RECURRING_EXPIRY_MS);
	const notes = [normalized.note];
	if (expiresInMs !== normalized.durationMs) {
		notes.push(`Capped at ${formatDurationShort(MAX_RECURRING_EXPIRY_MS)} (maximum recurring expiry).`);
	}
	return {
		expiresInMs,
		note: notes.filter(Boolean).join(" ") || undefined,
		ok: true,
	};
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
			return { error: "invalid_retry_interval", ok: false };
		}
		const normalized = normalizeDuration(parsed);
		retryIntervalMs = normalized.durationMs;
		({ note } = normalized);
	}

	let maxAttempts: number | undefined;
	if (params.maxAttempts !== undefined) {
		if (!Number.isFinite(params.maxAttempts) || params.maxAttempts < 1) {
			return { error: "invalid_max_attempts", ok: false };
		}
		maxAttempts = Math.floor(params.maxAttempts);
	}

	const completionSignal = params.completionSignal?.trim();
	return {
		note,
		ok: true,
		options: {
			completionSignal: completionSignal || undefined,
			continueUntilComplete: true,
			maxAttempts,
			retryIntervalMs,
		},
	};
}

// Biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handles validation + messaging for multiple schedule modes and completion policies.
function handleToolAdd(
	params: {
		kind?: TaskKind;
		prompt?: string;
		duration?: string;
		cron?: string;
		expires?: string;
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
			content: [{ text: "Error: prompt is required for add action.", type: "text" }],
			details: { action: "add", error: "missing_prompt" },
		};
	}

	if (runtime.taskCount >= MAX_TASKS) {
		return {
			content: [{ text: `Task limit reached (${MAX_TASKS}). Delete one first.`, type: "text" }],
			details: { action: "add", error: "task_limit" },
		};
	}

	const completion = resolveCompletionOptions({
		completionSignal: params.completionSignal,
		continueUntilComplete: params.continueUntilComplete,
		maxAttempts: params.maxAttempts,
		retryInterval: params.retryInterval,
	});
	if (!completion.ok) {
		return {
			content: [
				{
					text:
						completion.error === "invalid_retry_interval"
							? "Error: retryInterval must be a duration like 2m, 10m, or 1h."
							: "Error: maxAttempts must be a positive number.",
					type: "text",
				},
			],
			details: { action: "add", error: completion.error },
		};
	}

	const validated = validateSchedulePromptAddInput({
		cron: params.cron,
		duration: params.duration,
		kind: params.kind,
	});
	if (!validated.ok) {
		return {
			content: [{ text: validationErrorMessage(validated.error), type: "text" }],
			details: { action: "add", error: validated.error },
		};
	}

	const recurringExpiry = resolveRecurringExpiryOptions(params.expires);
	if (!recurringExpiry.ok) {
		return {
			content: [{ text: "Error: expires must be a duration like 30m, 1h, or 1 day.", type: "text" }],
			details: { action: "add", error: recurringExpiry.error },
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
					text: `Reminder scheduled (id: ${task.id}) for ${runtime.formatRelativeTime(task.nextRunAt)} as ${task.scope ?? "instance"}-scoped.${
						validated.plan.note ? ` ${validated.plan.note}` : ""
					}${completion.options.continueUntilComplete ? " Will retry until marked complete." : ""}${
						completion.note ? ` ${completion.note}` : ""
					}`,
					type: "text",
				},
			],
			details: { action: "add", task },
		};
	}

	if (validated.plan.mode === "cron") {
		const task = runtime.addRecurringCronTask(prompt, validated.plan.cronExpression, {
			expiresInMs: recurringExpiry.expiresInMs,
			scope: params.scope,
			...completion.options,
		});
		if (!task) {
			return {
				content: [
					{ text: "Error: invalid cron expression or cadence is too frequent (minimum is 1 minute).", type: "text" },
				],
				details: { action: "add", error: "cron_next_run_failed" },
			};
		}
		return {
			content: [
				{
					text: `Recurring cron task scheduled (id: ${task.id}) with '${task.cronExpression}' as ${task.scope ?? "instance"}-scoped. Expires in ${formatDurationShort(recurringExpiry.expiresInMs)}.${
						validated.plan.note ? ` ${validated.plan.note}` : ""
					}${completion.options.continueUntilComplete ? " Will retry until marked complete." : ""}${
						completion.note ? ` ${completion.note}` : ""
					}${recurringExpiry.note ? ` ${recurringExpiry.note}` : ""}`,
					type: "text",
				},
			],
			details: { action: "add", task },
		};
	}

	const task = runtime.addRecurringIntervalTask(prompt, validated.plan.durationMs, {
		expiresInMs: recurringExpiry.expiresInMs,
		scope: params.scope,
		...completion.options,
	});
	return {
		content: [
			{
				text: `Recurring task scheduled (id: ${task.id}) every ${formatDurationShort(validated.plan.durationMs)} as ${task.scope ?? "instance"}-scoped. Expires in ${formatDurationShort(recurringExpiry.expiresInMs)}.${
					validated.plan.note ? ` ${validated.plan.note}` : ""
				}${completion.options.continueUntilComplete ? " Will retry until marked complete." : ""}${
					completion.note ? ` ${completion.note}` : ""
				}${recurringExpiry.note ? ` ${recurringExpiry.note}` : ""}`,
				type: "text",
			},
		],
		details: { action: "add", task },
	};
}

export function registerEvents(pi: ExtensionAPI, runtime: SchedulerRuntime) {
	const activeSessionKeys = new Set<string>();
	let startupOwnershipTimer: ReturnType<typeof setTimeout> | undefined;
	const getSessionKey = (ctx: ExtensionContext) => ctx.sessionManager?.getSessionFile?.() ?? `${ctx.cwd}::default`;
	const refreshRuntimeContext = (_event: unknown, ctx: ExtensionContext) => {
		activeSessionKeys.add(getSessionKey(ctx));
		runtime.setRuntimeContext(ctx);
		runtime.updateStatus();
		runtime.startScheduler();
	};
	const scheduleStartupOwnership = (ctx: ExtensionContext) => {
		if (startupOwnershipTimer) {
			clearTimeout(startupOwnershipTimer);
		}

		startupOwnershipTimer = setTimeout(() => {
			startupOwnershipTimer = undefined;
			runtime
				.handleStartupOwnership(ctx)
				.then(() => {
					runtime.notifyResumeRequiredTasks();
				})
				.catch(() => {
					// Keep startup resilient if ownership inspection fails.
				});
		}, STARTUP_OWNERSHIP_DELAY_MS);
		startupOwnershipTimer.unref?.();
	};

	pi.on("session_start", (event, ctx) => {
		refreshRuntimeContext(event, ctx);
		scheduleStartupOwnership(ctx);
	});

	pi.on("session_switch", refreshRuntimeContext);
	pi.on("session_fork", refreshRuntimeContext);
	pi.on("session_tree", refreshRuntimeContext);
	pi.on("session_branch", refreshRuntimeContext);

	pi.on("agent_end", (event) => {
		runtime.handleAgentEnd(event as { messages?: { role?: string; content?: unknown }[] });
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		activeSessionKeys.delete(getSessionKey(ctx));
		if (activeSessionKeys.size === 0) {
			if (startupOwnershipTimer) {
				clearTimeout(startupOwnershipTimer);
				startupOwnershipTimer = undefined;
			}
			runtime.setRuntimeContext(ctx);
			runtime.stopScheduler();
		}
		runtime.clearStatus(ctx);
	});

	// Listen for safe-mode changes to throttle scheduler ticks and suppress UI churn.
	pi.events.on("oh-pi:safe-mode", (data) => {
		runtime.setSafeModeEnabled(Boolean((data as { enabled?: boolean } | undefined)?.enabled));
	});
}
