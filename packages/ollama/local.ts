import { type ChildProcessByStdio, execFileSync, spawn } from "node:child_process";
import process from "node:process";
import type { Readable } from "node:stream";

const IS_WINDOWS = process.platform === "win32";
const OLLAMA_COMMAND_CANDIDATES = IS_WINDOWS ? ["ollama.exe", "ollama"] : ["ollama"];

type OllamaCliStatus = {
	available: boolean;
	command?: string;
	version?: string;
	error?: string;
};

let cachedCliStatus: OllamaCliStatus | null = null;
let pendingCliStatus: Promise<OllamaCliStatus> | null = null;

export async function getOllamaCliStatus(options: { force?: boolean } = {}): Promise<OllamaCliStatus> {
	if (!options.force && cachedCliStatus) {
		return cachedCliStatus;
	}

	if (pendingCliStatus) {
		return pendingCliStatus;
	}

	pendingCliStatus = Promise.resolve(detectOllamaCli()).finally(() => {
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

	const command = cli.command;
	await new Promise<void>((resolve, reject) => {
		const child = spawn(command, ["pull", modelId], {
			env: options.env,
			stdio: ["ignore", "pipe", "pipe"],
			shell: IS_WINDOWS,
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
			reject(new Error(stderr.trim() || stdout.trim() || `ollama pull ${modelId} exited with code ${code ?? "unknown"}`));
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

function detectOllamaCli(): OllamaCliStatus {
	let lastError = "Ollama CLI not found.";
	for (const command of OLLAMA_COMMAND_CANDIDATES) {
		try {
			const output = execFileSync(command, ["--version"], {
				encoding: "utf-8",
				stdio: ["ignore", "pipe", "pipe"],
				shell: IS_WINDOWS,
			}).trim();
			return {
				available: true,
				command,
				version: output || undefined,
			};
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
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
