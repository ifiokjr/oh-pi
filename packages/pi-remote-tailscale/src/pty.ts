export const REMOTE_MODE_ENV = "PI_REMOTE_TAILSCALE_MODE";
export const REMOTE_MODE_VALUE = "remote";
const DEFAULT_PTY_COLUMNS = 120;
const DEFAULT_PTY_ROWS = 30;
const NODE_PTY_MODULE = "node-pty";

export interface PtyLike {
	pid: number;
	on: <TArgs extends unknown[]>(event: "data" | "exit", handler: (...args: TArgs) => void) => void;
	off?: <TArgs extends unknown[]>(event: "data" | "exit", handler: (...args: TArgs) => void) => void;
	write: (data: string) => void;
	resize: (columns: number, rows: number) => void;
	kill: (signal?: string) => void;
}

export interface PtyModule {
	spawn: (
		command: string,
		args: string[],
		options: {
			cwd?: string;
			env?: NodeJS.ProcessEnv;
			name: string;
			cols: number;
			rows: number;
		},
	) => PtyLike;
}

export interface CreatePtyProcessOptions {
	command: string;
	args?: string[];
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	name?: string;
	columns?: number;
	rows?: number;
}

export interface PtyProcessHandle {
	pid: number;
	kill: (signal?: string) => void;
	onData: (handler: (data: string) => void) => () => void;
	onExit: (handler: (event: { exitCode: number; signal?: number }) => void) => () => void;
	resize: (columns: number, rows: number) => void;
	write: (data: string) => void;
}

declare global {
	// biome-ignore lint/style/noVar: Tests inject a mock PTY loader through the global object.
	var __PI_REMOTE_TAILSCALE_PTY_LOADER__: (() => Promise<PtyModule>) | undefined;
}

export function buildRemotePtyEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	return {
		...env,
		[REMOTE_MODE_ENV]: REMOTE_MODE_VALUE,
	};
}

export function buildPiCommand(value = process.env.PI_REMOTE_TAILSCALE_PI_BIN): string {
	const command = value?.trim();
	return command || "pi";
}

export function adaptPty(pty: PtyLike): PtyProcessHandle {
	return {
		pid: pty.pid,
		kill: (signal) => {
			pty.kill(signal);
		},
		onData: (handler) => {
			pty.on("data", handler);
			return () => {
				pty.off?.("data", handler);
			};
		},
		onExit: (handler) => {
			const wrapped = (exitCode: number, signal?: number) => {
				handler({ exitCode, signal });
			};
			pty.on("exit", wrapped);
			return () => {
				pty.off?.("exit", wrapped);
			};
		},
		resize: (columns, rows) => {
			pty.resize(columns, rows);
		},
		write: (data) => {
			pty.write(data);
		},
	};
}

export async function createPtyProcess(
	options: CreatePtyProcessOptions,
	deps: { loadModule?: () => Promise<PtyModule> } = {},
): Promise<PtyProcessHandle> {
	const loadModule = deps.loadModule ?? loadNodePtyModule;
	const nodePty = await loadModule();
	const pty = nodePty.spawn(options.command, options.args ?? [], {
		cwd: options.cwd,
		env: options.env,
		name: options.name ?? "xterm-color",
		cols: options.columns ?? DEFAULT_PTY_COLUMNS,
		rows: options.rows ?? DEFAULT_PTY_ROWS,
	});
	return adaptPty(pty);
}

async function loadNodePtyModule(): Promise<PtyModule> {
	if (globalThis.__PI_REMOTE_TAILSCALE_PTY_LOADER__) {
		return globalThis.__PI_REMOTE_TAILSCALE_PTY_LOADER__();
	}

	return (await import(NODE_PTY_MODULE)) as PtyModule;
}
