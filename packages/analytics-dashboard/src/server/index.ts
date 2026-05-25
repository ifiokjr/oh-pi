/* C8 ignore file */
/**
 * Pi Analytics Dashboard — API Server
 *
 * Lightweight Express server that reads from the SQLite database
 * and serves JSON API endpoints for the dashboard frontend.
 *
 * Run: npx tsx src/server/index.ts
 * Default port: 31415 (API at /api/*, static files served in production)
 */

import {
	formatDateBucket,
	getActiveEvents,
	getCodebaseUsageOverTime,
	getDailyStatsRange,
	getDatabase,
	getGlobalTopWords,
	getModelUsageOverTime,
	getRecentEvents,
	getSummaryStats,
	getTopMisspellings,
	getTopWords,
} from "@ifi/pi-analytics-db/db";
import * as schema from "@ifi/pi-analytics-db/schema";
import cors from "cors";
import { desc } from "drizzle-orm";
import express from "express";
import fs from "node:fs";
import path from "node:path";

const app = express();
const PORT = Number.parseInt(process.env.PORT ?? "31415", 10);
const DB_PATH =
	process.env.ANALYTICS_DB_PATH ?? path.join(process.env.HOME ?? "~", ".pi", "agent", "analytics", "analytics.db");

const __dirname = import.meta.dirname;

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// ─── Health Check ──────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
	try {
		const stats = getSummaryStats();
		res.json({ db: DB_PATH, status: "ok", ...stats });
	} catch (error) {
		res.status(500).json({ status: "error", message: String(error) });
	}
});

// ─── Overview ──────────────────────────────────────────────────────────────────

app.get("/api/overview", (req, res) => {
	try {
		const days = Number.parseInt((req.query.days as string) ?? "30", 10);
		const stats = getSummaryStats();

		const endDate = formatDateBucket();
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - days);
		const startDateStr = formatDateBucket(startDate);

		const dailyStats = getDailyStatsRange(startDateStr, endDate);

		res.json({
			...stats,
			dailyStats,
			recentActivity: dailyStats.slice(-7),
		});
	} catch (error) {
		res.status(500).json({ error: String(error) });
	}
});

// ─── Models ────────────────────────────────────────────────────────────────────

app.get("/api/models", (req, res) => {
	try {
		const db = getDatabase(DB_PATH);
		const days = Number.parseInt((req.query.days as string) ?? "30", 10);

		const allModels = db.query.models.findMany({
			orderBy: desc(schema.models.totalTurns),
		});

		const modelStats: Record<string, unknown[]> = {};
		for (const model of allModels) {
			modelStats[model.id] = getModelUsageOverTime(model.id, days);
		}

		res.json({ modelStats, models: allModels });
	} catch (error) {
		res.status(500).json({ error: String(error) });
	}
});

// ─── Codebases ─────────────────────────────────────────────────────────────────

app.get("/api/codebases", (req, res) => {
	try {
		const db = getDatabase(DB_PATH);
		const days = Number.parseInt((req.query.days as string) ?? "30", 10);

		const allCodebases = db.query.codebases.findMany({
			orderBy: desc(schema.codebases.totalTurns),
		});

		const codebaseStats: Record<string, unknown[]> = {};
		for (const cb of allCodebases) {
			codebaseStats[cb.id] = getCodebaseUsageOverTime(cb.id, days);
		}

		res.json({ codebaseStats, codebases: allCodebases });
	} catch (error) {
		res.status(500).json({ error: String(error) });
	}
});

// ─── Providers ──────────────────────────────────────────────────────────────────

app.get("/api/providers", (_req, res) => {
	try {
		const db = getDatabase(DB_PATH);
		const allProviders = db.query.providers.findMany({
			orderBy: desc(schema.providers.totalTurns),
		});
		res.json({ providers: allProviders });
	} catch (error) {
		res.status(500).json({ error: String(error) });
	}
});

// ─── Turns ─────────────────────────────────────────────────────────────────────

app.get("/api/turns", (req, res) => {
	try {
		const db = getDatabase(DB_PATH);
		const limit = Number.parseInt((req.query.limit as string) ?? "100", 10);
		const offset = Number.parseInt((req.query.offset as string) ?? "0", 10);

		const turns = db.query.turns.findMany({
			limit,
			offset,
			orderBy: desc(schema.turns.startedAt),
			with: {
				codebase: true,
				model: true,
				provider: true,
				session: true,
			},
		});

		res.json({ turns });
	} catch (error) {
		res.status(500).json({ error: String(error) });
	}
});

// ─── Word Frequencies ──────────────────────────────────────────────────────────

app.get("/api/words", (req, res) => {
	try {
		const modelId = req.query.model_id as string | undefined;
		const days = Number.parseInt((req.query.days as string) ?? "30", 10);
		const limit = Number.parseInt((req.query.limit as string) ?? "100", 10);

		const words = modelId ? getTopWords(modelId, days, limit) : getGlobalTopWords(days, limit);

		res.json({ words });
	} catch (error) {
		res.status(500).json({ error: String(error) });
	}
});

// ─── Misspellings ──────────────────────────────────────────────────────────────

app.get("/api/misspellings", (req, res) => {
	try {
		const modelId = req.query.model_id as string;
		const days = Number.parseInt((req.query.days as string) ?? "30", 10);
		const limit = Number.parseInt((req.query.limit as string) ?? "50", 10);

		const misspellings = getTopMisspellings(modelId, days, limit);
		res.json({ misspellings });
	} catch (error) {
		res.status(500).json({ error: String(error) });
	}
});

// ─── Live Activity ─────────────────────────────────────────────────────────────

app.get("/api/live", (_req, res) => {
	try {
		const active = getActiveEvents();
		const recent = getRecentEvents(50);
		res.json({ active, recent });
	} catch (error) {
		res.status(500).json({ error: String(error) });
	}
});

// ─── Sessions ───────────────────────────────────────────────────────────────────

app.get("/api/sessions", (req, res) => {
	try {
		const db = getDatabase(DB_PATH);
		const limit = Number.parseInt((req.query.limit as string) ?? "50", 10);

		const sessions = db.query.sessions.findMany({
			limit,
			orderBy: desc(schema.sessions.startedAt),
		});

		res.json({ sessions });
	} catch (error) {
		res.status(500).json({ error: String(error) });
	}
});

// ─── Static File Serving (Production) ─────────────────────────────────────────

const distPath = path.join(__dirname, "../../dist");
if (fs.existsSync(distPath)) {
	app.use(express.static(distPath));
	app.get("*", (_req, res) => {
		res.sendFile(path.join(distPath, "index.html"));
	});
}

// ─── Start Server ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
	console.log(`\u{1F4CA} Pi Analytics Dashboard API running at http://localhost:${PORT}`);
	console.log(`\u{1F4C1} Database: ${DB_PATH}`);
	console.log(
		`\u{1F517} API: /api/health | /api/overview | /api/models | /api/codebases | /api/providers | /api/turns | /api/words | /api/misspellings | /api/live | /api/sessions`,
	);
});
