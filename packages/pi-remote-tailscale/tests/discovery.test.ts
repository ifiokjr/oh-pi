import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDiscoveryService, renderDiscoveryHtml, startDiscoveryHttpServer } from "../src/discovery.js";

async function createTempDir(): Promise<string> {
	return mkdtemp(join(tmpdir(), "pi-remote-tailscale-discovery-"));
}

afterEach(() => {
	// No global mocks to reset.
});

describe("discovery service", () => {
	it("registers, updates, lists, and unregisters records", async () => {
		let now = 1_000;
		const directory = await createTempDir();
		const service = createDiscoveryService({
			directory,
			now: () => now,
			ttlMs: 100,
		});

		const first = await service.register({
			connectUrl: "https://pi-remote.dev/?host=https%3A%2F%2Fpi.tailnet.ts.net%2Fpi%2Ffox-42%2F&t=redacted",
			cwd: "/workspace/one",
			instanceId: "fox-42",
			lanUrl: "http://192.168.1.20:3100/?t=redacted",
			localUrl: "http://localhost:3100/?t=redacted",
			pid: 123,
			tunnelUrl: "https://pi.tailnet.ts.net/pi/fox-42/",
		});
		expect(first.id).toBe("fox-42-123");
		expect(first.startedAt).toBe(1_000);

		now = 1_050;
		const updated = await service.heartbeat(first.id, {
			cwd: "/workspace/two",
		});
		expect(updated?.cwd).toBe("/workspace/two");
		expect(updated?.startedAt).toBe(1_000);
		expect(updated?.lastSeenAt).toBe(1_050);

		const second = await service.register({
			connectUrl: "http://localhost:4100/?t=redacted",
			cwd: "/workspace/three",
			id: "custom-id",
			instanceId: "owl-77",
			localUrl: "http://localhost:4100/?t=redacted",
			pid: 456,
			remoteMode: true,
			startedAt: 900,
		});
		expect(second.id).toBe("custom-id");

		const listed = await service.list();
		expect(listed.map((record) => record.id)).toEqual(["custom-id", "fox-42-123"]);
		expect(await service.get(first.id)).toEqual(updated);

		await service.unregister(second.id);
		expect(await service.get(second.id)).toBeUndefined();
	});

	it("ignores malformed discovery files and prunes stale records", async () => {
		let now = 100;
		const directory = await createTempDir();
		const service = createDiscoveryService({
			directory,
			now: () => now,
			ttlMs: 10,
		});
		await service.register({
			cwd: "/workspace",
			instanceId: "bear-20",
			localUrl: "http://localhost:3000",
			pid: 7,
		});
		await writeFile(join(directory, "broken.json"), "{not json", "utf8");

		now = 200;
		expect(await service.prune()).toEqual(["bear-20-7"]);
		expect(await service.list()).toEqual([]);
		expect(await service.heartbeat("missing-id")).toBeUndefined();
	});
});

describe("discovery rendering", () => {
	it("renders empty and populated discovery pages", () => {
		expect(renderDiscoveryHtml([])).toContain("No active remote sessions.");
		expect(
			renderDiscoveryHtml([
				{
					connectUrl: "https://pi-remote.dev/?host=https%3A%2F%2Fpi.tailnet.ts.net%2Fpi%2Ffox-42%2F&t=redacted",
					cwd: "/workspace/one",
					id: "fox-42-1",
					instanceId: "fox-42",
					lastSeenAt: 1,
					pid: 1,
					remoteMode: true,
					startedAt: 1,
					tunnelUrl: "https://pi.tailnet.ts.net/pi/fox-42/",
				},
				{
					cwd: "/workspace/two",
					id: "owl-1",
					instanceId: "owl-1",
					lanUrl: "http://192.168.1.20:3100/?t=redacted",
					lastSeenAt: 2,
					pid: 2,
					startedAt: 2,
				},
				{
					cwd: "/workspace/three",
					id: "lynx-1",
					instanceId: "lynx-1",
					lastSeenAt: 3,
					localUrl: "http://localhost:4100/?t=redacted",
					pid: 3,
					startedAt: 3,
				},
				{
					cwd: "/workspace/four",
					id: "hare-1",
					instanceId: "hare-1",
					lastSeenAt: 4,
					pid: 4,
					startedAt: 4,
				},
			]),
		).toContain("unavailable");
	});

	it("serves discovery html and json over HTTP", async () => {
		const service = {
			list: async () => [
				{
					connectUrl: "http://localhost:4100/?t=redacted",
					cwd: "/workspace/http",
					id: "http-1",
					instanceId: "http-1",
					lastSeenAt: 1,
					pid: 88,
					startedAt: 1,
				},
			],
		};

		const server = await startDiscoveryHttpServer(service as never, {
			host: "127.0.0.1",
			port: 0,
		});
		try {
			const html = await fetch(`http://${server.host}:${server.port}/`);
			expect(html.status).toBe(200);
			expect(await html.text()).toContain("Active pi remote sessions");

			const json = await fetch(`http://${server.host}:${server.port}/sessions.json`);
			expect(json.status).toBe(200);
			expect(await json.json()).toEqual({ sessions: await service.list() });
		} finally {
			await server.stop();
		}

		const defaultServer = await startDiscoveryHttpServer(service as never, {
			port: 0,
		});
		try {
			const listener = defaultServer.server.listeners("request")[0] as (
				request: { url?: string },
				response: {
					writeHead: (status: number, headers: Record<string, string>) => void;
					end: (body: string) => void;
				},
			) => Promise<void>;
			const response = {
				end: vi.fn(),
				writeHead: vi.fn(),
			};
			await listener({}, response);
			expect(response.writeHead).toHaveBeenCalledWith(200, {
				"content-type": "text/html; charset=utf-8",
			});
			expect(response.end).toHaveBeenCalledWith(expect.stringContaining("Active pi remote sessions"));
		} finally {
			await defaultServer.stop();
		}
	});
});
