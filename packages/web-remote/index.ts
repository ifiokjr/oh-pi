import { createPiWebServer, detectTunnelProvider, getLanIp, startTunnel } from "@ifi/pi-web-server";
import type { PiWebServer } from "@ifi/pi-web-server";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const HOSTED_UI_URL = "https://pi-remote.dev";

export default function (pi: ExtensionAPI) {
	let server: PiWebServer | undefined;
	let unsubConnect: (() => void) | undefined;
	let unsubDisconnect: (() => void) | undefined;

	pi.registerCommand("remote", {
		description: "Share this session via web UI. Scan QR code to connect.",
		handler: async (args, ctx) => {
			const trimmed = args?.trim() ?? "";

			// /remote stop
			if (trimmed === "stop") {
				if (!server?.isRunning) {
					ctx.ui.notify("Remote access is not active.", "info");
					return;
				}
				await server.stop();
				unsubConnect?.();
				unsubDisconnect?.();
				server = undefined;
				ctx.ui.setStatus("remote", undefined);
				ctx.ui.notify("Remote access stopped.", "info");
				return;
			}

			// /remote (show info if active, or start)
			if (server?.isRunning) {
				const url = buildConnectUrl(server);
				ctx.ui.notify(`Remote active · ${server.connectedClients} client(s) · ${server.instanceId}\n${url}`, "info");
				return;
			}

			// Start server
			ctx.ui.notify("Starting remote access...", "info");

			server = createPiWebServer();

			const result = await server.start();

			// Attach the current session
			// The ExtensionCommandContext provides access to the session indirectly.
			// We cast through the pi API — the server uses a minimal AgentSessionLike interface.
			// In practice this is wired via the session the extension is loaded into.

			// Try to start tunnel
			const tunnelProvider = detectTunnelProvider();

			if (tunnelProvider) {
				try {
					const port = Number.parseInt(result.url.match(/:(\d+)/)?.[1] ?? "3100", 10);
					const tunnel = await startTunnel(port, tunnelProvider);
					server.setTunnel(tunnel);
				} catch {
					// Continue without tunnel
				}
			}

			const connectUrl = buildConnectUrl(server);

			// Show connection info
			ctx.ui.notify(`🌐 Remote active · ${server.instanceId}\n${connectUrl}`, "info");

			// Set persistent status
			updateStatus(ctx, server);

			// Track client connections
			const currentServer = server;
			unsubConnect = currentServer.on("client_connect", (_clientId) => {
				ctx.ui.notify("Client connected", "info");
				updateStatus(ctx, currentServer);
			});

			unsubDisconnect = currentServer.on("client_disconnect", (_clientId) => {
				ctx.ui.notify("Client disconnected", "info");
				updateStatus(ctx, currentServer);
			});
		},
	});

	// Clean up on session shutdown
	pi.on("session_shutdown", async () => {
		if (server?.isRunning) {
			await server.stop();
			unsubConnect?.();
			unsubDisconnect?.();
			server = undefined;
		}
	});
}

function buildConnectUrl(server: PiWebServer): string {
	const { tunnelUrl } = server;

	if (tunnelUrl) {
		return `${HOSTED_UI_URL}?host=${encodeURIComponent(tunnelUrl)}&t=${server.token}`;
	}

	const lanIp = getLanIp();
	const port = server.url.match(/:(\d+)/)?.[1] ?? "3100";

	if (lanIp) {
		return `http://${lanIp}:${port}?t=${server.token}`;
	}

	return `${server.url}?t=${server.token}`;
}

function updateStatus(
	ctx: { ui: { setStatus: (key: string, text: string | undefined) => void } },
	server: PiWebServer,
): void {
	const count = server.connectedClients;
	const text = `🌐 Remote: ${count} client${count === 1 ? "" : "s"}`;
	ctx.ui.setStatus("remote", text);
}
