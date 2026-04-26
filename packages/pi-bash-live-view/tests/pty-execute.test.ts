
import { executePtyCommand, ptyExecuteInternals, toAgentToolResult, toUserBashResult } from "../src/pty-execute.js";
import { resetHeadlessModuleLoader, setHeadlessModuleLoader } from "../src/terminal-emulator.js";
import {
	PtySessionManager,
	ptySessionInternals,
	resetNodePtyModuleLoader,
	resolveShellLaunch,
	setNodePtyModuleLoader,
} from "../src/pty-session.js";
import { ensureSpawnHelperExecutable, getSpawnHelperCandidates, spawnHelperInternals } from "../src/spawn-helper.js";
import {
	appendExitSummary,
	formatExitSummaryLine,
	highlightErrorOutput,
	tailText,
	truncateInternals,
	truncateOutput,
} from "../src/truncate.js";

class FakePty {
	pid = 1234;
	kill = vi.fn();
	resize = vi.fn();
	write = vi.fn();
	private dataListeners = new Set<(data: string) => void>();
	private exitListeners = new Set<(event: { exitCode: number | null; signal?: number }) => void>();

	onData(listener: (data: string) => void) {
		this.dataListeners.add(listener);
		return {
			dispose: () => {
				this.dataListeners.delete(listener);
			},
		};
	}

	onExit(listener: (event: { exitCode: number | null; signal?: number }) => void) {
		this.exitListeners.add(listener);
		return () => {
			this.exitListeners.delete(listener);
		};
	}

	emitData(data: string) {
		for (const listener of this.dataListeners) {
			listener(data);
		}
	}

	emitExit(event: { exitCode: number | null; signal?: number }) {
		for (const listener of this.exitListeners) {
			listener(event);
		}
	}
}

