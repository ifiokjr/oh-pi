import http from "node:http";
import type { AddressInfo } from "node:net";

export interface TestOllamaCloudBackend {
	apiUrl: string;
	keysUrl: string;
	setModels(models: Array<{ id: string; capabilities?: string[]; contextWindow?: number }>): void;
	setRejectAuth(reject: boolean): void;
	setRejectedModelShows(modelIds: string[]): void;
	getAuthHeaders(): string[];
	close(): Promise<void>;
}

export async function createTestOllamaCloudBackend(): Promise<TestOllamaCloudBackend> {
	let models: Array<{ id: string; capabilities?: string[]; contextWindow?: number }> = [];
	let rejectAuth = false;
	let rejectedModelShows = new Set<string>();
	const authHeaders: string[] = [];

	const server = http.createServer((req, res) => {
		const url = req.url ?? "/";
		if (url === "/v1/models" && req.method === "GET") {
			const auth = String(req.headers.authorization ?? "");
			authHeaders.push(auth);
			if (rejectAuth) {
				res.writeHead(401, { "Content-Type": "text/plain" });
				res.end("unauthorized");
				return;
			}
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ data: models.map((model) => ({ id: model.id, object: "model" })) }));
			return;
		}

		if (url === "/api/show" && req.method === "POST") {
			const auth = String(req.headers.authorization ?? "");
			authHeaders.push(auth);
			if (rejectAuth) {
				res.writeHead(401, { "Content-Type": "text/plain" });
				res.end("unauthorized");
				return;
			}
			let body = "";
			req.on("data", (chunk) => {
				body += String(chunk);
			});
			req.on("end", () => {
				const parsed = JSON.parse(body || "{}") as { model?: string };
				if (parsed.model && rejectedModelShows.has(parsed.model)) {
					res.writeHead(500, { "Content-Type": "text/plain" });
					res.end("show failed");
					return;
				}
				const match = models.find((model) => model.id === parsed.model);
				if (!match) {
					res.writeHead(404, { "Content-Type": "text/plain" });
					res.end("model not found");
					return;
				}
				const family = match.id.split(/[:.-]/)[0] ?? "ollama";
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						capabilities: match.capabilities ?? ["completion", "tools"],
						model_info: { [`${family}.context_length`]: match.contextWindow ?? 131072 },
					}),
				);
			});
			return;
		}

		if (url === "/settings/keys") {
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end("<html><body>keys</body></html>");
			return;
		}

		res.writeHead(404, { "Content-Type": "text/plain" });
		res.end("not found");
	});

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const port = (server.address() as AddressInfo).port;
	const origin = `http://127.0.0.1:${port}`;

	return {
		apiUrl: `${origin}/v1`,
		keysUrl: `${origin}/settings/keys`,
		setModels(nextModels) {
			models = nextModels;
		},
		setRejectAuth(reject) {
			rejectAuth = reject;
		},
		setRejectedModelShows(modelIds) {
			rejectedModelShows = new Set(modelIds);
		},
		getAuthHeaders() {
			return [...authHeaders];
		},
		async close() {
			await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
		},
	};
}
