#!/usr/bin/env node

import { getLanIp } from "../lan.js";
import { PiWebServer } from "../server.js";
import { detectTunnelProvider, startTunnel } from "../tunnel.js";

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args[0] !== "serve" && args.length > 0 && args[0] !== "--help" && args[0] !== "-h") {
		console.error(`Unknown command: ${args[0]}`);
		console.error("Usage: pi-web serve [options]");
		process.exit(1);
	}

	if (args[0] === "--help" || args[0] === "-h") {
		printHelp();
		process.exit(0);
	}

	// Parse flags
	const flags = parseFlags(args.slice(args[0] === "serve" ? 1 : 0));
	const cwd = flags.cwd ?? process.cwd();
	const port = flags.port ? Number.parseInt(flags.port, 10) : undefined;
	const noTunnel = flags["no-tunnel"] === "true";
	const tokenFile = flags["token-file"] ?? `${process.env.HOME ?? "~"}/.config/pi-web/token`;

	process.chdir(cwd);

	const server = new PiWebServer({ port, tokenFile });

	// Start server
	const result = await server.start();
	const lanIp = getLanIp();

	const portMatch = result.url.match(/:(\d+)/)?.[1];
	const resolvedPort = portMatch ? Number.parseInt(portMatch, 10) : 3100;

	// Try to start tunnel
	let tunnelUrl: string | undefined;

	if (!noTunnel) {
		const provider = detectTunnelProvider();

		if (provider) {
			try {
				const tunnel = await startTunnel(resolvedPort, provider);
				server.setTunnel(tunnel);
				tunnelUrl = tunnel.publicUrl;
			} catch {
				// Tunnel failed, continue without it
			}
		}
	}

	// Build connection URL
	const connectUrl = tunnelUrl
		? `${tunnelUrl}?t=${server.token}`
		: lanIp
			? `http://${lanIp}:${resolvedPort}?t=${server.token}`
			: `${result.url}?t=${server.token}`;

	console.log("");
	console.log("  ╭─────────────────────────────────────────╮");
	console.log("  │  pi-web daemon running                  │");
	console.log("  │                                         │");
	console.log(`  │  🌐 ${connectUrl}`);
	console.log(`  │  🔑 Instance ID: ${result.instanceId}`);
	if (tunnelUrl) {
		console.log("  │  🔒 Tunnel active                       │");
	}
	console.log("  │                                         │");
	console.log("  │  Ctrl+C to stop                         │");
	console.log("  ╰─────────────────────────────────────────╯");
	console.log("");

	server.on("client_connect", (clientId) => {
		console.log(`  ✓ Client connected: ${clientId} (${server.connectedClients} total)`);
	});

	server.on("client_disconnect", (clientId) => {
		console.log(`  ✗ Client disconnected: ${clientId} (${server.connectedClients} total)`);
	});

	// Graceful shutdown
	const shutdown = async () => {
		console.log("\n  Shutting down...");
		await server.stop();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

function parseFlags(args: string[]): Record<string, string> {
	const flags: Record<string, string> = {};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg.startsWith("--")) {
			const key = arg.slice(2);

			if (key === "no-tunnel") {
				flags[key] = "true";
			} else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
				flags[key] = args[++i];
			}
		}
	}
	return flags;
}

function printHelp(): void {
	console.log("Usage: pi-web serve [options]");
	console.log("");
	console.log("Options:");
	console.log("  --cwd <path>          Working directory (default: cwd)");
	console.log("  --port <number>       Port (default: 3100, auto-increments if taken)");
	console.log("  --token-file <path>   Token file path (default: ~/.config/pi-web/token)");
	console.log("  --no-tunnel           Disable automatic tunnel detection");
	console.log("  -h, --help            Show this help");
}

main().catch((error) => {
	console.error("Fatal:", error.message ?? error);
	process.exit(1);
});
