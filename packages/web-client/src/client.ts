import { ReconnectManager } from "./reconnect.js";
import type {
	AuthOkResponse,
	CommandInfo,
	CompactionResult,
	ConnectionState,
	ExtensionUIResponse,
	InstanceInfo,
	PiWebClientOptions,
	PromptOptions,
	RpcResponse,
	SessionState,
	SessionStats,
	ThinkingLevel,
} from "./types.js";

type Unsubscribe = () => void;
type EventHandler = (event: unknown) => void;

let requestCounter = 0;

export class PiWebClient {
	private _options: PiWebClientOptions;
	private _ws: WebSocket | undefined;
	private _state: ConnectionState = "disconnected";
	private _instanceId: string | undefined;
	private _listeners = new Map<string, Set<EventHandler>>();
	private _pendingRequests = new Map<string, { resolve: (data: unknown) => void; reject: (err: Error) => void }>();
	private _reconnect: ReconnectManager;
	private _webSocketCtor: typeof WebSocket;

	constructor(options: PiWebClientOptions) {
		this._options = options;
		this._reconnect = new ReconnectManager(options.reconnectInterval ?? 1000);
		this._webSocketCtor = (options.webSocket ?? globalThis.WebSocket) as typeof WebSocket;
	}

	get state(): ConnectionState {
		return this._state;
	}

	get instanceId(): string | undefined {
		return this._instanceId;
	}

	connect(): Promise<InstanceInfo> {
		if (this._state === "connected") {
			throw new Error("Already connected");
		}

		this._setState("connecting");

		return new Promise<InstanceInfo>((resolve, reject) => {
			try {
				this._ws = new this._webSocketCtor(this._options.url);
			} catch (error) {
				this._setState("disconnected");
				reject(error instanceof Error ? error : new Error(String(error)));
				return;
			}

			this._ws.onopen = () => {
				this._setState("authenticating");
				this._send({ token: this._options.token, type: "auth" });
			};

			// Biome-ignore lint/complexity/noExcessiveCognitiveComplexity: message handling branches by protocol message type.
			this._ws.onmessage = (event: MessageEvent) => {
				let data: Record<string, unknown>;
				try {
					data = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
				} catch {
					return;
				}

				// Handle auth response
				if (data.type === "auth_ok") {
					const authOk = data as unknown as AuthOkResponse;
					this._instanceId = authOk.instanceId;
					this._setState("connected");
					this._reconnect.reset();

					const info: InstanceInfo = {
						instanceId: authOk.instanceId,
						isStreaming: authOk.session?.isStreaming ?? false,
						model: authOk.session?.model,
						sessionId: authOk.session?.sessionId ?? "",
						thinkingLevel: (authOk.session?.thinkingLevel as ThinkingLevel) ?? "off",
					};
					resolve(info);
					return;
				}

				if (data.type === "auth_error") {
					this._setState("disconnected");
					reject(new Error(`Authentication failed: ${data.reason}`));
					this._ws?.close();
					return;
				}

				// Handle RPC responses (correlated by id)
				if (data.type === "response") {
					const response = data as unknown as RpcResponse;

					if (response.id && this._pendingRequests.has(response.id)) {
						const pending = this._pendingRequests.get(response.id);
						this._pendingRequests.delete(response.id);

						if (!pending) {
							return;
						}

						if (response.success) {
							pending.resolve(response.data);
						} else {
							pending.reject(new Error(response.error ?? "Command failed"));
						}
					}
					return;
				}

				// All other messages are events — dispatch to listeners
				this._emit(data.type as string, data);
			};

			this._ws.onclose = () => {
				const wasConnected = this._state === "connected";
				this._setState("disconnected");

				if (wasConnected && this._options.autoReconnect !== false) {
					this._setState("reconnecting");
					this._reconnect.schedule(() => {
						this.connect().catch(() => {
							// Reconnect will retry via schedule
						});
					});
				}
			};

			this._ws.onerror = () => {
				this._emit("error", new Error("WebSocket error"));
			};
		});
	}

	disconnect(): void {
		this._reconnect.stop();
		this._ws?.close();
		this._ws = undefined;
		this._setState("disconnected");
	}

	// RPC Commands

	async prompt(message: string, options?: PromptOptions): Promise<void> {
		await this._request({
			images: options?.images,
			message,
			streamingBehavior: options?.streamingBehavior,
			type: "prompt",
		});
	}

	async steer(message: string): Promise<void> {
		await this._request({ message, type: "steer" });
	}

	async followUp(message: string): Promise<void> {
		await this._request({ message, type: "follow_up" });
	}

	async abort(): Promise<void> {
		await this._request({ type: "abort" });
	}

	async getState(): Promise<SessionState> {
		return (await this._request({ type: "get_state" })) as SessionState;
	}

	async getMessages(): Promise<unknown[]> {
		const data = (await this._request({ type: "get_messages" })) as {
			messages: unknown[];
		};
		return data.messages;
	}

	async getSessionStats(): Promise<SessionStats> {
		return (await this._request({ type: "get_session_stats" })) as SessionStats;
	}

	async getCommands(): Promise<CommandInfo[]> {
		const data = (await this._request({ type: "get_commands" })) as {
			commands: CommandInfo[];
		};
		return data.commands;
	}

	async setModel(provider: string, modelId: string): Promise<unknown> {
		return await this._request({ modelId, provider, type: "set_model" });
	}

	async getAvailableModels(): Promise<unknown[]> {
		const data = (await this._request({ type: "get_available_models" })) as {
			models: unknown[];
		};
		return data.models;
	}

	async setThinkingLevel(level: ThinkingLevel): Promise<void> {
		await this._request({ level, type: "set_thinking_level" });
	}

	async compact(instructions?: string): Promise<CompactionResult> {
		return (await this._request({
			customInstructions: instructions,
			type: "compact",
		})) as CompactionResult;
	}

	async newSession(): Promise<{ cancelled: boolean }> {
		return (await this._request({ type: "new_session" })) as {
			cancelled: boolean;
		};
	}

	respondToUI(requestId: string, response: Omit<ExtensionUIResponse, "type" | "id">): void {
		this._send({ id: requestId, type: "extension_ui_response", ...response });
	}

	// Event subscription

	on(event: string, handler: EventHandler): Unsubscribe {
		if (!this._listeners.has(event)) {
			this._listeners.set(event, new Set());
		}
		this._listeners.get(event)?.add(handler);
		return () => {
			this._listeners.get(event)?.delete(handler);
		};
	}

	// Internals

	private _send(data: Record<string, unknown>): void {
		if (this._ws?.readyState === 1) {
			// OPEN = 1
			this._ws.send(JSON.stringify(data));
		}
	}

	private _request(cmd: Record<string, unknown>): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const id = `req-${++requestCounter}`;
			this._pendingRequests.set(id, { reject, resolve });
			this._send({ ...cmd, id });

			// Timeout after 30s
			setTimeout(() => {
				if (this._pendingRequests.has(id)) {
					this._pendingRequests.delete(id);
					reject(new Error(`Request timed out: ${cmd.type}`));
				}
			}, 30_000);
		});
	}

	private _setState(state: ConnectionState): void {
		this._state = state;
		this._emit("connection", state);
	}

	private _emit(event: string, data: unknown): void {
		const handlers = this._listeners.get(event);

		if (handlers) {
			for (const handler of handlers) {
				try {
					handler(data);
				} catch {
					// Don't let handler errors break the client
				}
			}
		}
	}
}