describe("pTY execution", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		resetNodePtyModuleLoader();
		resetHeadlessModuleLoader();
		vi.useRealTimers();
	});

	it("streams PTY output, updates the widget, and returns a tool result", async () => {
		const fakePty = new FakePty();
		const spawn = vi.fn(() => fakePty);
		const ensureSpawnHelper = vi.fn().mockResolvedValue("/tmp/spawn-helper");
		const onUpdate = vi.fn();
		const emulatorWrites: string[] = [];
		const widget = {
			dispose: vi.fn(),
			update: vi.fn(),
		};
		const emulator = {
			dispose: vi.fn(),
			getPlainText: vi.fn(() => emulatorWrites.join("")),
			resize: vi.fn(),
			toAnsiLines: vi.fn(() => (emulatorWrites.length === 0 ? [] : [emulatorWrites.join("")])),
			write: vi.fn(async (data: string) => {
				emulatorWrites.push(data);
			}),
		};

		setNodePtyModuleLoader(async () => ({ spawn }));
		const manager = new PtySessionManager({ ensureSpawnHelper, now: () => Date.now() });
		const executionPromise = executePtyCommand({
			command: "echo hello",
			createEmulator: async () => emulator,
			createWidget: () => widget as never,
			ctx: { hasUI: true },
			cwd: "/workspace/project",
			onUpdate,
			sessionManager: manager,
		});

		await vi.advanceTimersByTimeAsync(0);
		fakePty.emitData("hello\n");
		await vi.advanceTimersByTimeAsync(120);
		expect(onUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				content: [{ text: "hello\n", type: "text" }],
				details: expect.objectContaining({ partial: true, status: "running" }),
			}),
		);

		fakePty.emitExit({ exitCode: 0 });
		const result = await executionPromise;
		expect(spawn).toHaveBeenCalledWith(
			process.env.SHELL?.trim() || "/bin/bash",
			["-lc", "echo hello"],
			expect.objectContaining({ cwd: "/workspace/project", name: "xterm-256color" }),
		);
		expect(ensureSpawnHelper).toHaveBeenCalledOnce();
		expect(widget.update).toHaveBeenLastCalledWith(
			expect.objectContaining({ ansiLines: ["hello\n"], exitCode: 0, status: "completed" }),
		);
		expect(widget.dispose).toHaveBeenCalledOnce();
		expect(emulator.dispose).toHaveBeenCalledOnce();
		expect(result).toMatchObject({
			cancelled: false,
			exitCode: 0,
			output: "hello\n",
			status: "completed",
			timedOut: false,
		});
		expect(result.text).toContain("[Exit code: 0]");
		expect(toAgentToolResult(result)).toMatchObject({ details: { pty: true, sessionId: result.sessionId } });
		expect(toUserBashResult(result)).toMatchObject({ exitCode: 0, output: result.text, truncated: false });
	});

	it("marks PTY executions as timed out or cancelled", async () => {
		const makeSession = () => {
			let resolveExit!: (value: { exitCode: number | null }) => void;
			return {
				resolveExit: (event: { exitCode: number | null }) => resolveExit(event),
				session: {
					command: "cmd",
					cwd: "/tmp",
					dispose: vi.fn(),
					endedAt: null,
					getOutput: () => "",
					id: "session-1",
					kill: vi.fn(),
					onData: vi.fn(() => () => {}),
					onExit: vi.fn(() => () => {}),
					pid: 1,
					resize: vi.fn(),
					startedAt: Date.now(),
					status: "running",
					stopReason: null,
					whenExited: new Promise<{ exitCode: number | null }>((resolve) => {
						resolveExit = resolve;
					}),
					write: vi.fn(),
				},
			};
		};

		const timedOutSession = makeSession();
		const timedOutManager = {
			closeSession: vi.fn(),
			createSession: vi.fn(async () => timedOutSession.session),
			dispose: vi.fn(),
		};
		const timedOutPromise = executePtyCommand({
			command: "sleep 5",
			createEmulator: async () => ({
				write: async () => {},
				resize: () => {},
				toAnsiLines: () => [],
				getPlainText: () => "",
				dispose: () => {},
			}),
			cwd: "/tmp",
			sessionManager: timedOutManager as never,
			timeout: 1,
		});
		await vi.advanceTimersByTimeAsync(1000);
		expect(timedOutSession.session.kill).toHaveBeenCalledWith("timed_out");
		timedOutSession.resolveExit({ exitCode: null });
		const timedOut = await timedOutPromise;
		expect(timedOut.status).toBe("timed_out");
		expect(timedOut.text).toContain("Timed out after 1s");
		expect(timedOutManager.closeSession).toHaveBeenCalledWith("session-1");

		const cancelledSession = makeSession();
		const cancelledManager = {
			closeSession: vi.fn(),
			createSession: vi.fn(async () => cancelledSession.session),
			dispose: vi.fn(),
		};
		const abortController = new AbortController();
		const cancelledPromise = executePtyCommand({
			command: "tail -f log",
			createEmulator: async () => ({
				write: async () => {},
				resize: () => {},
				toAnsiLines: () => [],
				getPlainText: () => "",
				dispose: () => {},
			}),
			cwd: "/tmp",
			sessionManager: cancelledManager as never,
			signal: abortController.signal,
		});
		await Promise.resolve();
		await Promise.resolve();
		abortController.abort();
		expect(cancelledSession.session.kill).toHaveBeenCalledWith("cancelled");
		cancelledSession.resolveExit({ exitCode: null });
		const cancelled = await cancelledPromise;
		expect(cancelled.status).toBe("cancelled");
		expect(cancelled.cancelled).toBeTruthy();
		expect(cancelled.text).toContain("Command cancelled");
		expect(ptyExecuteInternals.toExecutionStatus(null, true, false)).toBe("cancelled");
		expect(ptyExecuteInternals.flushQueuedChunks(["a", "b"])).toBe("ab");
		expect(ptyExecuteInternals.buildPreviewText("")).toBe("(waiting for output)");
	});

	it("uses the default widget factory and session-manager ownership path", async () => {
		const fakePty = new FakePty();
		setNodePtyModuleLoader(async () => ({ spawn: () => fakePty }));
		const setWidget = vi.fn();
		const executionPromise = executePtyCommand({
			command: "echo owned",
			createEmulator: async () => ({
				write: async () => {},
				resize: () => {},
				toAnsiLines: () => ["owned"],
				getPlainText: () => "owned",
				dispose: () => {},
			}),
			ctx: {
				hasUI: true,
				ui: { setWidget },
			},
			cwd: "/owned",
		});
		await vi.waitFor(() => {
			expect(setWidget).toHaveBeenCalledOnce();
		});
		fakePty.emitExit({ exitCode: 0 });
		const result = await executionPromise;
		expect(setWidget).toHaveBeenCalledTimes(2);
		expect(result.status).toBe("completed");
		expect(toUserBashResult({ ...result, exitCode: null, status: "completed" })).toMatchObject({ exitCode: 0 });
		expect(toUserBashResult({ ...result, exitCode: null, status: "failed" })).toMatchObject({ exitCode: 1 });
	});

	it("covers the default emulator path and nullish PTY fallbacks", async () => {
		class MinimalTerminal {
			buffer = { active: {} };
			write(_data: string, callback?: () => void) {
				callback?.();
			}
			resize() {}
			dispose() {}
		}
		setHeadlessModuleLoader(async () => ({ Terminal: MinimalTerminal as never }));

		const defaultSession = {
			command: "cmd",
			cwd: "/tmp",
			dispose: vi.fn(),
			endedAt: null,
			getOutput: vi.fn().mockReturnValueOnce(undefined).mockReturnValue(""),
			id: "session-default",
			kill: vi.fn(),
			onData: vi.fn(() => () => {}),
			onExit: vi.fn(() => () => {}),
			pid: 1,
			resize: vi.fn(),
			startedAt: Date.now(),
			status: "running",
			stopReason: null,
			whenExited: Promise.resolve({ exitCode: 0 }),
			write: vi.fn(),
		};
		const result = await executePtyCommand({
			command: "echo default",
			ctx: { hasUI: false },
			cwd: "/tmp",
			sessionManager: {
				createSession: vi.fn(async () => defaultSession as never),
				closeSession: vi.fn(),
				dispose: vi.fn(),
			} as never,
		});
		expect(result.output).toBe("");

		const missingEmulatorResult = await executePtyCommand({
			command: "echo none",
			createEmulator: async () => undefined as never,
			createWidget: () => ({ update: vi.fn(), dispose: vi.fn() }) as never,
			ctx: { hasUI: true },
			cwd: "/tmp",
			sessionManager: {
				createSession: vi.fn(
					async () =>
						({
							...defaultSession,
							id: "session-none",
							whenExited: Promise.resolve({ exitCode: 1 }),
							getOutput: () => "plain output",
						}) as never,
				),
				closeSession: vi.fn(),
				dispose: vi.fn(),
			} as never,
		});
		expect(missingEmulatorResult.status).toBe("failed");

		expect(ptyExecuteInternals.toExecutionStatus(2, false, false)).toBe("failed");
	});

	it("manages PTY sessions, shell resolution, truncation, and spawn-helper setup", async () => {
		const pty = new FakePty();
		const spawn = vi.fn(() => pty);
		setNodePtyModuleLoader(async () => ({ spawn }));

		const manager = new PtySessionManager({ ensureSpawnHelper: async () => null });
		const session = await manager.createSession({ command: "echo test", cwd: "/repo" });
		const observed: string[] = [];
		const unsubscribe = session.onData((data) => observed.push(data));
		const exited: { exitCode: number | null }[] = [];
		session.onExit((event) => exited.push(event));

		pty.emitData("chunk-1\n");
		unsubscribe();
		pty.emitData("chunk-2\n");
		session.resize(80, 24);
		session.write("input");
		pty.emitExit({ exitCode: 1 });
		await session.whenExited;

		expect(observed).toStrictEqual(["chunk-1\n"]);
		expect(exited).toStrictEqual([{ exitCode: 1 }]);
		expect(session.getOutput()).toBe("chunk-1\nchunk-2\n");
		expect(session.status).toBe("failed");
		expect(session.stopReason).toBeNull();
		expect(pty.resize).toHaveBeenCalledWith(80, 24);
		expect(pty.write).toHaveBeenCalledWith("input");

		manager.closeSession(session.id);
		manager.closeSession("missing");
		manager.dispose();

		expect(resolveShellLaunch("pwd", "linux", { SHELL: "/usr/bin/zsh" })).toStrictEqual({
			args: ["-lc", "pwd"],
			file: "/usr/bin/zsh",
		});
		expect(resolveShellLaunch("pwd", "linux", {})).toStrictEqual({ args: ["-lc", "pwd"], file: "/bin/bash" });
		expect(resolveShellLaunch("dir", "win32", { SHELL: "C:/Program Files/Git/bin/bash.exe" })).toStrictEqual({
			args: ["-lc", "dir"],
			file: "C:/Program Files/Git/bin/bash.exe",
		});
		expect(resolveShellLaunch("dir", "win32", { ComSpec: "cmd.exe" })).toStrictEqual({
			args: ["/d", "/s", "/c", "dir"],
			file: "cmd.exe",
		});

		expect(ptySessionInternals.sanitizeEnv({ BAZ: undefined, FOO: "bar" })).toMatchObject({
			COLORTERM: "truecolor",
			FOO: "bar",
			TERM: "xterm-256color",
		});
		expect(ptySessionInternals.toDisposer({ dispose: vi.fn() })).toBeTypeOf("function");
		expect(ptySessionInternals.toDisposer(() => {})).toBeTypeOf("function");
		expect(ptySessionInternals.toDisposer()).toBeTypeOf("function");
		expect(ptySessionInternals.createSessionStatus("cancelled", null)).toBe("cancelled");
		expect(ptySessionInternals.createSessionStatus(null, 0)).toBe("completed");
		expect(ptySessionInternals.createSessionStatus(null, 2)).toBe("failed");
		expect(ptySessionInternals.createSessionStatus("timed_out", null)).toBe("timed_out");
		expect(ptySessionInternals.createSessionStatus("disposed", null)).toBe("disposed");

		const chunks = [
			{ bytes: 1, text: "a" },
			{ bytes: 1, text: "b" },
			{ bytes: 1, text: "c" },
		];
		expect(ptySessionInternals.pruneBufferedChunks(chunks, 2, 2)).toBe(2);
		expect(chunks).toStrictEqual([
			{ bytes: 1, text: "b" },
			{ bytes: 1, text: "c" },
		]);

		const truncated = truncateOutput("one\ntwo\nthree", { maxBytes: 100, maxLines: 2 });
		expect(truncated.text).toContain("[output truncated");
		expect(truncateOutput("", { maxBytes: 1, maxLines: 1 }).text).toBe("");
		expect(truncateOutput("very-long-line", { maxBytes: 1, maxLines: 1 }).text).toContain("[output truncated");
		expect(tailText("1\n2\n3", 2)).toBe("2\n3");
		expect(tailText("", 2)).toBe("");
		expect(highlightErrorOutput("ok\nError: failed")).toContain("\u001B[31mError: failed");
		expect(highlightErrorOutput("")).toBe("");
		expect(formatExitSummaryLine(1)).toContain("[Exit code: 1]");
		expect(formatExitSummaryLine(null)).toContain("[Exit code: unknown]");
		expect(formatExitSummaryLine(null, { timedOut: true })).toContain("[command timed out]");
		expect(appendExitSummary("body", 0)).toContain("body");
		expect(appendExitSummary("", 0)).toContain("[Exit code: 0]");
		expect(truncateInternals.normalizeNewlines("a\r\nb\r")).toBe("a\nb\n");
		expect(
			truncateInternals.buildTruncationNotice({
				keptBytes: 6,
				keptLines: 2,
				maxBytes: 100,
				maxLines: 2,
				totalBytes: 9,
				totalLines: 3,
				truncated: true,
			}),
		).toContain("kept 2/3 lines");
	});

	it("ensures the node-pty spawn-helper is executable when present", async () => {
		let chmodApplied = false;
		const accessFn = vi.fn(async (candidate: string, mode: number) => {
			if (candidate.includes("missing")) {
				throw new Error("missing");
			}
			if (mode !== 0 && candidate.includes("chmod-me") && !chmodApplied) {
				throw new Error("not executable");
			}
		});
		const chmodFn = vi.fn(async () => {
			chmodApplied = true;
		});

		const candidates = getSpawnHelperCandidates("/tmp/chmod-me");
		expect(candidates[0]).toBe("/tmp/chmod-me");
		expect(spawnHelperInternals.uniquePaths(["a", "a", "b"])).toStrictEqual(["a", "b"]);
		await expect(ensureSpawnHelperExecutable({
				explicitPath: "/tmp/chmod-me",
				accessFn: accessFn as never,
				chmodFn: chmodFn as never,
			})).resolves.toBe("/tmp/chmod-me");
		expect(chmodFn).toHaveBeenCalledWith("/tmp/chmod-me", 0o755);
		const missingAccess = vi.fn(async () => {
			throw new Error("missing");
		});
		await expect(ensureSpawnHelperExecutable({
				explicitPath: "/tmp/missing",
				accessFn: missingAccess as never,
				chmodFn: chmodFn as never,
			})).resolves.toBeNull();
		await expect(spawnHelperInternals.isExecutable("/tmp/chmod-me", missingAccess as never)).resolves.toBeFalsy();
		await ensureSpawnHelperExecutable();
	});

	it("covers the win32 spawn-helper branch via a fresh module import", async () => {
		const originalPlatform = process.platform;
		const originalHelper = process.env.NODE_PTY_SPAWN_HELPER;
		vi.resetModules();
		Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
		const win32Module = await import("../src/spawn-helper.js");
		await expect(win32Module.ensureSpawnHelperExecutable({ explicitPath: "C:/spawn-helper.exe" })).resolves.toBe(
			"C:/spawn-helper.exe",
		);
		process.env.NODE_PTY_SPAWN_HELPER = "C:/env-helper.exe";
		await expect(win32Module.ensureSpawnHelperExecutable()).resolves.toBe("C:/env-helper.exe");
		delete process.env.NODE_PTY_SPAWN_HELPER;
		await expect(win32Module.ensureSpawnHelperExecutable()).resolves.toBeNull();
		if (originalHelper) {
			process.env.NODE_PTY_SPAWN_HELPER = originalHelper;
		} else {
			delete process.env.NODE_PTY_SPAWN_HELPER;
		}
		Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
		vi.resetModules();
	});
});
