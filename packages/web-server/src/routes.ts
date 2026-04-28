import { Hono } from "hono";
import { validateToken } from "./token.js";
import type { AgentSessionLike } from "./ws-handler.js";

export interface RoutesOptions {
	token: string;
	instanceId: string;
	startTime: number;
	getSession: () => AgentSessionLike | undefined;
	getConnectedClients: () => number;
}

export function createRoutes(options: RoutesOptions): Hono {
	const app = new Hono();

	// Health check — no auth required
	app.get("/api/health", (c) =>
		c.json({
			status: "ok",
			uptime: Math.floor((Date.now() - options.startTime) / 1000),
		}),
	);

	// Auth middleware for all other /api routes
	app.use("/api/*", async (c, next) => {
		const auth = c.req.header("Authorization");

		if (!auth?.startsWith("Bearer ")) {
			return c.json({ error: "Authorization required" }, 401);
		}

		const provided = auth.slice(7);

		if (!validateToken(provided, options.token)) {
			return c.json({ error: "Invalid token" }, 401);
		}

		await next();
	});

	// Instance info
	app.get("/api/instance", (c) =>
		c.json({
			instanceId: options.instanceId,
			uptime: Math.floor((Date.now() - options.startTime) / 1000),
			connectedClients: options.getConnectedClients(),
		}),
	);

	// Session state
	app.get("/api/session/state", (c) => {
		const session = options.getSession();

		if (!session) {
			return c.json({ error: "No session attached" }, 503);
		}

		return c.json({
			isStreaming: session.isStreaming,
			messageCount: session.messages.length,
			model: session.model,
			sessionId: session.sessionId,
			thinkingLevel: session.thinkingLevel,
		});
	});

	// Session messages
	app.get("/api/session/messages", (c) => {
		const session = options.getSession();

		if (!session) {
			return c.json({ error: "No session attached" }, 503);
		}

		return c.json({ messages: session.messages });
	});

	// Session stats
	app.get("/api/session/stats", (c) => {
		const session = options.getSession();

		if (!session) {
			return c.json({ error: "No session attached" }, 503);
		}

		return c.json({
			isStreaming: session.isStreaming,
			messageCount: session.messages.length,
			sessionId: session.sessionId,
		});
	});

	// Available models
	app.get("/api/models", (c) => {
		const session = options.getSession();

		if (!session) {
			return c.json({ error: "No session attached" }, 503);
		}

		return c.json({
			currentModel: session.model,
			thinkingLevel: session.thinkingLevel,
		});
	});

	return app;
}
