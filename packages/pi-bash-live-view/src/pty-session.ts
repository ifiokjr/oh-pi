import { randomUUID } from "node:crypto";
import { ensureSpawnHelperExecutable } from "./spawn-helper.js";

const DEFAULT_COLUMNS = 120;
const DEFAULT_ROWS = 32;
const DEFAULT_MAX_BUFFER_BYTES = 256 * 1024;
const DEFAULT_MAX_BUFFER_CHUNKS = 512;

interface DisposableLike {
	dispose?: () => void;
}

interface PtyLike {
	pid: number;
	onData?: (listener: (data: string) => void) => DisposableLike | (() => void) | void;
	onExit?: (listener: (event: PtyExitEvent) => void) => DisposableLike | (() => void) | void;
	kill: () => void;
	resize?: (columns: number, rows: number) => void;
	write?: (data: string) => void;
}

interface NodePtyModuleLike {
	spawn: (
		file: string,
		args: string[],
		options: {
			cols: number;
			rows: number;
			cwd: string;
			env: Record<string, string>;
			name: string;
		},
	) => PtyLike;
}

interface BufferedChunk {
	text: string;
	bytes: number;
}

export interface PtyExitEvent {
	exitCode: number | null;
	signal?: number;
}

export type PtyStopReason = "exit" | "cancelled" | "timed_out" | "disposed";
export type PtySessionStatus = "running" | "completed" | "failed" | "cancelled" | "timed_out" | "disposed";

export interface ShellLaunch {
	file: string;
	args: string[];
}

export interface CreatePtySessionOptions {
	command: string;
	cwd: string;
	cols?: number;
	rows?: number;
	env?: NodeJS.ProcessEnv;
	shell?: ShellLaunch;
}

export interface ManagedPtySession {
	id: string;
	pid: number;
	command: string;
	cwd: string;
	startedAt: number;
	endedAt: number | null;
	status: PtySessionStatus;
	stopReason: PtyStopReason | null;
	onData: (listener: (data: string) => void) => () => void;
	onExit: (listener: (event: PtyExitEvent) => void) => () => void;
	whenExited: Promise<PtyExitEvent>;
	getOutput: () => string;
	kill: (reason?: PtyStopReason) => void;
	resize: (columns: number, rows: number) => void;
	write: (data: string) => void;
	dispose: () => void;
}

export interface PtySessionManagerOptions {
	now?: () => number;
	maxBufferedBytes?: number;
	maxBufferedChunks?: number;
	ensureSpawnHelper?: () => Promise<string | null>;
}

const DEFAULT_NODE_PTY_MODULE_LOADER = async (): Promise<NodePtyModuleLike> => {
	return (await import("node-pty")) as NodePtyModuleLike;
};

let nodePtyModuleLoader: () => Promise<NodePtyModuleLike> = DEFAULT_NODE_PTY_MODULE_LOADER;

function createDeferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
} {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((nextResolve) => {
		resolve = nextResolve;
	});
	return { promise, resolve };
}

function toDisposer(subscription: DisposableLike | (() => void) | void): () => void {
	if (typeof subscription === "function") {
		return subscription;
	}

	if (subscription?.dispose) {
		return () => subscription.dispose?.();
	}

	return () => {};
}

function sanitizeEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
	const mergedEnv = {
		...process.env,
		...env,
		TERM: env.TERM ?? "xterm-256color",
		COLORTERM: env.COLORTERM ?? "truecolor",
	};
	const sanitized: Record<string, string> = {};
	for (const [key, value] of Object.entries(mergedEnv)) {
		if (typeof value !== "string") {
			continue;
		}
		sanitized[key] = value;
	}
	return sanitized;
}

export function resolveShellLaunch(
	command: string,
	platform: NodeJS.Platform = process.platform,
	env: NodeJS.ProcessEnv = process.env,
): ShellLaunch {
	if (platform === "win32") {
		const shell = env.SHELL?.trim();
		if (shell && /(bash|sh)(?:\.exe)?$/i.test(shell)) {
			return { file: shell, args: ["-lc", command] };
		}

		const comSpec = env.ComSpec?.trim();
		if (comSpec) {
			return {
				file: comSpec,
				args: ["/d", "/s", "/c", command],
			};
		}

		return {
			file: "cmd.exe",
			args: ["/d", "/s", "/c", command],
		};
	}

	return {
		file: env.SHELL?.trim() || "/bin/bash",
		args: ["-lc", command],
	};
}

function pruneBufferedChunks(chunks: BufferedChunk[], maxChunks: number, maxBytes: number): number {
	let keptBytes = 0;
	let keepStart = chunks.length;

	for (let read = chunks.length - 1; read >= 0; read--) {
		const nextChunk = chunks[read];
		const nextCount = chunks.length - read;
		if (nextCount > maxChunks || keptBytes + nextChunk.bytes > maxBytes) {
			break;
		}

		keptBytes += nextChunk.bytes;
		keepStart = read;
	}

	let write = 0;
	for (let read = keepStart; read < chunks.length; read++) {
		chunks[write++] = chunks[read];
	}
	chunks.length = write;
	return keptBytes;
}

function createSessionStatus(stopReason: PtyStopReason | null, exitCode: number | null): PtySessionStatus {
	if (stopReason === "cancelled") {
		return "cancelled";
	}

	if (stopReason === "timed_out") {
		return "timed_out";
	}

	if (stopReason === "disposed") {
		return "disposed";
	}

	return exitCode === 0 ? "completed" : "failed";
}

