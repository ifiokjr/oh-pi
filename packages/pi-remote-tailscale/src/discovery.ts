import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_DISCOVERY_TTL_MS = 60_000;
const DEFAULT_DISCOVERY_DIR = join(tmpdir(), "pi-remote-tailscale", "discovery");

export interface DiscoveryRecord {
	id: string;
	instanceId: string;
	cwd: string;
	pid: number;
	startedAt: number;
	lastSeenAt: number;
	connectUrl?: string;
	localUrl?: string;
	lanUrl?: string;
	tunnelUrl?: string;
	remoteMode?: boolean;
}

export interface DiscoveryServiceOptions {
	directory?: string;
	now?: () => number;
	ttlMs?: number;
}

function escapeHtml(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function safeJsonParse(text: string): DiscoveryRecord | undefined {
	try {
		return JSON.parse(text) as DiscoveryRecord;
	} catch {
		return undefined;
	}
}

export class DiscoveryService {
	private readonly directory: string;
	private readonly now: () => number;
	private readonly ttlMs: number;

	constructor(options: DiscoveryServiceOptions = {}) {
		this.directory = options.directory ?? DEFAULT_DISCOVERY_DIR;
		this.now = options.now ?? Date.now;
		this.ttlMs = options.ttlMs ?? DEFAULT_DISCOVERY_TTL_MS;
	}

	async register(
		record: Omit<DiscoveryRecord, "id" | "startedAt" | "lastSeenAt"> &
			Partial<Pick<DiscoveryRecord, "id" | "startedAt">>,
	): Promise<DiscoveryRecord> {
		await mkdir(this.directory, { recursive: true });
		const now = this.now();
		const nextRecord: DiscoveryRecord = {
			...record,
			id: record.id ?? `${record.instanceId}-${record.pid}`,
			lastSeenAt: now,
			startedAt: record.startedAt ?? now,
		};
		await writeFile(this.filePath(nextRecord.id), `${JSON.stringify(nextRecord, null, 2)}\n`, "utf8");
		return nextRecord;
	}

	async get(id: string): Promise<DiscoveryRecord | undefined> {
		try {
			const content = await readFile(this.filePath(id), "utf8");
			return safeJsonParse(content);
		} catch {
			return undefined;
		}
	}

	async heartbeat(id: string, patch: Partial<Omit<DiscoveryRecord, "id">> = {}): Promise<DiscoveryRecord | undefined> {
		const existing = await this.get(id);
		if (!existing) {
			return undefined;
		}

		return this.register({
			...existing,
			...patch,
			id,
			startedAt: existing.startedAt,
		});
	}

	async list(): Promise<DiscoveryRecord[]> {
		await mkdir(this.directory, { recursive: true });
		const names = await readdir(this.directory);
		const records: DiscoveryRecord[] = [];

		for (const name of names) {
			if (!name.endsWith(".json")) {
				continue;
			}

			const content = await readFile(join(this.directory, name), "utf8").catch(() => {});
			if (!content) {
				continue;
			}

			const parsed = safeJsonParse(content);
			if (parsed) {
				records.push(parsed);
			}
		}

		records.sort((left, right) => right.lastSeenAt - left.lastSeenAt);
		return records;
	}

	async prune(): Promise<string[]> {
		const now = this.now();
		const staleIds: string[] = [];

		for (const record of await this.list()) {
			if (now - record.lastSeenAt > this.ttlMs) {
				staleIds.push(record.id);
			}
		}

		for (const id of staleIds) {
			await this.unregister(id);
		}

		return staleIds;
	}

	async unregister(id: string): Promise<void> {
		await rm(this.filePath(id), { force: true });
	}

	private filePath(id: string): string {
		return join(this.directory, `${id}.json`);
	}
}

export function createDiscoveryService(options: DiscoveryServiceOptions = {}): DiscoveryService {
	return new DiscoveryService(options);
}

export function renderDiscoveryHtml(records: DiscoveryRecord[]): string {
	const cards =
		records.length === 0
			? '<div class="empty">No active remote sessions.</div>'
			: records
					.map((record) => {
						const badges = [
							record.remoteMode ? '<span class="badge">child mode</span>' : '<span class="badge">direct</span>',
							record.tunnelUrl ? '<span class="badge">tailscale</span>' : "",
						]
							.filter(Boolean)
							.join("");

						return `
							<article class="card">
								<header>
									<h2>${escapeHtml(record.instanceId)}</h2>
									<div class="badges">${badges}</div>
								</header>
								<p><strong>CWD:</strong> ${escapeHtml(record.cwd)}</p>
								<p><strong>PID:</strong> ${record.pid}</p>
								<p><strong>Connect:</strong> ${escapeHtml(record.connectUrl ?? record.tunnelUrl ?? record.lanUrl ?? record.localUrl ?? "unavailable")}</p>
							</article>
						`;
					})
					.join("\n");

	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>pi remote discovery</title>
		<style>
			:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
			body { margin: 0; background: #0f172a; color: #e2e8f0; }
			main { max-width: 960px; margin: 0 auto; padding: 32px 20px 56px; }
			h1 { margin: 0 0 8px; font-size: 28px; }
			p.lead { margin: 0 0 24px; color: #94a3b8; }
			.grid { display: grid; gap: 16px; }
			.card, .empty { border: 1px solid #334155; border-radius: 16px; padding: 18px; background: #111827; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.35); }
			.badges { display: flex; gap: 8px; flex-wrap: wrap; }
			.badge { border-radius: 999px; padding: 3px 10px; background: #1d4ed8; font-size: 12px; }
			header { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
			article p { margin: 8px 0 0; word-break: break-word; }
		</style>
	</head>
	<body>
		<main>
			<h1>Active pi remote sessions</h1>
			<p class="lead">Discovery metadata is local-only and never includes auth tokens.</p>
			<section class="grid">${cards}</section>
		</main>
	</body>
</html>`;
}

export async function startDiscoveryHttpServer(
	service: Pick<DiscoveryService, "list">,
	options: { host?: string; port?: number } = {},
): Promise<{ host: string; port: number; server: Server; stop: () => Promise<void> }> {
	const host = options.host ?? "127.0.0.1";
	const port = options.port ?? 7008;
	const server = createServer(async (request, response) => {
		const url = new URL(request.url ?? "/", `http://${host}:${port}`);
		const records = await service.list();

		if (url.pathname === "/sessions.json") {
			response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
			response.end(JSON.stringify({ sessions: records }));
			return;
		}

		response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
		response.end(renderDiscoveryHtml(records));
	});

	await new Promise<void>((resolve, reject) => {
		server.listen(port, host, () => resolve());
		server.once("error", reject);
	});

	const address = server.address();
	/* V8 ignore next -- Node returns an object for bound TCP listeners in this package. */
	const resolvedPort = typeof address === "object" && address ? address.port : port;

	return {
		host,
		port: resolvedPort,
		server,
		stop: async () => {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}
					resolve();
				});
			});
		},
	};
}
