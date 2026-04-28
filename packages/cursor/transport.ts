import { randomUUID } from "node:crypto";
import http2, { constants } from "node:http2";
import type { ClientHttp2Session, ClientHttp2Stream, IncomingHttpHeaders } from "node:http2";
import { CURSOR_HEARTBEAT_MS, getCursorRuntimeConfig } from "./config.js";

const CONNECT_END_STREAM_FLAG = 0b0000_0010;

export function frameConnectMessage(data: Uint8Array): Buffer {
	const frame = Buffer.alloc(5 + data.length);
	frame[0] = 0;
	frame.writeUInt32BE(data.length, 1);
	frame.set(data, 5);
	return frame;
}

export function decodeConnectUnaryBody(payload: Uint8Array): Uint8Array | null {
	if (payload.length < 5) {
		return null;
	}

	let offset = 0;
	while (offset + 5 <= payload.length) {
		const flags = payload[offset] ?? 0;
		const view = new DataView(payload.buffer, payload.byteOffset + offset, payload.byteLength - offset);
		const messageLength = view.getUint32(1, false);
		const frameEnd = offset + 5 + messageLength;
		if (frameEnd > payload.length) {
			return null;
		}
		if ((flags & 0b0000_0001) !== 0) {
			return null;
		}
		if ((flags & CONNECT_END_STREAM_FLAG) === 0) {
			return payload.subarray(offset + 5, frameEnd);
		}
		offset = frameEnd;
	}

	return null;
}

export function parseConnectEndStream(data: Uint8Array): Error | null {
	try {
		const payload = JSON.parse(new TextDecoder().decode(data)) as {
			error?: { code?: string; message?: string };
		};
		if (!payload.error) {
			return null;
		}
		const code = payload.error.code ?? "unknown";
		const message = payload.error.message ?? "Unknown error";
		return new Error(`Connect error ${code}: ${message}`);
	} catch {
		return new Error("Failed to parse Connect end stream");
	}
}

export function createConnectFrameParser(
	onMessage: (bytes: Uint8Array) => void,
	onEndStream: (bytes: Uint8Array) => void,
): (incoming: Buffer) => void {
	let pending = Buffer.alloc(0);
	return (incoming: Buffer) => {
		pending = Buffer.concat([pending, incoming]);
		while (pending.length >= 5) {
			const flags = pending[0] ?? 0;
			const msgLen = pending.readUInt32BE(1);
			if (pending.length < 5 + msgLen) {
				break;
			}
			const messageBytes = pending.subarray(5, 5 + msgLen);
			pending = pending.subarray(5 + msgLen);
			if ((flags & CONNECT_END_STREAM_FLAG) !== 0) {
				onEndStream(messageBytes);
			} else {
				onMessage(messageBytes);
			}
		}
	};
}

function createBaseHeaders(accessToken: string, contentType: string, rpcPath: string): http2.OutgoingHttpHeaders {
	const config = getCursorRuntimeConfig();
	return {
		":method": constants.HTTP2_METHOD_POST,
		":path": rpcPath,
		authorization: `Bearer ${accessToken}`,
		"content-type": contentType,
		te: "trailers",
		"x-cursor-client-type": "cli",
		"x-cursor-client-version": config.clientVersion,
		"x-ghost-mode": "true",
		"x-request-id": randomUUID(),
	};
}

function normalizeHttp2ErrorBody(chunks: Buffer[]): string {
	if (chunks.length === 0) {
		return "no body";
	}
	return Buffer.concat(chunks).toString("utf8").trim() || "empty body";
}

export async function callCursorUnaryRpc(options: {
	accessToken: string;
	rpcPath: string;
	requestBody: Uint8Array;
	url?: string;
	timeoutMs?: number;
}): Promise<Uint8Array> {
	const origin = options.url ?? getCursorRuntimeConfig().apiUrl;
	const session = http2.connect(origin);
	const request = session.request(createBaseHeaders(options.accessToken, "application/proto", options.rpcPath));
	const chunks: Buffer[] = [];
	const errorChunks: Buffer[] = [];
	let status = 0;

	const resultPromise = new Promise<Uint8Array>((resolve, reject) => {
		const timeout = setTimeout(() => {
			request.close();
			session.close();
			reject(new Error(`Cursor unary RPC timed out after ${options.timeoutMs ?? 5000}ms`));
		}, options.timeoutMs ?? 5000);

		const cleanup = () => {
			clearTimeout(timeout);
			request.removeAllListeners();
			session.removeAllListeners();
		};

		request.on("response", (headers: IncomingHttpHeaders) => {
			status = Number(headers[":status"] ?? 0);
		});
		request.on("data", (chunk: Buffer) => {
			(status >= 400 ? errorChunks : chunks).push(Buffer.from(chunk));
		});
		request.on("end", () => {
			cleanup();
			request.close();
			session.close();
			if (status >= 400) {
				reject(new Error(`Cursor RPC ${options.rpcPath} failed (${status}): ${normalizeHttp2ErrorBody(errorChunks)}`));
				return;
			}
			resolve(new Uint8Array(Buffer.concat(chunks)));
		});
		request.on("error", (error) => {
			cleanup();
			request.close();
			session.destroy();
			reject(error);
		});
		session.on("error", (error) => {
			cleanup();
			request.close();
			session.destroy();
			reject(error);
		});
	});

	request.end(Buffer.from(options.requestBody));
	return await resultPromise;
}

