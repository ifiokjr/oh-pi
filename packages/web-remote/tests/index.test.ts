import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";

const webServerModule = vi.hoisted(() => ({
	createPiWebServer: vi.fn(),
	detectTunnelProvider: vi.fn(),
	getLanIp: vi.fn(),
	startTunnel: vi.fn(),
}));

vi.mock<typeof import("@ifi/pi-web-server")>(import("@ifi/pi-web-server"), () => webServerModule);

import remoteExtension from "../index.ts";

type MockServer = ReturnType<typeof createMockServer>;

function createMockServer(overrides: Partial<Record<string, unknown>> = {}) {
	const handlers = {
		client_connect: [] as ((clientId: string) => void)[],
		client_disconnect: [] as ((clientId: string) => void)[],
	};
	let running = false;
	let tunnelUrl: string | undefined;
	let connectedClients = 0;

	const server = {
		get connectedClients() {
			return connectedClients;
		},
		set connectedClients(value: number) {
			connectedClients = value;
		},
		emit(event: keyof typeof handlers, clientId = "client-1") {
			for (const handler of handlers[event]) {
				handler(clientId);
			}
		},
		instanceId: "instance-42",
		get isRunning() {
			return running;
		},
		on: vi.fn((event: keyof typeof handlers, handler: (clientId: string) => void) => {
			handlers[event].push(handler);
			return vi.fn(() => {
				handlers[event] = handlers[event].filter((entry) => entry !== handler);
			});
		}),
		setTunnel: vi.fn((tunnel: { publicUrl: string }) => {
			tunnelUrl = tunnel.publicUrl;
		}),
		start: vi.fn(() => {
			running = true;
			return Promise.resolve({ url: server.url, token: server.token, instanceId: server.instanceId });
		}),
		stop: vi.fn(() => {
			running = false;
			return Promise.resolve();
		}),
		token: "test-token",
		get tunnelUrl() {
			return tunnelUrl;
		},
		url: "http://localhost:3100",
		...overrides,
	};

	return server;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("web-remote extension", () => {
	it("starts remote access, prefers tunnel URLs, and reuses the active session", async () => {
		const harness = createExtensionHarness();
		const server = createMockServer();
		webServerModule.createPiWebServer.mockReturnValue(server);
		webServerModule.detectTunnelProvider.mockReturnValue("cloudflared");
		webServerModule.startTunnel.mockResolvedValue({
			provider: "cloudflared",
			publicUrl: "https://quiet-river.trycloudflare.com",
			stop: vi.fn(),
		});
		webServerModule.getLanIp.mockReturnValue("192.168.1.20");

		remoteExtension(harness.pi as never);
		const command = harness.commands.get("remote");
		await command.handler(undefined, harness.ctx);

		expect(webServerModule.createPiWebServer).toHaveBeenCalledOnce();
		expect(webServerModule.startTunnel).toHaveBeenCalledWith(3100, "cloudflared");
		expect(server.setTunnel).toHaveBeenCalledWith(
			expect.objectContaining({ publicUrl: "https://quiet-river.trycloudflare.com" }),
		);
		expect(harness.notifications.map((entry) => entry.msg)).toStrictEqual([
			"Starting remote access...",
			"🌐 Remote active · instance-42\nhttps://pi-remote.dev?host=https%3A%2F%2Fquiet-river.trycloudflare.com&t=test-token",
		]);
		expect(harness.statusMap.get("remote")).toBe("🌐 Remote: 0 clients");

		server.connectedClients = 2;
		await command.handler(undefined, harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toBe(
			"Remote active · 2 client(s) · instance-42\nhttps://pi-remote.dev?host=https%3A%2F%2Fquiet-river.trycloudflare.com&t=test-token",
		);
	});

	it("falls back to LAN and localhost URLs when no tunnel is available", async () => {
		const harness = createExtensionHarness();
		const lanServer = createMockServer();
		webServerModule.createPiWebServer.mockReturnValueOnce(lanServer);
		webServerModule.detectTunnelProvider.mockReturnValue();
		webServerModule.getLanIp.mockReturnValueOnce("192.168.1.20").mockReturnValueOnce();

		remoteExtension(harness.pi as never);
		const command = harness.commands.get("remote");
		await command.handler(undefined, harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("http://192.168.1.20:3100?t=test-token");

		const localhostServer = createMockServer({ token: "local-token", url: "http://localhost:4100" });
		webServerModule.createPiWebServer.mockReturnValueOnce(localhostServer);
		await command.handler("stop", harness.ctx);
		await command.handler(undefined, harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("http://localhost:4100?t=local-token");
	});

	it("keeps running when tunnel startup fails", async () => {
		const harness = createExtensionHarness();
		const server = createMockServer();
		webServerModule.createPiWebServer.mockReturnValue(server);
		webServerModule.detectTunnelProvider.mockReturnValue("cloudflared");
		webServerModule.startTunnel.mockRejectedValue(new Error("tunnel failed"));
		webServerModule.getLanIp.mockReturnValue();

		remoteExtension(harness.pi as never);
		await harness.commands.get("remote").handler(undefined, harness.ctx);

		expect(server.setTunnel).not.toHaveBeenCalled();
		expect(harness.notifications.at(-1)?.msg).toContain("http://localhost:3100?t=test-token");
	});

	it("updates status when clients connect and disconnect", async () => {
		const harness = createExtensionHarness();
		const server = createMockServer();
		webServerModule.createPiWebServer.mockReturnValue(server);
		webServerModule.detectTunnelProvider.mockReturnValue();
		webServerModule.getLanIp.mockReturnValue("192.168.1.20");

		remoteExtension(harness.pi as never);
		await harness.commands.get("remote").handler(undefined, harness.ctx);

		server.connectedClients = 1;
		server.emit("client_connect");
		expect(harness.notifications.at(-1)?.msg).toBe("Client connected");
		expect(harness.statusMap.get("remote")).toBe("🌐 Remote: 1 client");

		server.connectedClients = 0;
		server.emit("client_disconnect");
		expect(harness.notifications.at(-1)?.msg).toBe("Client disconnected");
		expect(harness.statusMap.get("remote")).toBe("🌐 Remote: 0 clients");
	});

	it("handles stop requests and session shutdown cleanup", async () => {
		const harness = createExtensionHarness();
		const server = createMockServer();
		webServerModule.createPiWebServer.mockReturnValue(server);
		webServerModule.detectTunnelProvider.mockReturnValue();
		webServerModule.getLanIp.mockReturnValue("192.168.1.20");

		remoteExtension(harness.pi as never);
		const command = harness.commands.get("remote");

		await command.handler("stop", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toBe("Remote access is not active.");

		await command.handler(undefined, harness.ctx);
		await command.handler("stop", harness.ctx);
		expect(server.stop).toHaveBeenCalledOnce();
		expect(harness.statusMap.has("remote")).toBeFalsy();
		expect(harness.notifications.at(-1)?.msg).toBe("Remote access stopped.");

		const nextServer = createMockServer({ instanceId: "instance-2" });
		webServerModule.createPiWebServer.mockReturnValueOnce(nextServer);
		await command.handler(undefined, harness.ctx);
		await harness.emitAsync("session_shutdown");
		expect(nextServer.stop).toHaveBeenCalledOnce();
	});
});
