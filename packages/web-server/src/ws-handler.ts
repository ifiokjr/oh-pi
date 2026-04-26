import type { WebSocket } from "ws";
import { validateToken } from "./token.js";

export interface WsSession {
	ws: WebSocket;
	clientId: string;
	authenticated: boolean;
}

export interface WsHandlerOptions {
	token: string;
	instanceId: string;
	getSession: () => AgentSessionLike | undefined;
	onClientConnect?: (clientId: string) => void;
	onClientDisconnect?: (clientId: string) => void;
}

// Minimal interface for AgentSession — avoids hard dependency on pi types at the module level
export interface AgentSessionLike {
	prompt(text: string, options?: { streamingBehavior?: "steer" | "followUp" }): Promise<void>;
	steer(text: string): Promise<void>;
	followUp(text: string): Promise<void>;
	abort(): Promise<void>;
	compact(instructions?: string): Promise<unknown>;
	setModel(model: unknown): Promise<boolean>;
	setThinkingLevel(level: string): void;
	subscribe(listener: (event: unknown) => void): () => void;
	isStreaming: boolean;
	messages: unknown[];
	model: unknown | undefined;
	thinkingLevel: string;
	sessionId: string;
	sessionFile: string | undefined;
	agent: { state: { systemPrompt: string; tools: unknown[] } };
	newSession(options?: { parentSession?: string }): Promise<{ cancelled: boolean }>;
}

let clientCounter = 0;

export function handleWebSocketConnection(ws: WebSocket, options: WsHandlerOptions): WsSession {
	const clientId = `client-${++clientCounter}`;
	const session: WsSession = { authenticated: false, clientId, ws };

	let unsubscribeEvents: (() => void) | undefined;

	const send = (data: unknown) => {
		if (ws.readyState === ws.OPEN) {
			ws.send(JSON.stringify(data));
		}
	};

	// Biome-ignore lint/complexity/noExcessiveCognitiveComplexity: protocol handling branches by auth state and command type.
	ws.on("message", async (raw) => {
		let msg: Record<string, unknown>;
		try {
			msg = JSON.parse(raw.toString());
		} catch {
			send({ error: "Invalid JSON", type: "error" });
			return;
		}

		// Auth handshake — must be first message
		if (!session.authenticated) {
			if (msg.type === "auth" && typeof msg.token === "string") {
				if (validateToken(msg.token, options.token)) {
					session.authenticated = true;

					// Subscribe to agent events and relay to this client
					const agentSession = options.getSession();

					if (agentSession) {
						unsubscribeEvents = agentSession.subscribe((event: unknown) => {
							send(event);
						});
					}

					send({
						instanceId: options.instanceId,
						session: agentSession
							? {
									sessionId: agentSession.sessionId,
									isStreaming: agentSession.isStreaming,
									model: agentSession.model,
									thinkingLevel: agentSession.thinkingLevel,
								}
							: null,
						type: "auth_ok",
					});
					options.onClientConnect?.(clientId);
				} else {
					send({ reason: "invalid_token", type: "auth_error" });
					ws.close(4001, "Invalid token");
				}
			} else {
				send({ reason: "auth_required", type: "auth_error" });
				ws.close(4001, "Auth required");
			}
			return;
		}

		// Authenticated — dispatch RPC commands
		const agentSession = options.getSession();

		if (!agentSession) {
			send({ command: msg.type, error: "No session attached", id: msg.id, success: false, type: "response" });
			return;
		}

		try {
			await dispatchCommand(msg, agentSession, send);
		} catch (error) {
			send({
				type: "response",
				command: msg.type,
				success: false,
				error: error instanceof Error ? error.message : String(error),
				id: msg.id,
			});
		}
	});

	ws.on("close", () => {
		unsubscribeEvents?.();
		if (session.authenticated) {
			options.onClientDisconnect?.(clientId);
		}
	});

	ws.on("error", () => {
		unsubscribeEvents?.();
	});

	return session;
}

async function dispatchCommand(
	msg: Record<string, unknown>,
	agentSession: AgentSessionLike,
	send: (data: unknown) => void,
): Promise<void> {
	const { id } = msg;
	const respond = (data: Record<string, unknown>) => send({ type: "response", ...data, id });

	switch (msg.type) {
		case "prompt": {
			const message = msg.message as string;
			const streamingBehavior = msg.streamingBehavior as "steer" | "followUp" | undefined;

			if (agentSession.isStreaming && streamingBehavior) {
				await agentSession.prompt(message, { streamingBehavior });
			} else {
				await agentSession.prompt(message);
			}
			respond({ command: "prompt", success: true });
			break;
		}

		case "steer": {
			await agentSession.steer(msg.message as string);
			respond({ command: "steer", success: true });
			break;
		}

		case "follow_up": {
			await agentSession.followUp(msg.message as string);
			respond({ command: "follow_up", success: true });
			break;
		}

		case "abort": {
			await agentSession.abort();
			respond({ command: "abort", success: true });
			break;
		}

		case "get_state": {
			respond({
				command: "get_state",
				data: {
					isStreaming: agentSession.isStreaming,
					messageCount: agentSession.messages.length,
					model: agentSession.model,
					sessionFile: agentSession.sessionFile,
					sessionId: agentSession.sessionId,
					thinkingLevel: agentSession.thinkingLevel,
				},
				success: true,
			});
			break;
		}

		case "get_messages": {
			respond({
				command: "get_messages",
				data: { messages: agentSession.messages },
				success: true,
			});
			break;
		}

		case "set_thinking_level": {
			agentSession.setThinkingLevel(msg.level as string);
			respond({ command: "set_thinking_level", success: true });
			break;
		}

		case "compact": {
			const result = await agentSession.compact(msg.customInstructions as string | undefined);
			respond({ command: "compact", data: result, success: true });
			break;
		}

		case "new_session": {
			const result = await agentSession.newSession();
			respond({ command: "new_session", data: result, success: true });
			break;
		}

		case "extension_ui_response": {
			// These are relayed back into the session — the session handles them
			// Via its internal extension UI protocol
			break;
		}

		default: {
			respond({ command: msg.type as string, error: `Unknown command: ${msg.type}`, success: false });
		}
	}
}
