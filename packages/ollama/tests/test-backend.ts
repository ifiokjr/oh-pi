import http from "node:http";
import type { AddressInfo } from "node:net";

type BackendModel = { id: string; capabilities?: string[]; contextWindow?: number; family?: string; parameterSize?: string; quantization?: string };

export interface TestOllamaBackend {
	apiUrl: string;
	origin: string;
	keysUrl: string;
	setModels(models: BackendModel[]): void;
	setPublicModels(models: BackendModel[]): void;
	setAuthenticatedModels(models: BackendModel[]): void;
	setRejectAuth(reject: boolean): void;
	setRejectedModelShows(modelIds: string[]): void;
	getAuthHeaders(): string[];
	close(): Promise<void>;
}

export async function createTestOllamaBackend(): Promise<TestOllamaBackend> {
	let models: BackendModel[] = [];
	let publicModels: BackendModel[] | null = null;
	let authenticatedModels: BackendModel[] | null = null;
	let rejectAuth = false;
	let rejectedModelShows = new Set<string>();
	const authHeaders: string[] = [];

	const server = http.createServer((req, res) => {
		const url = req.url ?? "/";
		const auth = String(req.headers.authorization ?? "");
		const usingAuth = auth.length > 0;
		const activeModels = usingAuth ? (authenticatedModels ?? models) : (publicModels ?? models);
		if (url === "/v1/models" && req.method === "GET") {
			authHeaders.push(auth);
			if (rejectAuth && usingAuth) {
				res.writeHead(401, { "Content-Type": "text/plain" });
				res.end("unauthorized");
				return;
			}
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ data: activeModels.map((model) => ({ id: model.id, object: "model" })) }));
			return;
		}

		if (url === "/api/show" && req.method === "POST") {
			authHeaders.push(auth);
			if (rejectAuth && usingAuth) {
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
				const match = activeModels.find((model) => model.id === parsed.model);
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
						details: {
							family: match.family ?? family,
							parameter_size: match.parameterSize ?? undefined,
							quantization_level: match.quantization ?? undefined,
						},
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
		origin,
		keysUrl: `${origin}/settings/keys`,
		setModels(nextModels) {
			models = nextModels;
			publicModels = null;
			authenticatedModels = null;
		},
		setPublicModels(nextModels) {
			publicModels = nextModels;
		},
		setAuthenticatedModels(nextModels) {
			authenticatedModels = nextModels;
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
