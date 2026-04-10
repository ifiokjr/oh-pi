/**
 * oh-pi Background Process Extension
 *
 * Automatically backgrounds long-running bash commands (dev servers, builds, etc.).
 * When a command exceeds the timeout threshold, it's moved to the background and
 * the agent receives a notification with PID and log file path.
 *
 * Features:
 * - Overrides the built-in `bash` tool with auto-backgrounding behavior
 * - Provides `bg_status` tool for listing, viewing logs, and stopping processes
 * - Auto-notifies the LLM when background processes complete (via `sendMessage`)
 * - Cleans up all background processes on session shutdown
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import { type ExtensionAPI, getAgentDir, getShellConfig } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/** Timeout threshold in ms — commands exceeding this are automatically backgrounded. */
const BG_TIMEOUT_MS = 10_000;

/** Tracks a backgrounded process and its output log. */
interface BgProcess {
	pid: number;
	command: string;
	logFile: string;
	startedAt: number;
	finished: boolean;
	exitCode: number | null;
}

/** Check if a process is still alive by sending signal 0. */
function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
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

export function getBgProcessLogFilePath(now: number = Date.now(), tempDir: string = tmpdir()): string {
	return join(tempDir, `oh-pi-bg-${now}.log`);
}

/**
 * Extension entry point — registers a `bash` tool override with auto-backgrounding
 * and a `bg_status` tool for process management.
 */
