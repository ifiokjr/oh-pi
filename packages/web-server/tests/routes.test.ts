import { createRoutes } from "../src/routes.js";
import type { AgentSessionLike } from "../src/ws-handler.js";

function createSession(overrides: Partial<AgentSessionLike> = {}): AgentSessionLike {
	return {
		abort: async () => {},
		agent: { state: { systemPrompt: "You are helpful", tools: [] } },
		compact: async () => ({ ok: true }),
		followUp: async () => {},
		isStreaming: false,
		messages: [{ role: "user", content: "hello" }],
		model: "openai/gpt-5-mini",
		newSession: async () => ({ cancelled: false }),
		prompt: async () => {},
		sessionFile: "/tmp/session-1.jsonl",
		sessionId: "session-1",
		setModel: async () => true,
		setThinkingLevel: () => {},
		steer: async () => {},
		subscribe: () => () => {},
		thinkingLevel: "medium",
		...overrides,
	};
}

function createApp(session?: AgentSessionLike) {
	return createRoutes({
		getConnectedClients: () => 3,
		getSession: () => session,
		instanceId: "instance-42",
		startTime: Date.now() - 4_300,
		token: "test-token",
	});
}

function authHeaders(token = "test-token") {
	return { Authorization: `Bearer ${token}` };
}

describe(createRoutes, () => {
	it("serves health checks without authentication", async () => {
		const response = await createApp().request("/api/health");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toStrictEqual({
			status: "ok",
			uptime: expect.any(Number),
		});
		expect(body.uptime).toBeGreaterThanOrEqual(4);
	});

	it("rejects missing or invalid bearer tokens", async () => {
		const app = createApp();

		const missing = await app.request("/api/instance");
		expect(missing.status).toBe(401);
		await expect(missing.json()).resolves.toStrictEqual({ error: "Authorization required" });

		const invalid = await app.request("/api/instance", {
			headers: authHeaders("wrong-token"),
		});
		expect(invalid.status).toBe(401);
		await expect(invalid.json()).resolves.toStrictEqual({ error: "Invalid token" });
	});

	it("returns instance metadata when authenticated", async () => {
		const response = await createApp().request("/api/instance", {
			headers: authHeaders(),
		});

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toStrictEqual({
			connectedClients: 3,
			instanceId: "instance-42",
			uptime: expect.any(Number),
		});
	});

	it("returns 503 for session endpoints when no session is attached", async () => {
		const app = createApp();

		for (const pathname of ["/api/session/state", "/api/session/messages", "/api/session/stats", "/api/models"]) {
			const response = await app.request(pathname, { headers: authHeaders() });
			expect(response.status).toBe(503);
			await expect(response.json()).resolves.toStrictEqual({ error: "No session attached" });
		}
	});

	it("returns session state, messages, stats, and models when a session is attached", async () => {
		const session = createSession({
			isStreaming: true,
			messages: [
				{ content: "hello", role: "user" },
				{ content: "hi", role: "assistant" },
			],
		});
		const app = createApp(session);

		const state = await app.request("/api/session/state", { headers: authHeaders() });
		expect(state.status).toBe(200);
		await expect(state.json()).resolves.toStrictEqual({
			isStreaming: true,
			messageCount: 2,
			model: "openai/gpt-5-mini",
			sessionId: "session-1",
			thinkingLevel: "medium",
		});

		const messages = await app.request("/api/session/messages", { headers: authHeaders() });
		expect(messages.status).toBe(200);
		await expect(messages.json()).resolves.toStrictEqual({ messages: session.messages });

		const stats = await app.request("/api/session/stats", { headers: authHeaders() });
		expect(stats.status).toBe(200);
		await expect(stats.json()).resolves.toStrictEqual({
			isStreaming: true,
			messageCount: 2,
			sessionId: "session-1",
		});

		const models = await app.request("/api/models", { headers: authHeaders() });
		expect(models.status).toBe(200);
		await expect(models.json()).resolves.toStrictEqual({
			currentModel: "openai/gpt-5-mini",
			thinkingLevel: "medium",
		});
	});
});
