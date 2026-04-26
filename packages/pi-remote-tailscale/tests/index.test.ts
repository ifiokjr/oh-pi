import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import { main, parseArgs } from "../src/cli.js";
import { appendTokenQuery, createQrRenderer, renderTokenQr, splitQrOutput } from "../src/qr.js";
import { buildPiCommand, buildRemotePtyEnv, createPtyProcess } from "../src/pty.js";
import { createRemoteWidgetController, formatStatusText, formatWidgetLines } from "../src/widget.js";

const serverModule = vi.hoisted(() => ({
	isRemoteSessionEnv: vi.fn(() => false),
	startRemoteSessionServer: vi.fn(),
}));

vi.mock("../src/server.js", () => serverModule);

function createRemoteHandle(overrides: Partial<Record<string, unknown>> = {}) {
	const handlers = {
		client_connect: [] as Array<(clientId: string) => void>,
		client_disconnect: [] as Array<(clientId: string) => void>,
	};
	let connectedClients = 0;
	let running = true;

	const server = {
		on: vi.fn((event: keyof typeof handlers, handler: (clientId: string) => void) => {
			handlers[event].push(handler);
			return vi.fn(() => {
				handlers[event] = handlers[event].filter((entry) => entry !== handler);
			});
		}),
		get connectedClients() {
			return connectedClients;
		},
		set connectedClients(value: number) {
			connectedClients = value;
		},
		get isRunning() {
			return running;
		},
	};

	return {
		connectUrl: "https://pi-remote.dev/?host=https%3A%2F%2Fpi.tailnet.ts.net%2Fpi%2Finstance-42%2F&t=test-token",
		instanceId: "instance-42",
		lanUrl: "http://192.168.1.20:3100/?t=test-token",
		localUrl: "http://localhost:3100/?t=test-token",
		server,
		stop: vi.fn(async () => {
			running = false;
		}),
		token: "test-token",
		tunnelUrl: "https://pi.tailnet.ts.net/pi/instance-42/",
		emit(event: keyof typeof handlers, clientId = "client-1") {
			for (const handler of handlers[event]) {
				handler(clientId);
			}
		},
		...overrides,
	};
}

async function loadExtension() {
	const module = await import("../index.js");
	return module.default;
}

beforeEach(() => {
	vi.useFakeTimers();
	(
		globalThis as typeof globalThis & { __PI_REMOTE_TAILSCALE_QR_LOADER__?: () => Promise<any> }
	).__PI_REMOTE_TAILSCALE_QR_LOADER__ = vi.fn(async () => ({
		generate: (_url: string, _options?: { small?: boolean }, callback?: (output: string) => void) => {
			callback?.("██\n██");
		},
	})) as unknown as () => Promise<any>;
});

afterEach(async () => {
	delete (globalThis as typeof globalThis & { __PI_REMOTE_TAILSCALE_QR_LOADER__?: () => Promise<any> })
		.__PI_REMOTE_TAILSCALE_QR_LOADER__;
	vi.clearAllMocks();
	vi.useRealTimers();
	vi.resetModules();
});