export function setNodePtyModuleLoader(loader: () => Promise<NodePtyModuleLike>): void {
	nodePtyModuleLoader = loader;
}

export function resetNodePtyModuleLoader(): void {
	nodePtyModuleLoader = DEFAULT_NODE_PTY_MODULE_LOADER;
}

export class PtySessionManager {
	private readonly sessions = new Map<string, ManagedPtySession>();
	private readonly now: () => number;
	private readonly maxBufferedBytes: number;
	private readonly maxBufferedChunks: number;
	private readonly ensureSpawnHelper: () => Promise<string | null>;

	constructor(options: PtySessionManagerOptions = {}) {
		this.now = options.now ?? Date.now;
		this.maxBufferedBytes = options.maxBufferedBytes ?? DEFAULT_MAX_BUFFER_BYTES;
		this.maxBufferedChunks = options.maxBufferedChunks ?? DEFAULT_MAX_BUFFER_CHUNKS;
		this.ensureSpawnHelper = options.ensureSpawnHelper ?? ensureSpawnHelperExecutable;
	}

	async createSession(options: CreatePtySessionOptions): Promise<ManagedPtySession> {
		await this.ensureSpawnHelper();
		const ptyModule = await nodePtyModuleLoader();
		const shell = options.shell ?? resolveShellLaunch(options.command);
		const cols = options.cols ?? DEFAULT_COLUMNS;
		const rows = options.rows ?? DEFAULT_ROWS;
		const pty = ptyModule.spawn(shell.file, shell.args, {
			cols,
			rows,
			cwd: options.cwd,
			env: sanitizeEnv(options.env),
			name: "xterm-256color",
		});

		const exitDeferred = createDeferred<PtyExitEvent>();
		const dataListeners = new Set<(data: string) => void>();
		const exitListeners = new Set<(event: PtyExitEvent) => void>();
		const bufferedChunks: BufferedChunk[] = [];
		let bufferedBytes = 0;
		let outputCache = "";
		let outputDirty = false;
		let exitResolved = false;
		let sessionStatus: PtySessionStatus = "running";
		let stopReason: PtyStopReason | null = null;
		let endedAt: number | null = null;
		let disposed = false;

		const id = randomUUID();

		const getOutput = () => {
			if (!outputDirty) {
				return outputCache;
			}

			outputCache = bufferedChunks.map((chunk) => chunk.text).join("");
			outputDirty = false;
			return outputCache;
		};

		const finalize = (event: PtyExitEvent) => {
			if (exitResolved) {
				return;
			}

			exitResolved = true;
			endedAt = this.now();
			sessionStatus = createSessionStatus(stopReason, event.exitCode);
			exitDeferred.resolve(event);
			for (const listener of exitListeners) {
				listener(event);
			}
		};

		const appendChunk = (text: string) => {
			const bytes = Buffer.byteLength(text, "utf8");
			bufferedChunks.push({ text, bytes });
			bufferedBytes += bytes;
			if (bufferedBytes > this.maxBufferedBytes || bufferedChunks.length > this.maxBufferedChunks) {
				bufferedBytes = pruneBufferedChunks(bufferedChunks, this.maxBufferedChunks, this.maxBufferedBytes);
			}
			outputDirty = true;
		};

		const dataDisposer = toDisposer(
			pty.onData?.((data) => {
				appendChunk(data);
				for (const listener of dataListeners) {
					listener(data);
				}
			}),
		);
		const exitDisposer = toDisposer(
			pty.onExit?.((event) => {
				finalize({ exitCode: event.exitCode, signal: event.signal });
			}),
		);

		const session: ManagedPtySession = {
			id,
			pid: pty.pid,
			command: options.command,
			cwd: options.cwd,
			startedAt: this.now(),
			get endedAt() {
				return endedAt;
			},
			get status() {
				return sessionStatus;
			},
			get stopReason() {
				return stopReason;
			},
			onData(listener) {
				dataListeners.add(listener);
				return () => {
					dataListeners.delete(listener);
				};
			},
			onExit(listener) {
				exitListeners.add(listener);
				return () => {
					exitListeners.delete(listener);
				};
			},
			whenExited: exitDeferred.promise,
			getOutput,
			kill(reason = "cancelled") {
				if (stopReason == null || reason === "timed_out") {
					stopReason = reason;
				}
				try {
					pty.kill();
				} catch {
					finalize({ exitCode: null });
				}
			},
			resize(columns, nextRows) {
				pty.resize?.(columns, nextRows);
			},
			write(data) {
				pty.write?.(data);
			},
			dispose() {
				if (disposed) {
					return;
				}
				disposed = true;
				if (stopReason == null) {
					stopReason = "disposed";
				}
				dataDisposer();
				exitDisposer();
				try {
					pty.kill();
				} catch {
					finalize({ exitCode: null });
				}
			},
		};

		this.sessions.set(id, session);
		return session;
	}

	closeSession(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return;
		}

		session.dispose();
		this.sessions.delete(sessionId);
	}

	dispose(): void {
		const ids: string[] = [];
		for (const session of this.sessions.values()) {
			ids.push(session.id);
		}
		for (const sessionId of ids) {
			this.closeSession(sessionId);
		}
	}
}

export const ptySessionInternals = {
	toDisposer,
	sanitizeEnv,
	pruneBufferedChunks,
	createSessionStatus,
};
