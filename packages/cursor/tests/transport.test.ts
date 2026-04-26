

const http2Mocks = vi.hoisted(() => {
	const sessions: any[] = [];
	const constants = { HTTP2_METHOD_POST: "POST" };

	class MiniEmitter {
		private listeners = new Map<string, ((...args: any[]) => void)[]>();
		on(event: string, handler: (...args: any[]) => void) {
			const list = this.listeners.get(event) ?? [];
			list.push(handler);
			this.listeners.set(event, list);
			return this;
		}
		emit(event: string, ...args: any[]) {
			for (const handler of this.listeners.get(event) ?? []) {
				handler(...args);
			}
			return true;
		}
		removeAllListeners() {
			this.listeners.clear();
			return this;
		}
	}

	class FakeRequest extends MiniEmitter {
		closed = false;
		destroyed = false;
		endedWith: Buffer | undefined;
		writes: Buffer[] = [];
		end(data?: Buffer) {
			this.endedWith = data;
		}
		write(data: Buffer) {
			this.writes.push(data);
		}
		close() {
			this.closed = true;
		}
	}

	class FakeSession extends MiniEmitter {
		closed = false;
		destroyed = false;
		requestHeaders: any;
		requestInstance = new FakeRequest();
		request(headers: any) {
			this.requestHeaders = headers;
			return this.requestInstance;
		}
		close() {
			this.closed = true;
		}
		destroy() {
			this.destroyed = true;
		}
	}

	const connect = vi.fn(() => {
		const session = new FakeSession();
		sessions.push(session);
		return session;
	});

	return { FakeRequest, FakeSession, connect, constants, sessions };
});

vi.mock<typeof import('node:http2')>(import('node:http2'), () => ({
	connect: http2Mocks.connect,
	constants: http2Mocks.constants,
	default: { connect: http2Mocks.connect },
}));

import {
	callCursorUnaryRpc,
	createConnectFrameParser,
	CursorStreamingConnection,
	decodeConnectUnaryBody,
	frameConnectMessage,
	parseConnectEndStream,
} from "../transport.js";

afterEach(() => {
	http2Mocks.sessions.length = 0;
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("cursor transport helpers", () => {
	it("frames and decodes Connect unary messages", () => {
		const payload = new Uint8Array([1, 2, 3]);
		const framed = frameConnectMessage(payload);
		expect(framed.subarray(5)).toStrictEqual(Buffer.from(payload));
		expect(decodeConnectUnaryBody(framed)).toStrictEqual(Buffer.from(payload));
		expect(decodeConnectUnaryBody(new Uint8Array([0, 1]))).toBeNull();
		expect(decodeConnectUnaryBody(Buffer.from([1, 0, 0, 0, 1, 9]))).toBeNull();
	});

	it("parses Connect end streams and incremental frame chunks", () => {
		expect(
			parseConnectEndStream(new TextEncoder().encode('{"error":{"code":"denied","message":"Nope"}}'))?.message,
		).toBe("Connect error denied: Nope");
		expect(parseConnectEndStream(new TextEncoder().encode("not-json"))?.message).toBe(
			"Failed to parse Connect end stream",
		);

		const messages: Uint8Array[] = [];
		const ends: Uint8Array[] = [];
		const parser = createConnectFrameParser(
			(bytes) => messages.push(bytes),
			(bytes) => ends.push(bytes),
		);
		const regular = frameConnectMessage(new Uint8Array([1, 2]));
		const endStream = Buffer.from(frameConnectMessage(new Uint8Array([3, 4])));
		endStream[0] = 0b0000_0010;

		parser(Buffer.concat([regular.subarray(0, 3), regular.subarray(3), endStream]));
		expect(messages).toStrictEqual([Buffer.from([1, 2])]);
		expect(ends).toStrictEqual([Buffer.from([3, 4])]);
	});

	it("executes unary RPCs and surfaces HTTP and timeout failures", async () => {
		const successPromise = callCursorUnaryRpc({
			accessToken: "token",
			requestBody: new Uint8Array([9, 8]),
			rpcPath: "/rpc",
			timeoutMs: 50,
			url: "https://cursor.test",
		});
		const successSession = http2Mocks.sessions[0];
		successSession.requestInstance.emit("response", { ":status": 200 });
		successSession.requestInstance.emit("data", Buffer.from([1, 2, 3]));
		successSession.requestInstance.emit("end");
		await expect(successPromise).resolves.toStrictEqual(new Uint8Array([1, 2, 3]));
		expect(successSession.requestHeaders.authorization).toBe("Bearer token");
		expect(successSession.requestInstance.endedWith).toStrictEqual(Buffer.from([9, 8]));

		const errorPromise = callCursorUnaryRpc({
			accessToken: "token",
			requestBody: new Uint8Array([1]),
			rpcPath: "/rpc",
			timeoutMs: 50,
			url: "https://cursor.test",
		});
		const errorSession = http2Mocks.sessions[1];
		errorSession.requestInstance.emit("response", { ":status": 500 });
		errorSession.requestInstance.emit("data", Buffer.from("boom"));
		errorSession.requestInstance.emit("end");
		await expect(errorPromise).rejects.toThrow("Cursor RPC /rpc failed (500): boom");

		vi.useFakeTimers();
		const timeoutPromise = callCursorUnaryRpc({
			accessToken: "token",
			requestBody: new Uint8Array([1]),
			rpcPath: "/rpc",
			timeoutMs: 25,
			url: "https://cursor.test",
		});
		const timeoutRejection = expect(timeoutPromise).rejects.toThrow("Cursor unary RPC timed out after 25ms");
		await vi.advanceTimersByTimeAsync(25);
		await timeoutRejection;
	});

	it("streams data, connect frames, heartbeats, and close events", async () => {
		const connection = new CursorStreamingConnection({
			accessToken: "token",
			rpcPath: "/stream",
			url: "https://cursor.test",
		});
		const session = http2Mocks.sessions.at(-1);
		const stream = session.requestInstance;
		const chunks: Buffer[] = [];
		const endFrames: Uint8Array[] = [];
		const closes: number[] = [];
		const errors: string[] = [];

		stream.emit("response", { ":status": 200 });
		stream.emit("data", Buffer.from([7, 8]));
		connection.setHandlers({
			onClose: (code) => closes.push(code),
			onData: (chunk) => chunks.push(chunk),
			onError: (error) => errors.push(error.message),
		});
		expect(chunks).toStrictEqual([Buffer.from([7, 8])]);

		connection.setConnectParser(
			(bytes) => chunks.push(Buffer.from(bytes)),
			(bytes) => endFrames.push(bytes),
		);
		const endStream = Buffer.from(frameConnectMessage(new Uint8Array([5, 6])));
		endStream[0] = 0b0000_0010;
		stream.emit("data", endStream);
		expect(endFrames).toStrictEqual([Buffer.from([5, 6])]);

		vi.useFakeTimers();
		connection.startHeartbeat(() => new Uint8Array([9]));
		await vi.advanceTimersByTimeAsync(5000);
		expect(stream.writes).toContainEqual(Buffer.from([9]));
		connection.stopHeartbeat();

		connection.write(new Uint8Array([1, 2]));
		connection.end();
		expect(stream.writes).toContainEqual(Buffer.from([1, 2]));
		expect(connection.isAlive()).toBeTruthy();

		stream.emit("error", new Error("stream failed"));
		expect(errors).toContain("stream failed");
		expect(closes).toContain(1);
		expect(connection.isAlive()).toBeFalsy();

		connection.clearHandlers();
		connection.close();
	});
});
