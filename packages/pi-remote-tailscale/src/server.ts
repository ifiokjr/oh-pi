import { createPiWebServer, getLanIp, validateToken } from '@ifi/pi-web-server';
import type { AgentSessionLike, PiWebServer } from '@ifi/pi-web-server';
import type { DiscoveryRecord, DiscoveryService } from "./discovery.js";
import { startTailscaleServe } from './tailscale.js';
import type { TailscaleServeSession } from './tailscale.js';

export const DEFAULT_HOSTED_UI_URL = "https://pi-remote.dev";
export const REMOTE_MODE_ENV = "PI_REMOTE_TAILSCALE_MODE";
const DEFAULT_SERVER_HOST = "0.0.0.0";
const INVALID_PORT_ERROR = "Unable to determine the remote server port.";

export interface RemoteSessionServerOptions {
	discovery?: DiscoveryService;
	enableTailscale?: boolean;
	getLanIpFn?: () => string | undefined;
	host?: string;
	hostedUiUrl?: string;
	pid?: number;
	port?: number;
	resolveSession?: () => AgentSessionLike | undefined;
	session?: AgentSessionLike;
	startTailscale?: (options: { instanceId: string; port: number }) => Promise<TailscaleServeSession>;
	token?: string;
}

export interface RemoteSessionHandle {
	connectUrl: string;
	discoveryRecordId?: string;
	instanceId: string;
	lanUrl?: string;
	localUrl: string;
	server: PiWebServer;
	stop: () => Promise<void>;
	token: string;
	tunnelUrl?: string;
}

export function isRemoteSessionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
	return env[REMOTE_MODE_ENV]?.trim() === "remote";
}

export function buildRemoteModeEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	return {
		...env,
		[REMOTE_MODE_ENV]: "remote",
	};
}

export function parsePortFromServerUrl(serverUrl: string): number {
	const parsed = new URL(serverUrl);
	const port = Number(parsed.port);
	if (!Number.isFinite(port) || port <= 0) {
		throw new Error(INVALID_PORT_ERROR);
	}
	return port;
}

export function appendAuthToken(url: string, token: string): string {
	const parsed = new URL(url);
	parsed.searchParams.set("t", token);
	return parsed.toString();
}

export function buildHostedConnectUrl(tunnelUrl: string, token: string, hostedUiUrl = DEFAULT_HOSTED_UI_URL): string {
	const parsed = new URL(hostedUiUrl);
	parsed.searchParams.set("host", tunnelUrl);
	parsed.searchParams.set("t", token);
	return parsed.toString();
}

export function buildBestConnectUrl(options: {
	hostedUiUrl?: string;
	lanUrl?: string;
	localUrl: string;
	token: string;
	tunnelUrl?: string;
}): string {
	if (options.tunnelUrl) {
		return buildHostedConnectUrl(options.tunnelUrl, options.token, options.hostedUiUrl);
	}

	if (options.lanUrl) {
		return options.lanUrl;
	}

	return options.localUrl;
}

export function createAuthHeaders(token: string): { Authorization: string } {
	return { Authorization: `Bearer ${token}` };
}

export function hasValidToken(provided: string | undefined | null, expected: string): boolean {
	if (!provided) {
		return false;
	}

	return validateToken(provided, expected);
}

export function renderErrorPage(status: 403 | 404, title?: string, detail?: string): string {
	const resolvedTitle = title ?? (status === 403 ? "Forbidden" : "Not found");
	const resolvedDetail =
		detail ??
		(status === 403
			? "A valid token is required to view this remote session."
			: "The requested remote resource does not exist.");

	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>${resolvedTitle}</title>
		<style>
			:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
			body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at top, #1e293b, #020617 58%); color: #e2e8f0; }
			main { width: min(520px, calc(100vw - 32px)); border-radius: 24px; border: 1px solid rgba(148, 163, 184, 0.25); background: rgba(15, 23, 42, 0.9); padding: 28px; box-shadow: 0 30px 80px rgba(15, 23, 42, 0.5); }
			h1 { margin: 0 0 10px; font-size: 30px; }
			p { margin: 0; color: #cbd5e1; line-height: 1.6; }
			.badge { display: inline-flex; margin-bottom: 14px; border-radius: 999px; padding: 4px 10px; background: rgba(59, 130, 246, 0.2); color: #93c5fd; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
		</style>
	</head>
	<body>
		<main>
			<div class="badge">HTTP ${status}</div>
			<h1>${resolvedTitle}</h1>
			<p>${resolvedDetail}</p>
		</main>
	</body>
</html>`;
}

function buildDiscoveryRecord(options: {
	connectUrl: string;
	instanceId: string;
	lanUrl?: string;
	localUrl: string;
	pid: number;
	tunnelUrl?: string;
}): Omit<DiscoveryRecord, "id" | "startedAt" | "lastSeenAt"> {
	return {
		connectUrl: options.connectUrl,
		cwd: process.cwd(),
		instanceId: options.instanceId,
		lanUrl: options.lanUrl,
		localUrl: options.localUrl,
		pid: options.pid,
		remoteMode: isRemoteSessionEnv(),
		tunnelUrl: options.tunnelUrl,
	};
}

export async function startRemoteSessionServer(options: RemoteSessionServerOptions = {}): Promise<RemoteSessionHandle> {
	const server = createPiWebServer({
		host: options.host ?? DEFAULT_SERVER_HOST,
		port: options.port,
		token: options.token,
	});
	const session = options.session ?? options.resolveSession?.();
	if (session) {
		server.attachSession(session);
	}

	const started = await server.start();
	const port = parsePortFromServerUrl(started.url);
	const localUrl = appendAuthToken(started.url, started.token);
	const getLanIpFn = options.getLanIpFn ?? getLanIp;
	const lanIp = getLanIpFn();
	const lanUrl = lanIp ? appendAuthToken(`http://${lanIp}:${port}`, started.token) : undefined;
	const startTailscale = options.startTailscale ?? startTailscaleServe;
	let tunnelUrl: string | undefined;
	let tailscaleSession: TailscaleServeSession | undefined;

	if (options.enableTailscale !== false) {
		try {
			tailscaleSession = await startTailscale({ instanceId: started.instanceId, port });
			tunnelUrl = tailscaleSession.publicUrl;
			server.setTunnel({
				provider: "tailscale",
				publicUrl: tailscaleSession.publicUrl,
				stop: () => {
					void tailscaleSession?.stop();
				},
			});
		} catch {
			// Continue with LAN or localhost URLs.
		}
	}

	const connectUrl = buildBestConnectUrl({
		hostedUiUrl: options.hostedUiUrl ?? DEFAULT_HOSTED_UI_URL,
		lanUrl,
		localUrl,
		token: started.token,
		tunnelUrl,
	});

	let discoveryRecordId: string | undefined;
	if (options.discovery) {
		const record = await options.discovery.register(
			buildDiscoveryRecord({
				connectUrl,
				instanceId: started.instanceId,
				lanUrl,
				localUrl,
				pid: options.pid ?? process.pid,
				tunnelUrl,
			}),
		);
		discoveryRecordId = record.id;
	}

	return {
		connectUrl,
		discoveryRecordId,
		instanceId: started.instanceId,
		lanUrl,
		localUrl,
		server,
		stop: async () => {
			if (discoveryRecordId) {
				await options.discovery?.unregister(discoveryRecordId);
			}
			await server.stop();
		},
		token: started.token,
		tunnelUrl,
	};
}
