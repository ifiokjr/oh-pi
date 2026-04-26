import { fileURLToPath } from "node:url";
import { buildPiCommand, buildRemotePtyEnv, createPtyProcess } from "./pty.js";
import type { CreatePtyProcessOptions } from "./pty.js";

export interface CliOptions {
	args: string[];
	command: string;
	cwd?: string;
	help: boolean;
	printEnv: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
	const args = argv.slice(2);
	let cwd: string | undefined;
	let help = false;
	let printEnv = false;
	let command = buildPiCommand();
	const passthrough: string[] = [];

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === "--help" || arg === "-h") {
			help = true;
			continue;
		}

		if (arg === "--print-env") {
			printEnv = true;
			continue;
		}

		if (arg === "--cwd") {
			cwd = args[index + 1];
			index += 1;
			continue;
		}

		if (arg === "--command") {
			command = args[index + 1] || command;
			index += 1;
			continue;
		}

		passthrough.push(arg);
	}

	return {
		args: passthrough,
		command,
		cwd,
		help,
		printEnv,
	};
}

export function formatHelp(): string {
	return `
pi-remote-tailscale — PTY launcher helper for remote pi sessions

Usage:
  pi-remote-tailscale [--cwd <path>] [--command <pi-bin>] [--print-env] [--help] [-- ...pi args]

Options:
  --cwd <path>      Working directory for the remote child session
  --command <bin>   Override the pi binary to launch
  --print-env       Print the remote-mode environment JSON and exit
  -h, --help        Show this help
`.trim();
}

export function buildSpawnOptions(options: CliOptions, env: NodeJS.ProcessEnv = process.env): CreatePtyProcessOptions {
	return {
		args: options.args,
		command: options.command,
		cwd: options.cwd,
		env: buildRemotePtyEnv(env),
	};
}

export async function main(
	argv = process.argv,
	deps: {
		error?: (message: string) => void;
		log?: (message: string) => void;
		startPty?: (options: CreatePtyProcessOptions) => Promise<unknown>;
	} = {},
): Promise<number> {
	const error = deps.error ?? console.error;
	const log = deps.log ?? console.log;
	const startPty = deps.startPty ?? createPtyProcess;
	const options = parseArgs(argv);

	if (options.help) {
		log(formatHelp());
		return 0;
	}

	const spawnOptions = buildSpawnOptions(options);

	if (options.printEnv) {
		log(JSON.stringify(spawnOptions.env, null, 2));
		return 0;
	}

	try {
		await startPty(spawnOptions);
		return 0;
	} catch (caughtError) {
		error(caughtError instanceof Error ? caughtError.message : String(caughtError));
		return 1;
	}
}

/* V8 ignore next 6 -- covered by the real Node.js CLI entrypoint, not the in-process test harness. */
const isMain = process.argv[1] && import.meta.filename === process.argv[1];

if (isMain) {
	void main().then((exitCode) => {
		process.exitCode = exitCode;
	});
}
