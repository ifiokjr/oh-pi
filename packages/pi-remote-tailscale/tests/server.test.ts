import { afterEach, describe, expect, it, vi } from "vitest";

const webServerModule = vi.hoisted(() => ({
	createPiWebServer: vi.fn(),
	getLanIp: vi.fn(),
	validateToken: vi.fn((provided: string, expected: string) => provided === expected),
}));

const tailscaleModule = vi.hoisted(() => ({
	startTailscaleServe: vi.fn(),
}));

vi.mock("@ifi/pi-web-server", () => webServerModule);
vi.mock("../src/tailscale.js", () => tailscaleModule);

import {
	appendAuthToken,
	buildBestConnectUrl,
	buildHostedConnectUrl,
	buildRemoteModeEnv,
	createAuthHeaders,
	hasValidToken,
	isRemoteSessionEnv,
	parsePortFromServerUrl,
	renderErrorPage,
	startRemoteSessionServer,
} from "../src/server.js";

function createMockServer(overrides: Partial<Record<string, unknown>> = {}) {
	let running = false;
	let connectedClients = 0;
	const handlers = {
		client_connect: [] as Array<(clientId: string) => void>,
		client_disconnect: [] as Array<(clientId: string) => void>,
	};

	const server = {
		attachSession: vi.fn(),
		on: vi.fn((event: keyof typeof handlers, handler: (clientId: string) => void) => {
			handlers[event].push(handler);
			return vi.fn();
		}),
		setTunnel: vi.fn(),
		start: vi.fn(async () => {
			running = true;
			return { instanceId: "instance-42", token: "test-token", url: "http://localhost:3100" };
		}),
		stop: vi.fn(async () => {
			running = false;
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
		...overrides,
	};

	return server;
}

afterEach(() => {
	vi.restoreAllMocks();
	delete process.env.PI_REMOTE_TAILSCALE_MODE;
});

describe("remote session server helpers", () => {
	it("builds auth, LAN, hosted, and env-aware URLs", () => {
		expect(appendAuthToken("http://localhost:3100", "abc")).toBe("http://localhost:3100/?t=abc");
		expect(buildHostedConnectUrl("https://pi.tailnet.ts.net/pi/session-42/", "abc")).toBe(
			"https://pi-remote.dev/?host=https%3A%2F%2Fpi.tailnet.ts.net%2Fpi%2Fsession-42%2F&t=abc",
		);
		expect(
			buildBestConnectUrl({
				lanUrl: "http://192.168.1.10:3100/?t=abc",
				localUrl: "http://localhost:3100/?t=abc",
				token: "abc",
				tunnelUrl: "https://pi.tailnet.ts.net/pi/session-42/",
			}),
		).toContain("host=https%3A%2F%2Fpi.tailnet.ts.net%2Fpi%2Fsession-42%2F");
		expect(
			buildBestConnectUrl({
				lanUrl: "http://192.168.1.10:3100/?t=abc",
				localUrl: "http://localhost:3100/?t=abc",
				token: "abc",
			}),
		).toBe("http://192.168.1.10:3100/?t=abc");
		expect(buildBestConnectUrl({ localUrl: "http://localhost:3100/?t=abc", token: "abc" })).toBe(
			"http://localhost:3100/?t=abc",
		);
		expect(parsePortFromServerUrl("http://localhost:3100")).toBe(3100);
		expect(() => parsePortFromServerUrl("http://localhost")).toThrow("Unable to determine the remote server port.");

		process.env.PI_REMOTE_TAILSCALE_MODE = "remote";
		expect(isRemoteSessionEnv()).toBe(true);
		expect(buildRemoteModeEnv({ FOO: "bar" }).PI_REMOTE_TAILSCALE_MODE).toBe("remote");
		expect(createAuthHeaders("secret")).toEqual({ Authorization: "Bearer secret" });
		expect(hasValidToken(undefined, "secret")).toBe(false);
		expect(hasValidToken("secret", "secret")).toBe(true);
		expect(webServerModule.validateToken).toHaveBeenCalledWith("secret", "secret");
	});

	it("renders styled 403 and 404 pages", () => {
		expect(renderErrorPage(403)).toContain("HTTP 403");
		expect(renderErrorPage(403)).toContain("A valid token is required");
		expect(renderErrorPage(404)).toContain("Not found");
		expect(renderErrorPage(404)).toContain("does not exist");
		expect(renderErrorPage(404, "Missing", "Not here")).toContain("Missing");
		expect(renderErrorPage(404, "Missing", "Not here")).toContain("Not here");
	});
});

describe("startRemoteSessionServer", () => {
	it("starts the shared web server, attaches the resolved session, and prefers tailscale URLs", async () => {
		const session = { prompt: vi.fn(), subscribe: vi.fn() };
		const server = createMockServer();
		const discovery = {
			register: vi.fn(async () => ({ id: "record-1" })),
			unregister: vi.fn(async () => {}),
		};
		webServerModule.createPiWebServer.mockReturnValue(server);
		webServerModule.getLanIp.mockReturnValue("192.168.1.20");
		tailscaleModule.startTailscaleServe.mockResolvedValue({
			provider: "tailscale",
			hostname: "pi.tailnet.ts.net",
			publicUrl: "https://pi.tailnet.ts.net/pi/instance-42/",
			servePath: "/pi/instance-42/",
			stop: vi.fn(async () => {}),
		});

		const handle = await startRemoteSessionServer({
			discovery: discovery as never,
			resolveSession: () => session as never,
		});

		expect(webServerModule.createPiWebServer).toHaveBeenCalledWith({ host: "0.0.0.0", port: undefined, token: undefined });
		expect(server.attachSession).toHaveBeenCalledWith(session);
		expect(tailscaleModule.startTailscaleServe).toHaveBeenCalledWith({ instanceId: "instance-42", port: 3100 });
		expect(server.setTunnel).toHaveBeenCalledWith(
			expect.objectContaining({ publicUrl: "https://pi.tailnet.ts.net/pi/instance-42/", provider: "tailscale" }),
		);
		expect(handle.localUrl).toBe("http://localhost:3100/?t=test-token");
		expect(handle.lanUrl).toBe("http://192.168.1.20:3100/?t=test-token");
		expect(handle.connectUrl).toBe(
			"https://pi-remote.dev/?host=https%3A%2F%2Fpi.tailnet.ts.net%2Fpi%2Finstance-42%2F&t=test-token",
		);
		expect(discovery.register).toHaveBeenCalledWith(
			expect.objectContaining({
				connectUrl:
					"https://pi-remote.dev/?host=https%3A%2F%2Fpi.tailnet.ts.net%2Fpi%2Finstance-42%2F&t=test-token",
				instanceId: "instance-42",
				lanUrl: "http://192.168.1.20:3100/?t=test-token",
				localUrl: "http://localhost:3100/?t=test-token",
			}),
		);

		await handle.stop();
		expect(discovery.unregister).toHaveBeenCalledWith("record-1");
		expect(server.stop).toHaveBeenCalledTimes(1);
	});

	it("falls back to LAN or localhost when tailscale startup fails or is disabled", async () => {
		const tailscaleFailureServer = createMockServer();
		webServerModule.createPiWebServer.mockReturnValueOnce(tailscaleFailureServer);
		webServerModule.getLanIp.mockReturnValueOnce("192.168.1.20");
		tailscaleModule.startTailscaleServe.mockRejectedValueOnce(new Error("tailscale failed"));

		const lanHandle = await startRemoteSessionServer();
		expect(lanHandle.connectUrl).toBe("http://192.168.1.20:3100/?t=test-token");
		expect(tailscaleFailureServer.setTunnel).not.toHaveBeenCalled();

		const noTunnelServer = createMockServer({ start: vi.fn(async () => ({ instanceId: "instance-2", token: "local-token", url: "http://localhost:4100" })) });
		webServerModule.createPiWebServer.mockReturnValueOnce(noTunnelServer);
		webServerModule.getLanIp.mockReturnValueOnce(undefined);

		const localHandle = await startRemoteSessionServer({ enableTailscale: false });
		expect(localHandle.connectUrl).toBe("http://localhost:4100/?t=local-token");
		expect(tailscaleModule.startTailscaleServe).toHaveBeenCalledTimes(1);
	});

	it("supports passing a session directly without a resolver", async () => {
		const server = createMockServer();
		const session = { prompt: vi.fn(), subscribe: vi.fn() };
		webServerModule.createPiWebServer.mockReturnValue(server);
		webServerModule.getLanIp.mockReturnValue(undefined);
		tailscaleModule.startTailscaleServe.mockRejectedValue(new Error("tailscale failed"));

		await startRemoteSessionServer({ session: session as never });
		expect(server.attachSession).toHaveBeenCalledWith(session);
	});
});
