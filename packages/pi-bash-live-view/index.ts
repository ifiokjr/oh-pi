import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { executePtyCommand, toAgentToolResult, toUserBashResult } from "./src/pty-execute.js";
import { PtySessionManager } from "./src/pty-session.js";

export const BASH_LIVE_VIEW_TOOL = "bash_live_view";
export const BASH_PTY_COMMAND = "bash-pty";
const BASH_PTY_MESSAGE_TYPE = "pi-bash-live-view:result";

const BASH_TOOL_PARAMETERS = Type.Object({
	command: Type.String({ description: "Bash command to execute" }),
	cwd: Type.Optional(Type.String({ description: "Optional working directory override for this command" })),
	timeout: Type.Optional(
		Type.Number({ description: "Optional timeout in seconds before the PTY command is terminated" }),
	),
	usePTY: Type.Optional(
		Type.Boolean({ description: "Run the command inside a pseudo-terminal with live terminal rendering" }),
	),
});

function buildToolDescription(baseDescription: string): string {
	return `${baseDescription} Set usePTY=true to stream the command through a pseudo-terminal with a live widget.`;
}

function resolveCwd(
	ctx: Pick<ExtensionContext, "cwd"> | undefined,
	fallbackCtx: Pick<ExtensionContext, "cwd"> | null,
	explicitCwd?: string,
): string {
	return explicitCwd ?? ctx?.cwd ?? fallbackCtx?.cwd ?? process.cwd();
}

function toErrorToolResult(error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return {
		content: [{ text: `PTY execution failed: ${message}`, type: "text" as const }],
		details: { error: true, pty: true },
	};
}

export default function bashLiveViewExtension(pi: ExtensionAPI): void {
	const bashTemplate = createBashTool(process.cwd()) as typeof createBashTool extends (...args: unknown[]) => infer T
		? T & {
				renderCall?: unknown;
				renderResult?: unknown;
				label?: string;
				description: string;
			}
		: never;
	const sessionManager = new PtySessionManager();
	let activeCtx: ExtensionContext | null = null;

	const syncContext = (_event: unknown, ctx: ExtensionContext) => {
		activeCtx = ctx;
	};

	pi.on("session_start", syncContext);
	pi.on("session_switch", syncContext);
	pi.on("session_tree", syncContext);
	pi.on("session_fork", syncContext);
	pi.on("before_agent_start", syncContext);
	pi.on("session_shutdown", () => {
		sessionManager.dispose();
		activeCtx = null;
	});

	pi.registerTool({
		description: buildToolDescription(bashTemplate.description),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const commandCwd = resolveCwd(ctx, activeCtx, params.cwd);
			if (!params.usePTY) {
				const originalBash = createBashTool(commandCwd);
				return originalBash.execute(
					toolCallId,
					{ command: params.command, timeout: params.timeout } as never,
					signal,
					onUpdate,
				);
			}

			try {
				const result = await executePtyCommand({
					command: params.command,
					cwd: commandCwd,
					timeout: params.timeout,
					signal,
					onUpdate,
					ctx,
					sessionManager,
				});
				return toAgentToolResult(result);
			} catch (error) {
				return toErrorToolResult(error);
			}
		},
		label: bashTemplate.label ?? "Bash",
		name: BASH_LIVE_VIEW_TOOL,
		parameters: BASH_TOOL_PARAMETERS,
		renderCall: bashTemplate.renderCall as unknown as (call: unknown) => unknown,
		renderResult: bashTemplate.renderResult as unknown as (call: unknown) => unknown,
	});

	pi.registerCommand(BASH_PTY_COMMAND, {
		description: "Run a command inside a pseudo-terminal with live output rendering.",
		handler: async (args, ctx) => {
			activeCtx = ctx;
			const command = args.trim();
			if (!command) {
				ctx.ui.notify(`/${BASH_PTY_COMMAND} requires a command.`, "warning");
				return;
			}

			try {
				const result = await executePtyCommand({
					command,
					ctx,
					cwd: resolveCwd(ctx, activeCtx),
					sessionManager,
				});
				pi.sendMessage({
					content: result.text,
					customType: BASH_PTY_MESSAGE_TYPE,
					details: {
						exitCode: result.exitCode,
						pty: true,
						sessionId: result.sessionId,
						status: result.status,
					},
					display: true,
				});
			} catch (error) {
				ctx.ui.notify(`PTY execution failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});

	pi.on("user_bash", async (event, ctx) => {
		activeCtx = ctx;
		try {
			const result = await executePtyCommand({
				command: event.command,
				ctx,
				cwd: resolveCwd(ctx, activeCtx, event.cwd),
				sessionManager,
			});
			return {
				result: toUserBashResult(result),
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				result: {
					cancelled: false,
					exitCode: 1,
					output: `PTY execution failed: ${message}`,
					truncated: false,
				},
			};
		}
	});
}

export const bashLiveViewInternals = {
	BASH_TOOL_PARAMETERS,
	buildToolDescription,
	resolveCwd,
	toErrorToolResult,
};
