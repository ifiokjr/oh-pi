import { describe, expect, it } from "vitest";
import { createRoutes } from "../src/routes.js";
import type { AgentSessionLike } from "../src/ws-handler.js";

function createSession(overrides: Partial<AgentSessionLike> = {}): AgentSessionLike {
	return {
		prompt: async () => {},
		steer: async () => {},
		followUp: async () => {},
		abort: async () => {},
		compact: async () => ({ ok: true }),
		setModel: async () => true,
		setThinkingLevel: () => {},
		subscribe: () => () => {},
		isStreaming: false,
		messages: [{ role: "user", content: "hello" }],
		model: "openai/gpt-5-mini",
		thinkingLevel: "medium",
		sessionId: "session-1",
		sessionFile: "/tmp/session-1.jsonl",
		agent: { state: { systemPrompt: "You are helpful", tools: [] } },
		newSession: async () => ({ cancelled: false }),
		...overrides,
	};
}

function createApp(session?: AgentSessionLike) {
	return createRoutes({
		token: "test-token",
		instanceId: "instance-42",
		startTime: Date.now() - 4_300,
		getSession: () => session,
		getConnectedClients: () => 3,
	});
}

function authHeaders(token = "test-token") {
	return { Authorization: `Bearer ${token}` };
}

describe("createRoutes", () => {
	it("serves health checks without authentication", async () => {
		const response = await createApp().request("/api/health");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({
			status: "ok",
			uptime: expect.any(Number),
		});
		expect(body.uptime).toBeGreaterThanOrEqual(4);
	});

	it("rejects missing or invalid bearer tokens", async () => {
		const app = createApp();

		const missing = await app.request("/api/instance");
		expect(missing.status).toBe(401);
		expect(await missing.json()).toEqual({ error: "Authorization required" });

		const invalid = await app.request("/api/instance", {
			headers: authHeaders("wrong-token"),
		});
		expect(invalid.status).toBe(401);
		expect(await invalid.json()).toEqual({ error: "Invalid token" });
	});

	it("returns instance metadata when authenticated", async () => {
		const response = await createApp().request("/api/instance", {
			headers: authHeaders(),
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			instanceId: "instance-42",
			uptime: expect.any(Number),
			connectedClients: 3,
		});
	});

	it("returns 503 for session endpoints when no session is attached", async () => {
		const app = createApp();

		for (const pathname of ["/api/session/state", "/api/session/messages", "/api/session/stats", "/api/models"]) {
			const response = await app.request(pathname, { headers: authHeaders() });
			expect(response.status).toBe(503);
			expect(await response.json()).toEqual({ error: "No session attached" });
		}
	});

	it("returns session state, messages, stats, and models when a session is attached", async () => {
		const session = createSession({
			isStreaming: true,
			messages: [
				{ role: "user", content: "hello" },
				{ role: "assistant", content: "hi" },
			],
		});
		const app = createApp(session);

		const state = await app.request("/api/session/state", {
			headers: authHeaders(),
		});
		expect(state.status).toBe(200);
		expect(await state.json()).toEqual({
			model: "openai/gpt-5-mini",
			thinkingLevel: "medium",
			isStreaming: true,
			sessionId: "session-1",
			messageCount: 2,
		});

		const messages = await app.request("/api/session/messages", {
			headers: authHeaders(),
		});
		expect(messages.status).toBe(200);
		expect(await messages.json()).toEqual({ messages: session.messages });

		const stats = await app.request("/api/session/stats", {
			headers: authHeaders(),
		});
		expect(stats.status).toBe(200);
		expect(await stats.json()).toEqual({
			sessionId: "session-1",
			messageCount: 2,
			isStreaming: true,
		});

		const models = await app.request("/api/models", { headers: authHeaders() });
		expect(models.status).toBe(200);
		expect(await models.json()).toEqual({
			currentModel: "openai/gpt-5-mini",
			thinkingLevel: "medium",
		});
	});
});
