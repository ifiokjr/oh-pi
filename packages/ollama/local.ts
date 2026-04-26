import { execFile, spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import process from "node:process";
import type { Readable } from "node:stream";

const IS_WINDOWS = process.platform === "win32";
const OLLAMA_COMMAND_CANDIDATES = IS_WINDOWS ? ["ollama.exe", "ollama"] : ["ollama"];

interface OllamaCliStatus {
	available: boolean;
	command?: string;
	version?: string;
	error?: string;
}

let cachedCliStatus: OllamaCliStatus | null = null;
let pendingCliStatus: Promise<OllamaCliStatus> | null = null;

export async function getOllamaCliStatus(options: { force?: boolean } = {}): Promise<OllamaCliStatus> {
	if (!options.force && cachedCliStatus) {
		return cachedCliStatus;
	}

	if (pendingCliStatus) {
		return pendingCliStatus;
	}

	pendingCliStatus = detectOllamaCli().finally(() => {
		pendingCliStatus = null;
	});
	cachedCliStatus = await pendingCliStatus;
	return cachedCliStatus;
}

export async function pullOllamaModel(
	modelId: string,
	options: {
		env?: NodeJS.ProcessEnv;
		signal?: AbortSignal;
		onOutput?: (line: string) => void;
	} = {},
): Promise<void> {
	const cli = await getOllamaCliStatus();
	if (!cli.available || !cli.command) {
		throw new Error("Ollama CLI is not installed.");
	}

	const { command } = cli;
	await new Promise<void>((resolve, reject) => {
		const child = spawn(command, ["pull", modelId], {
			env: options.env,
			shell: IS_WINDOWS,
			stdio: ["ignore", "pipe", "pipe"],
		}) as ChildProcessByStdio<null, Readable, Readable>;
		let stderr = "";
		let stdout = "";

		child.stdout.on("data", (chunk: Buffer | string) => {
			const text = String(chunk);
			stdout += text;
			emitOutputLines(text, options.onOutput);
		});

		child.stderr.on("data", (chunk: Buffer | string) => {
			const text = String(chunk);
			stderr += text;
			emitOutputLines(text, options.onOutput);
		});

		child.on("error", (error: Error) => {
			reject(error);
		});

		child.on("close", (code: number | null) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(stderr.trim() || stdout.trim() || `ollama pull ${modelId} exited with code ${code ?? "unknown"}`),
			);
		});

		options.signal?.addEventListener(
			"abort",
			() => {
				child.kill();
				reject(new Error(`ollama pull ${modelId} was aborted.`));
			},
			{ once: true },
		);
	});
}

export function clearOllamaCliStatusCache(): void {
	cachedCliStatus = null;
}

function execFileText(command: string, args: string[]): Promise<{ text: string | null; error: string | null }> {
	return new Promise((resolve) => {
		execFile(command, args, { encoding: "utf8", shell: IS_WINDOWS }, (error, stdout, stderr) => {
			if (error) {
				resolve({
					error: stderr.trim() || error.message || `Failed to execute ${command} ${args.join(" ")}`,
					text: null,
				});
				return;
			}

			const text = stdout.trim();
			resolve({ error: null, text: text || null });
		});
	});
}

async function detectOllamaCli(): Promise<OllamaCliStatus> {
	let lastError = "Ollama CLI not found.";
	for (const command of OLLAMA_COMMAND_CANDIDATES) {
		const result = await execFileText(command, ["--version"]);
		if (result.text) {
			return {
				available: true,
				command,
				version: result.text,
			};
		}
		lastError = result.error ?? `Failed to execute ${command} --version.`;
	}

	return {
		available: false,
		error: lastError,
	};
}

function emitOutputLines(text: string, onOutput: ((line: string) => void) | undefined): void {
	if (!onOutput) {
		return;
	}

	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed) {
			onOutput(trimmed);
		}
	}
}

export type { OllamaCliStatus };