export class CursorStreamingConnection {
	private readonly session: ClientHttp2Session;
	private readonly stream: ClientHttp2Stream;
	private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
	private dataHandler: ((chunk: Buffer) => void) | undefined;
	private endStreamHandler: ((chunk: Uint8Array) => void) | undefined;
	private closeHandler: ((code: number) => void) | undefined;
	private errorHandler: ((error: Error) => void) | undefined;
	private status = 0;
	private ended = false;
	private closed = false;
	private closeCode = 0;
	private pendingChunks: Buffer[] = [];
	private readonly errorChunks: Buffer[] = [];

	constructor(options: { accessToken: string; rpcPath: string; url?: string }) {
		const origin = options.url ?? getCursorRuntimeConfig().apiUrl;
		this.session = http2.connect(origin);
		this.stream = this.session.request({
			...createBaseHeaders(options.accessToken, "application/connect+proto", options.rpcPath),
			"connect-protocol-version": "1",
		});

		this.stream.on("response", (headers: IncomingHttpHeaders) => {
			this.status = Number(headers[":status"] ?? 0);
		});
		this.stream.on("data", (chunk: Buffer) => {
			const buffer = Buffer.from(chunk);
			if (this.status >= 400) {
				this.errorChunks.push(buffer);
				return;
			}
			if (this.dataHandler) {
				this.dataHandler(buffer);
			} else {
				this.pendingChunks.push(buffer);
			}
		});
		this.stream.on("end", () => {
			this.ended = true;
			if (this.status >= 400) {
				this.errorHandler?.(
					new Error(`Cursor stream failed (${this.status}): ${normalizeHttp2ErrorBody(this.errorChunks)}`),
				);
			}
			this.finish(this.status >= 400 ? 1 : 0);
		});
		this.stream.on("close", () => {
			this.finish(this.status >= 400 ? 1 : 0);
		});
		this.stream.on("error", (error) => {
			this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
			this.finish(1);
		});
		this.session.on("error", (error) => {
			this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
			this.finish(1);
		});
	}

	startHeartbeat(createFrame: () => Uint8Array): void {
		this.stopHeartbeat();
		this.heartbeatTimer = setInterval(() => {
			if (!this.isAlive()) {
				this.stopHeartbeat();
				return;
			}
			this.write(createFrame());
		}, CURSOR_HEARTBEAT_MS);
	}

	stopHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = undefined;
		}
	}

	setHandlers(handlers: {
		onData?: (chunk: Buffer) => void;
		onEndStream?: (chunk: Uint8Array) => void;
		onClose?: (code: number) => void;
		onError?: (error: Error) => void;
	}): void {
		if (handlers.onData) {
			this.dataHandler = handlers.onData;
			for (const chunk of this.pendingChunks.splice(0)) {
				this.dataHandler(chunk);
			}
		}
		if (handlers.onEndStream) {
			this.endStreamHandler = handlers.onEndStream;
		}
		if (handlers.onClose) {
			this.closeHandler = handlers.onClose;
			if (this.closed) {
				queueMicrotask(() => handlers.onClose?.(this.closeCode));
			}
		}
		if (handlers.onError) {
			this.errorHandler = handlers.onError;
		}
	}

	clearHandlers(): void {
		this.dataHandler = undefined;
		this.endStreamHandler = undefined;
		this.closeHandler = undefined;
		this.errorHandler = undefined;
	}

	setConnectParser(onMessage: (bytes: Uint8Array) => void, onEndStream: (bytes: Uint8Array) => void): void {
		const parser = createConnectFrameParser(onMessage, (bytes) => {
			onEndStream(bytes);
			this.endStreamHandler?.(bytes);
		});
		this.dataHandler = parser;
	}

	write(data: Uint8Array): void {
		if (!this.isAlive()) {
			return;
		}
		this.stream.write(Buffer.from(data));
	}

	end(): void {
		if (!this.isAlive()) {
			return;
		}
		this.stream.end();
	}

	close(): void {
		this.finish(this.status >= 400 ? 1 : 0);
	}

	isAlive(): boolean {
		return !this.closed && !this.stream.closed && !this.stream.destroyed;
	}

	private finish(code: number): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		this.closeCode = code;
		this.stopHeartbeat();
		try {
			if (!this.ended && !this.stream.closed && !this.stream.destroyed) {
				this.stream.close();
			}
		} catch {
			// Ignore
		}
		try {
			if (!this.session.closed && !this.session.destroyed) {
				this.session.close();
			}
		} catch {
			// Ignore
		}
		this.closeHandler?.(code);
	}
}
