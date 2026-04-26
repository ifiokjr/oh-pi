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
	timeout: Type.Optional(
		Type.Number({ description: "Optional timeout in seconds before the PTY command is terminated" }),
	),
	cwd: Type.Optional(Type.String({ description: "Optional working directory override for this command" })),
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
		content: [{ type: "text" as const, text: `PTY execution failed: ${message}` }],
		details: { pty: true, error: true },
	};
}

export default function bashLiveViewExtension(pi: ExtensionAPI): void {
	// oxlint-disable-next-line @typescript-eslint/no-explicit-any
	const bashTemplate = createBashTool(process.cwd()) as any;
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
		name: BASH_LIVE_VIEW_TOOL,
		label: bashTemplate.label ?? "Bash",
		description: buildToolDescription(bashTemplate.description),
		parameters: BASH_TOOL_PARAMETERS,
		renderCall: bashTemplate.renderCall,
		renderResult: bashTemplate.renderResult,
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
					cwd: resolveCwd(ctx, activeCtx),
					ctx,
					sessionManager,
				});
				pi.sendMessage({
					customType: BASH_PTY_MESSAGE_TYPE,
					content: result.text,
					display: true,
					details: {
						pty: true,
						sessionId: result.sessionId,
						status: result.status,
						exitCode: result.exitCode,
					},
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
				cwd: resolveCwd(ctx, activeCtx, event.cwd),
				ctx,
				sessionManager,
			});
			return {
				result: toUserBashResult(result),
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				result: {
					output: `PTY execution failed: ${message}`,
					exitCode: 1,
					cancelled: false,
					truncated: false,
				},
			};
		}
	});
}

export const bashLiveViewInternals = {
	buildToolDescription,
	resolveCwd,
	toErrorToolResult,
	BASH_TOOL_PARAMETERS,
};
