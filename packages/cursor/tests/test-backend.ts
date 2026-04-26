import http from "node:http";
import http2 from "node:http2";
import type { AddressInfo } from "node:net";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { AgentClientMessageSchema, AgentServerMessageSchema, GetUsableModelsResponseSchema, ModelDetailsSchema } from '../proto/agent_pb.js';
import type { AgentClientMessage } from '../proto/agent_pb.js';
import { createConnectFrameParser, frameConnectMessage } from "../transport.js";

export interface TestRunConnection {
	requestHeaders: http2.IncomingHttpHeaders;
	messages: AgentClientMessage[];
	sendServerMessage(message: ReturnType<typeof create<typeof AgentServerMessageSchema>>): void;
	waitForClientMessage(
		predicate: (message: AgentClientMessage) => boolean,
		timeoutMs?: number,
	): Promise<AgentClientMessage>;
	end(): void;
}

export interface TestCursorBackend {
	apiUrl: string;
	refreshUrl: string;
	setDiscoveredModels(models: { id: string; name: string; reasoning?: boolean }[]): void;
	setRunHandler(handler: (connection: TestRunConnection) => void | Promise<void>): void;
	getDiscoveryAuthHeaders(): string[];
	close(): Promise<void>;
}

export async function createTestCursorBackend(): Promise<TestCursorBackend> {
	let discoveredModels: { id: string; name: string; reasoning?: boolean }[] = [];
	let runHandler: (connection: TestRunConnection) => void | Promise<void> = () => {};
	const discoveryAuthHeaders: string[] = [];

	const refreshServer = http.createServer((req, res) => {
		if (req.method !== "POST" || req.url !== "/auth/exchange_user_api_key") {
			res.writeHead(404);
			res.end("not found");
			return;
		}
		const authHeader = req.headers.authorization ?? "";
		if (authHeader !== "Bearer valid-refresh") {
			res.writeHead(401, { "Content-Type": "text/plain" });
			res.end("bad refresh token");
			return;
		}
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(
			JSON.stringify({ accessToken: makeJwt(Math.floor(Date.now() / 1000) + 3600), refreshToken: "valid-refresh" }),
		);
	});
	await new Promise<void>((resolve) => refreshServer.listen(0, "127.0.0.1", resolve));
	const refreshPort = (refreshServer.address() as AddressInfo).port;

	const apiServer = http2.createServer();
	apiServer.on("stream", (stream, headers) => {
		const path = String(headers[":path"] ?? "");
		if (path === "/agent.v1.AgentService/GetUsableModels") {
			discoveryAuthHeaders.push(String(headers.authorization ?? ""));
			const payload = toBinary(
				GetUsableModelsResponseSchema,
				create(GetUsableModelsResponseSchema, {
					models: discoveredModels.map((model) =>
						create(ModelDetailsSchema, {
							displayModelId: model.id,
							displayName: model.name,
							displayNameShort: model.name,
							modelId: model.id,
							thinkingDetails: model.reasoning ? {} : undefined,
						}),
					),
				}),
			);
			stream.respond({ ":status": 200, "content-type": "application/proto" });
			stream.end(Buffer.from(payload));
			return;
		}
		if (path !== "/agent.v1.AgentService/Run") {
			stream.respond({ ":status": 404 });
			stream.end();
			return;
		}

		stream.respond({ ":status": 200, "content-type": "application/connect+proto" });
		const messages: AgentClientMessage[] = [];
		const waiters: {
			predicate: (message: AgentClientMessage) => boolean;
			resolve: (message: AgentClientMessage) => void;
			timeout: ReturnType<typeof setTimeout>;
		}[] = [];
		const parser = createConnectFrameParser(
			(payload) => {
				const message = fromBinary(AgentClientMessageSchema, payload);
				messages.push(message);
				for (const waiter of [...waiters]) {
					if (waiter.predicate(message)) {
						clearTimeout(waiter.timeout);
						waiters.splice(waiters.indexOf(waiter), 1);
						waiter.resolve(message);
					}
				}
			},
			() => {},
		);
		stream.on("data", (chunk) => parser(Buffer.from(chunk)));
		const connection: TestRunConnection = {
			end() {
				stream.end();
			},
			messages,
			requestHeaders: headers,
			sendServerMessage(message) {
				stream.write(frameConnectMessage(toBinary(AgentServerMessageSchema, message)));
			},
			waitForClientMessage(predicate, timeoutMs = 1500) {
				const existing = messages.find(predicate);
				if (existing) {
					return Promise.resolve(existing);
				}
				return new Promise<AgentClientMessage>((resolve, reject) => {
					const timeout = setTimeout(() => reject(new Error("Timed out waiting for client message")), timeoutMs);
					waiters.push({ predicate, resolve, timeout });
				});
			},
		};
		void runHandler(connection);
	});
	await new Promise<void>((resolve) => apiServer.listen(0, "127.0.0.1", resolve));
	const apiPort = (apiServer.address() as AddressInfo).port;

	return {
		apiUrl: `http://127.0.0.1:${apiPort}`,
		async close() {
			await Promise.all([
				new Promise<void>((resolve, reject) => refreshServer.close((error) => (error ? reject(error) : resolve()))),
				new Promise<void>((resolve, reject) => apiServer.close((error) => (error ? reject(error) : resolve()))),
			]);
		},
		getDiscoveryAuthHeaders() {
			return [...discoveryAuthHeaders];
		},
		refreshUrl: `http://127.0.0.1:${refreshPort}/auth/exchange_user_api_key`,
		setDiscoveredModels(models) {
			discoveredModels = models;
		},
		setRunHandler(handler) {
			runHandler = handler;
		},
	};
}

function makeJwt(expiresAtSeconds: number): string {
	const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
	const payload = Buffer.from(JSON.stringify({ exp: expiresAtSeconds })).toString("base64url");
	return `${header}.${payload}.fakesig`;
}