describe("pi-remote-tailscale extension", () => {
	it("starts remote access, resolves hidden sessions, renders the widget, and shows the QR code once", async () => {
		const harness = createExtensionHarness();
		const handle = createRemoteHandle();
		const setWidget = vi.fn();
		harness.ctx.ui.setWidget = setWidget;
		(harness.ctx as Record<string, unknown>).runtime = {
			session: { prompt: vi.fn(), subscribe: vi.fn() },
		};

		let resolvedSession: unknown;
		serverModule.startRemoteSessionServer.mockImplementationOnce(
			async (options: { resolveSession?: () => unknown }) => {
				resolvedSession = options.resolveSession?.();
				return handle;
			},
		);

		const extension = await loadExtension();
		extension(harness.pi as never);
		await harness.commands.get("remote").handler(undefined, harness.ctx);
		await vi.runAllTimersAsync();

		expect(resolvedSession).toBe((harness.ctx as Record<string, any>).runtime.session);
		expect(harness.notifications.map((entry) => entry.msg)).toEqual([
			"Starting remote access...",
			"🌐 Remote active · instance-42\nhttps://pi-remote.dev/?host=https%3A%2F%2Fpi.tailnet.ts.net%2Fpi%2Finstance-42%2F&t=test-token",
			"Scan with a browser:\n██\n██",
		]);
		expect(harness.statusMap.get("remote")).toBe("🌐 Remote: 0 clients");
		expect(setWidget).toHaveBeenCalledWith(
			"remote-tailscale",
			expect.arrayContaining(["• Token: test-token"]),
			expect.objectContaining({ placement: "belowEditor" }),
		);

		const qrLoader = (globalThis as typeof globalThis & { __PI_REMOTE_TAILSCALE_QR_LOADER__?: any })
			.__PI_REMOTE_TAILSCALE_QR_LOADER__ as ReturnType<typeof vi.fn>;
		expect(setWidget.mock.invocationCallOrder[0]).toBeLessThan(qrLoader.mock.invocationCallOrder[0]);

		await harness.commands.get("remote").handler(undefined, harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toBe(
			"🌐 Remote active · instance-42\nhttps://pi-remote.dev/?host=https%3A%2F%2Fpi.tailnet.ts.net%2Fpi%2Finstance-42%2F&t=test-token",
		);
		expect(qrLoader).toHaveBeenCalledTimes(1);
	});

	it("toggles the widget, handles invalid widget args, stops the server, and cleans up on shutdown", async () => {
		const harness = createExtensionHarness();
		const handle = createRemoteHandle();
		harness.ctx.ui.setWidget = vi.fn();
		serverModule.startRemoteSessionServer.mockResolvedValue(handle);

		const extension = await loadExtension();
		extension(harness.pi as never);
		await harness.commands.get("remote").handler(undefined, harness.ctx);
		await vi.runAllTimersAsync();

		await harness.commands.get("remote:widget").handler("off", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toBe("Remote widget disabled.");
		expect(harness.statusMap.has("remote")).toBe(false);

		await harness.commands.get("remote:widget").handler("bogus", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toBe("Usage: /remote:widget [on|off]");

		await harness.commands.get("remote").handler("stop", harness.ctx);
		expect(handle.stop).toHaveBeenCalledTimes(1);
		expect(harness.notifications.at(-1)?.msg).toBe("Remote access stopped.");

		await harness.commands.get("remote").handler("stop", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toBe("Remote access is not active.");

		const nextHandle = createRemoteHandle({ instanceId: "instance-2" });
		serverModule.startRemoteSessionServer.mockResolvedValueOnce(nextHandle);
		await harness.commands.get("remote").handler(undefined, harness.ctx);
		await vi.runAllTimersAsync();
		await harness.emitAsync("session_shutdown");
		expect(nextHandle.stop).toHaveBeenCalledTimes(1);
	});

	it("auto-starts during remote mode session startup and tracks client lifecycle notifications", async () => {
		const harness = createExtensionHarness();
		const handle = createRemoteHandle();
		harness.ctx.ui.setWidget = vi.fn();
		serverModule.isRemoteSessionEnv.mockReturnValue(true);
		serverModule.startRemoteSessionServer.mockResolvedValue(handle);

		const extension = await loadExtension();
		extension(harness.pi as never);
		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);
		await vi.runAllTimersAsync();
		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);
		await harness.emitAsync("session_switch", { type: "session_switch" }, harness.ctx);

		expect(serverModule.startRemoteSessionServer).toHaveBeenCalledTimes(1);
		expect(harness.notifications.at(0)?.msg).toBe(
			"🌐 Remote active · instance-42\nhttps://pi-remote.dev/?host=https%3A%2F%2Fpi.tailnet.ts.net%2Fpi%2Finstance-42%2F&t=test-token",
		);

		handle.server.connectedClients = 1;
		handle.emit("client_connect");
		await vi.runAllTimersAsync();
		expect(harness.notifications.at(-1)?.msg).toBe("Remote client connected.");
		expect(harness.statusMap.get("remote")).toBe("🌐 Remote: 1 client");

		handle.server.connectedClients = 0;
		handle.emit("client_disconnect");
		await vi.runAllTimersAsync();
		expect(harness.notifications.at(-1)?.msg).toBe("Remote client disconnected.");
		expect(harness.statusMap.get("remote")).toBe("🌐 Remote: 0 clients");
	});

	it("reports command and remote-mode startup failures and supports explicit widget enabling", async () => {
		const harness = createExtensionHarness();
		harness.ctx.ui.setWidget = vi.fn();
		serverModule.startRemoteSessionServer.mockRejectedValueOnce(new Error("boom"));

		const extension = await loadExtension();
		extension(harness.pi as never);

		await harness.commands.get("remote:widget").handler(undefined, harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toBe("Remote widget disabled.");

		await harness.commands.get("remote").handler(undefined, harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toBe("boom");

		serverModule.startRemoteSessionServer.mockRejectedValueOnce("string-boom");
		await harness.commands.get("remote").handler(undefined, harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toBe("Unable to start remote access.");

		await harness.commands.get("remote:widget").handler("on", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toBe("Remote widget enabled.");

		serverModule.isRemoteSessionEnv.mockReturnValue(true);
		serverModule.startRemoteSessionServer.mockRejectedValueOnce(new Error("remote-boom"));
		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toBe("remote-boom");

		serverModule.startRemoteSessionServer.mockRejectedValueOnce("remote-string-boom");
		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toBe("Unable to start remote access.");
	});
});

describe("widget helpers", () => {
	it("formats widget text and debounces rendering", async () => {
		const ctx = {
			ui: {
				setStatus: vi.fn(),
				setWidget: vi.fn(),
			},
		};
		const controller = createRemoteWidgetController({ debounceMs: 25 });
		const state = {
			clientCount: 2,
			connectUrl: "https://pi-remote.dev/?host=https%3A%2F%2Fpi.tailnet.ts.net%2Fpi%2Ffox-42%2F&t=token",
			instanceId: "fox-42",
			lanUrl: "http://192.168.1.20:3100/?t=token",
			localUrl: "http://localhost:3100/?t=token",
			remoteMode: true,
			token: "token",
			tunnelUrl: "https://pi.tailnet.ts.net/pi/fox-42/",
		};
		const localOnlyState = {
			clientCount: 0,
			connectUrl: "http://localhost:4100/?t=token",
			instanceId: "owl-9",
			localUrl: "http://localhost:4100/?t=token",
			remoteMode: false,
		};

		expect(formatStatusText(2)).toBe("🌐 Remote: 2 clients");
		expect(formatWidgetLines(state)).toContain("🌐 Remote (child mode)");
		expect(formatWidgetLines(localOnlyState)).toContain("• Local: http://localhost:4100/?t=token");

		controller.schedule(ctx, state);
		expect(ctx.ui.setWidget).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(25);
		expect(ctx.ui.setWidget).toHaveBeenCalledWith(
			"remote-tailscale",
			expect.arrayContaining(["• Clients: 2"]),
			expect.objectContaining({ placement: "belowEditor" }),
		);
		expect(ctx.ui.setStatus).toHaveBeenCalledWith("remote", "🌐 Remote: 2 clients");

		controller.setEnabled(false, ctx, state);
		expect(ctx.ui.setWidget).toHaveBeenLastCalledWith("remote-tailscale", undefined);
		expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("remote", undefined);
		controller.dispose();
	});
});

describe("qr helpers", () => {
	it("appends tokens, splits output, caches generated QR strings, and supports callback or string modules", async () => {
		const callbackModule = {
			generate: vi.fn((_url: string, _options: { small?: boolean }, callback?: (output: string) => void) => {
				callback?.("AA\nBB");
			}),
		};
		const loadCallbackModule = vi.fn(async () => callbackModule) as unknown as () => Promise<any>;
		const renderer = createQrRenderer({ loadModule: loadCallbackModule, maxCacheEntries: 2 });

		expect(appendTokenQuery("http://localhost:3100", "secret")).toBe("http://localhost:3100/?t=secret");
		expect(splitQrOutput("A\nB\n")).toEqual(["A", "B"]);
		expect(await renderer.render("http://localhost:3100/?t=secret")).toEqual(["AA", "BB"]);
		expect(await renderer.render("http://localhost:3100/?t=secret")).toEqual(["AA", "BB"]);
		expect(loadCallbackModule).toHaveBeenCalledTimes(1);

		const stringModule = {
			generate: vi.fn(() => "CC\nDD\n"),
		};
		expect(
			await renderTokenQr("http://localhost:4100", "next", {
				loadModule: (async () => stringModule) as () => Promise<any>,
			}),
		).toEqual(["CC", "DD"]);
		renderer.clear();
	});
});

describe("pty helpers", () => {
	it("builds remote environments and adapts PTY processes", async () => {
		const listeners = new Map<string, Array<(...args: any[]) => void>>();
		const pty = {
			kill: vi.fn(),
			on: vi.fn((event: string, handler: (...args: any[]) => void) => {
				listeners.set(event, [...(listeners.get(event) ?? []), handler]);
			}),
			off: vi.fn((event: string, handler: (...args: any[]) => void) => {
				listeners.set(
					event,
					(listeners.get(event) ?? []).filter((entry) => entry !== handler),
				);
			}),
			pid: 77,
			resize: vi.fn(),
			write: vi.fn(),
		};
		const loadModule = vi.fn(async () => ({
			spawn: vi.fn(() => pty),
		}));

		expect(buildPiCommand(" custom-pi ")).toBe("custom-pi");
		expect(buildPiCommand("   ")).toBe("pi");
		expect(buildRemotePtyEnv({ FOO: "bar" }).PI_REMOTE_TAILSCALE_MODE).toBe("remote");

		const handle = await createPtyProcess(
			{ args: ["--session", "123"], command: "pi", columns: 80, cwd: "/tmp/demo", rows: 24 },
			{ loadModule },
		);
		const offData = handle.onData((data) => {
			expect(data).toBe("hello");
		});
		const offExit = handle.onExit((event) => {
			expect(event).toEqual({ exitCode: 0, signal: 15 });
		});

		for (const handler of listeners.get("data") ?? []) {
			handler("hello");
		}
		for (const handler of listeners.get("exit") ?? []) {
			handler(0, 15);
		}

		handle.write("input");
		handle.resize(120, 40);
		handle.kill("SIGTERM");
		offData();
		offExit();

		expect(pty.write).toHaveBeenCalledWith("input");
		expect(pty.resize).toHaveBeenCalledWith(120, 40);
		expect(pty.kill).toHaveBeenCalledWith("SIGTERM");
		expect(pty.off).toHaveBeenCalledTimes(2);

		(
			globalThis as typeof globalThis & { __PI_REMOTE_TAILSCALE_PTY_LOADER__?: () => Promise<any> }
		).__PI_REMOTE_TAILSCALE_PTY_LOADER__ = async () => ({
			spawn: vi.fn(() => pty),
		});
		await createPtyProcess({ command: "pi" });
		delete (globalThis as typeof globalThis & { __PI_REMOTE_TAILSCALE_PTY_LOADER__?: () => Promise<any> })
			.__PI_REMOTE_TAILSCALE_PTY_LOADER__;
	});
});

describe("cli helpers", () => {
	it("parses CLI arguments and exercises help, env, success, and error paths", async () => {
		expect(
			parseArgs(["node", "cli.js", "--cwd", "/tmp/demo", "--command", "pi-dev", "--", "--session", "123"]),
		).toEqual({
			args: ["--", "--session", "123"],
			command: "pi-dev",
			cwd: "/tmp/demo",
			help: false,
			printEnv: false,
		});
		expect(parseArgs(["node", "cli.js", "--command"])).toEqual({
			args: [],
			command: "pi",
			cwd: undefined,
			help: false,
			printEnv: false,
		});

		const log = vi.fn();
		const error = vi.fn();
		const startPty = vi.fn(async () => ({}));

		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			expect(await main(["node", "cli.js", "--help"])).toBe(0);
			expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining("PTY launcher helper"));
		} finally {
			consoleLog.mockRestore();
			consoleError.mockRestore();
		}

		expect(await main(["node", "cli.js", "--help"], { error, log, startPty })).toBe(0);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("PTY launcher helper"));

		log.mockClear();
		expect(await main(["node", "cli.js", "--print-env"], { error, log, startPty })).toBe(0);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("PI_REMOTE_TAILSCALE_MODE"));

		log.mockClear();
		expect(await main(["node", "cli.js", "--cwd", "/tmp/demo"], { error, log, startPty })).toBe(0);
		expect(startPty).toHaveBeenCalledWith(
			expect.objectContaining({
				command: "pi",
				cwd: "/tmp/demo",
				env: expect.objectContaining({ PI_REMOTE_TAILSCALE_MODE: "remote" }),
			}),
		);

		startPty.mockRejectedValueOnce(new Error("spawn failed"));
		expect(await main(["node", "cli.js"], { error, log, startPty })).toBe(1);
		expect(error).toHaveBeenCalledWith("spawn failed");

		startPty.mockRejectedValueOnce("string failure");
		expect(await main(["node", "cli.js"], { error, log, startPty })).toBe(1);
		expect(error).toHaveBeenCalledWith("string failure");
	});
});
