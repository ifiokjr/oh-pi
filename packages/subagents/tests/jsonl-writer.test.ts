import { describe, expect, it } from "vitest";
import { createJsonlWriter, type DrainableSource, type JsonlWriteStream } from "../jsonl-writer.js";

class MockSource implements DrainableSource {
	paused = 0;
	resumed = 0;

	pause(): void {
		this.paused++;
	}

	resume(): void {
		this.resumed++;
	}
}

class MockStream implements JsonlWriteStream {
	writes: string[] = [];
	ended = false;
	private drainHandler?: () => void;
	private readonly writeResults: boolean[];

	constructor(writeResults: boolean[] = []) {
		this.writeResults = writeResults;
	}

	write(chunk: string): boolean {
		this.writes.push(chunk);
		if (this.writeResults.length === 0) {
			return true;
		}
		return this.writeResults.shift() ?? true;
	}

	once(event: "drain", listener: () => void): JsonlWriteStream {
		if (event === "drain") {
			this.drainHandler = listener;
		}
		return this;
	}

	end(callback?: () => void): void {
		this.ended = true;
		callback?.();
	}

	emitDrain(): void {
		this.drainHandler?.();
	}
}

describe("createJsonlWriter", () => {
	it("writes lines with trailing newline", () => {
		const source = new MockSource();
		const stream = new MockStream();
		const writer = createJsonlWriter("/tmp/out.jsonl", source, {
			createWriteStream: () => stream,
		});
		writer.writeLine('{"type":"a"}');
		writer.writeLine('{"type":"b"}');
		expect(stream.writes).toEqual(['{"type":"a"}\n', '{"type":"b"}\n']);
	});

	it("pauses on backpressure and resumes on drain", () => {
		const source = new MockSource();
		const stream = new MockStream([false, true]);
		const writer = createJsonlWriter("/tmp/out.jsonl", source, {
			createWriteStream: () => stream,
		});
		writer.writeLine('{"type":"a"}');
		expect(source.paused).toBe(1);
		expect(source.resumed).toBe(0);
		stream.emitDrain();
		expect(source.resumed).toBe(1);
		writer.writeLine('{"type":"b"}');
		expect(stream.writes).toEqual(['{"type":"a"}\n', '{"type":"b"}\n']);
	});

	it("closes stream once", async () => {
		const source = new MockSource();
		const stream = new MockStream();
		const writer = createJsonlWriter("/tmp/out.jsonl", source, {
			createWriteStream: () => stream,
		});
		await writer.close();
		expect(stream.ended).toBe(true);
		await writer.close();
		expect(stream.ended).toBe(true);
	});

	it("returns no-op writer when file path is undefined", async () => {
		const source = new MockSource();
		const writer = createJsonlWriter(undefined, source);
		writer.writeLine('{"type":"a"}');
		await writer.close();
		expect(source.paused).toBe(0);
		expect(source.resumed).toBe(0);
	});

	it("stops writing when maxBytes is exceeded without pausing source", () => {
		const source = new MockSource();
		const stream = new MockStream();
		const writer = createJsonlWriter("/tmp/out.jsonl", source, {
			createWriteStream: () => stream,
			maxBytes: 30,
		});
		writer.writeLine('{"type":"a"}');
		writer.writeLine('{"type":"b"}');
		writer.writeLine('{"type":"c"}');
		expect(stream.writes).toHaveLength(2);
		expect(stream.writes).toEqual(['{"type":"a"}\n', '{"type":"b"}\n']);
		expect(source.paused).toBe(0);
	});

	it("allows writes up to exactly maxBytes", () => {
		const source = new MockSource();
		const stream = new MockStream();
		const line = '{"x":"a"}';
		const lineBytes = Buffer.byteLength(`${line}\n`, "utf-8");
		const writer = createJsonlWriter("/tmp/out.jsonl", source, {
			createWriteStream: () => stream,
			maxBytes: lineBytes * 2,
		});
		writer.writeLine(line);
		writer.writeLine(line);
		writer.writeLine(line);
		expect(stream.writes).toHaveLength(2);
	});
});
