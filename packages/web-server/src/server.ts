import { createServer } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { createRoutes } from './routes.js';
import type { RoutesOptions } from './routes.js';
import { generateInstanceId, generateToken, loadOrCreateToken } from "./token.js";
import type { TunnelInfo } from "./tunnel.js";
import { handleWebSocketConnection } from './ws-handler.js';
import type { AgentSessionLike, WsSession } from './ws-handler.js';

export interface PiWebServerOptions {
	port?: number;
	host?: string;
	token?: string;
	tokenFile?: string;
	tunnel?: boolean;
	tls?: { cert: string; key: string };
	maxClients?: number;
	staticDir?: string;
	hostedUiUrl?: string;
}

export interface ServerStartResult {
	url: string;
	token: string;
	instanceId: string;
}

type EventHandler = (clientId: string) => void;

export class PiWebServer {
	private _options: Required<
		Pick<PiWebServerOptions, "host" | "maxClients"> & { port: number; token: string; instanceId: string }
	>;
	private _server: Server | undefined;
	private _wss: WebSocketServer | undefined;
	private _session: AgentSessionLike | undefined;
	private _clients = new Map<string, WsSession>();
	private _tunnel: TunnelInfo | undefined;
	private _isRunning = false;
	private _url = "";
	private _connectHandlers: EventHandler[] = [];
	private _disconnectHandlers: EventHandler[] = [];

	constructor(options: PiWebServerOptions = {}) {
		let token: string;
		let instanceId: string;

		if (options.tokenFile) {
			const info = loadOrCreateToken(options.tokenFile);
			({ token } = info);
			({ instanceId } = info);
		} else if (options.token) {
			({ token } = options);
			instanceId = generateInstanceId(token);
		} else {
			token = generateToken();
			instanceId = generateInstanceId(token);
		}

		this._options = {
			host: options.host ?? "0.0.0.0",
			instanceId,
			maxClients: options.maxClients ?? 5,
			port: options.port ?? 3100,
			token,
		};
	}

	get isRunning(): boolean {
		return this._isRunning;
	}

	get connectedClients(): number {
		return this._clients.size;
	}

	get url(): string {
		return this._url;
	}

	get token(): string {
		return this._options.token;
	}

	get instanceId(): string {
		return this._options.instanceId;
	}

	attachSession(session: AgentSessionLike): void {
		this._session = session;
	}

	detachSession(): void {
		this._session = undefined;
	}

	on(event: "client_connect" | "client_disconnect", handler: EventHandler): () => void {
		const handlers = event === "client_connect" ? this._connectHandlers : this._disconnectHandlers;
		handlers.push(handler);
		return () => {
			const idx = handlers.indexOf(handler);
			if (idx !== -1) {
				handlers.splice(idx, 1);
			}
		};
	}

	async start(): Promise<ServerStartResult> {
		const routesOptions: RoutesOptions = {
			getConnectedClients: () => this._clients.size,
			getSession: () => this._session,
			instanceId: this._options.instanceId,
			startTime: Date.now(),
			token: this._options.token,
		};

		const app = createRoutes(routesOptions);

		const port = await this._findFreePort(this._options.port);

		return new Promise((resolve, reject) => {
			const server = createServer(async (req, res) => {
				// Let Hono handle the request
				const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
				const honoReq = new Request(url.toString(), {
					headers: req.headers as Record<string, string>,
					method: req.method,
				});
				const honoRes = await app.fetch(honoReq);
				res.writeHead(honoRes.status, Object.fromEntries(honoRes.headers.entries()));
				const body = await honoRes.text();
				res.end(body);
			});

			this._wss = new WebSocketServer({ server });

			this._wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
				if (this._clients.size >= this._options.maxClients) {
					ws.close(4002, "Max clients reached");
					return;
				}

				const wsSession = handleWebSocketConnection(ws, {
					getSession: () => this._session,
					instanceId: this._options.instanceId,
					onClientConnect: (clientId) => {
						this._clients.set(clientId, wsSession);
						for (const handler of this._connectHandlers) {
							handler(clientId);
						}
					},
					onClientDisconnect: (clientId) => {
						this._clients.delete(clientId);
						for (const handler of this._disconnectHandlers) {
							handler(clientId);
						}
					},
					token: this._options.token,
				});
			});

			server.listen(port, this._options.host, () => {
				this._server = server;
				this._isRunning = true;
				this._url = `http://${this._options.host === "0.0.0.0" ? "localhost" : this._options.host}:${port}`;

				resolve({
					instanceId: this._options.instanceId,
					token: this._options.token,
					url: this._url,
				});
			});

			server.on("error", reject);
		});
	}

	stop(): Promise<void> {
		this._tunnel?.stop();
		this._tunnel = undefined;

		// Close all WebSocket connections
		for (const [, client] of this._clients) {
			client.ws.close(1001, "Server shutting down");
		}
		this._clients.clear();

		return new Promise((resolve) => {
			if (this._wss) {
				this._wss.close();
				this._wss = undefined;
			}
			if (this._server) {
				this._server.close(() => {
					this._isRunning = false;
					this._server = undefined;
					resolve();
				});
			} else {
				this._isRunning = false;
				resolve();
			}
		});
	}

	setTunnel(tunnel: TunnelInfo): void {
		this._tunnel = tunnel;
	}

	get tunnelUrl(): string | undefined {
		return this._tunnel?.publicUrl;
	}

	private _findFreePort(startPort: number): Promise<number> {
		return new Promise((resolve) => {
			const server = createServer();
			server.listen(startPort, () => {
				server.close(() => resolve(startPort));
			});
			server.on("error", () => {
				resolve(this._findFreePort(startPort + 1));
			});
		});
	}
}

export function createPiWebServer(options?: PiWebServerOptions): PiWebServer {
	return new PiWebServer(options);
}