export default function (pi: ExtensionAPI) {
	/** Map of PID → background process state. */
	const bgProcesses = new Map<number, BgProcess>();

	// Override the built-in bash tool with backgrounding support
	pi.registerTool({
		name: "bash",
		label: "Bash",
		description: `Execute a bash command. Output is truncated to 2000 lines or 50KB. If a command runs longer than ${BG_TIMEOUT_MS / 1000}s, it is automatically backgrounded and you get the PID + log file path. Use the bg_status tool to check on backgrounded processes.`,
		parameters: Type.Object({
			command: Type.String({ description: "Bash command to execute" }),
			timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (optional)" })),
		}),
		async execute(_toolCallId, params, signal) {
			const { command } = params;
			const userTimeout = params.timeout ? params.timeout * 1000 : undefined;
			const effectiveTimeout = userTimeout ?? BG_TIMEOUT_MS;

			return new Promise((resolve) => {
				let stdout = "";
				let stderr = "";
				let settled = false;
				let backgrounded = false;

				const { shell, args } = getShellConfig();
				const child = spawn(shell, [...args, command], {
					cwd: process.cwd(),
					env: createBgProcessShellEnv(),
					stdio: ["ignore", "pipe", "pipe"],
				});

				const childPid = child.pid ?? 0;

				child.stdout?.on("data", (d: Buffer) => {
					const chunk = d.toString();
					stdout += chunk;
					if (backgrounded) {
						try {
							appendFileSync(bgProcesses.get(childPid)?.logFile ?? "", chunk);
						} catch {
							// Log write failed — non-critical
						}
					}
				});
				child.stderr?.on("data", (d: Buffer) => {
					const chunk = d.toString();
					stderr += chunk;
					if (backgrounded) {
						try {
							appendFileSync(bgProcesses.get(childPid)?.logFile ?? "", chunk);
						} catch {
							// Log write failed — non-critical
						}
					}
				});

				// Timeout: keep pipes open, mark as backgrounded
				const timer = setTimeout(() => {
					if (settled) {
						return;
					}
					settled = true;
					backgrounded = true;
					child.unref();

					const logFile = getBgProcessLogFilePath();
					writeFileSync(logFile, stdout + stderr);

					const proc: BgProcess = {
						pid: childPid,
						command,
						logFile,
						startedAt: Date.now(),
						finished: false,
						exitCode: null,
					};
					bgProcesses.set(childPid, proc);

					// Auto-notify when the backgrounded process finishes
					child.on("close", (code) => {
						proc.finished = true;
						proc.exitCode = code;
						const tail = (stdout + stderr).slice(-3000);
						const truncated = (stdout + stderr).length > 3000 ? `[...truncated]\n${tail}` : tail;
						try {
							writeFileSync(logFile, stdout + stderr);
						} catch {
							// Final log write failed — non-critical
						}

						pi.sendMessage(
							{
								content: `[BG_PROCESS_DONE] PID ${childPid} finished (exit ${code ?? "?"})\nCommand: ${command}\n\nOutput (last 3000 chars):\n${truncated}`,
								display: true,
							},
							{ triggerTurn: true, deliverAs: "followUp" },
						);
					});

					const preview = (stdout + stderr).slice(0, 500);
					const text = `Command still running after ${effectiveTimeout / 1000}s, moved to background.\nPID: ${childPid}\nLog: ${logFile}\nStop: kill ${childPid}\n\nOutput so far:\n${preview}\n\nYou will be notified automatically when it finishes. No need to poll.`;

					resolve({ content: [{ type: "text", text }], details: {} });
				}, effectiveTimeout);

				// Normal completion (before timeout)
				child.on("close", (code) => {
					if (settled) {
						return;
					}
					settled = true;
					clearTimeout(timer);

					const output = (stdout + stderr).trim();
					const exitInfo = code === 0 ? "" : `\n[Exit code: ${code}]`;
					resolve({ content: [{ type: "text", text: output + exitInfo }], details: {} });
				});

				child.on("error", (err) => {
					if (settled) {
						return;
					}
					settled = true;
					clearTimeout(timer);
					resolve({ content: [{ type: "text", text: `Error: ${err.message}` }], details: {}, isError: true });
				});

				if (signal) {
					signal.addEventListener(
						"abort",
						() => {
							if (settled) {
								return;
							}
							settled = true;
							clearTimeout(timer);
							try {
								child.kill();
							} catch {
								// Process already exited
							}
							resolve({ content: [{ type: "text", text: "Command cancelled." }], details: {} });
						},
						{ once: true },
					);
				}
			});
		},
	});

	// bg_status tool: list, view logs, or stop background processes
	pi.registerTool({
		name: "bg_status",
		label: "Background Process Status",
		description: "Check status, view output, or stop background processes that were auto-backgrounded.",
		parameters: Type.Object({
			action: StringEnum(["list", "log", "stop"] as const, {
				description: "list=show all, log=view output, stop=kill process",
			}),
			pid: Type.Optional(Type.Number({ description: "PID of the process (required for log/stop)" })),
		}),
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Command router for list/log/stop with validation.
		async execute(_toolCallId, params) {
			const { action, pid } = params;

			if (action === "list") {
				if (bgProcesses.size === 0) {
					return { content: [{ type: "text", text: "No background processes." }], details: {} };
				}
				const lines = [...bgProcesses.values()].map((p) => {
					const status = p.finished
						? `⚪ stopped (exit ${p.exitCode ?? "?"})`
						: isAlive(p.pid)
							? "running"
							: "⚪ stopped";
					return `PID: ${p.pid} | ${status} | Log: ${p.logFile}\n  Cmd: ${p.command}`;
				});
				return { content: [{ type: "text", text: lines.join("\n\n") }], details: {} };
			}

			if (!pid) {
				return { content: [{ type: "text", text: "Error: pid is required for log/stop" }], details: {}, isError: true };
			}

			const proc = bgProcesses.get(pid);

			if (action === "log") {
				const logFile = proc?.logFile;
				if (logFile && existsSync(logFile)) {
					try {
						const content = readFileSync(logFile, "utf-8");
						const tail = content.slice(-5000);
						const truncated = content.length > 5000 ? `[...truncated, showing last 5000 chars]\n${tail}` : tail;
						return { content: [{ type: "text", text: truncated || "(empty)" }], details: {} };
					} catch (e: unknown) {
						const msg = e instanceof Error ? e.message : String(e);
						return { content: [{ type: "text", text: `Error reading log: ${msg}` }], details: {}, isError: true };
					}
				}
				return { content: [{ type: "text", text: "No log available for this PID." }], details: {} };
			}

			if (action === "stop") {
				try {
					process.kill(pid, "SIGTERM");
					bgProcesses.delete(pid);
					return { content: [{ type: "text", text: `Process ${pid} terminated.` }], details: {} };
				} catch {
					bgProcesses.delete(pid);
					return { content: [{ type: "text", text: `Process ${pid} not found (already stopped?).` }], details: {} };
				}
			}

			return { content: [{ type: "text", text: `Unknown action: ${action}` }], details: {}, isError: true };
		},
	});

	// Cleanup: kill all background processes on session shutdown
	pi.on("session_shutdown", () => {
		for (const [pid, proc] of bgProcesses) {
			if (!proc.finished) {
				try {
					process.kill(pid, "SIGTERM");
				} catch {
					// Process already exited
				}
			}
		}
		bgProcesses.clear();
	});
}
