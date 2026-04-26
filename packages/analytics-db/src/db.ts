/* C8 ignore file */
/**
 * Pi Analytics Database Client
 *
 * SQLite database connection and query utilities using Drizzle ORM.
 * better-sqlite3 is synchronous — no async/await needed.
 */

import Database from "better-sqlite3";
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import * as schema from "./schema.js";

export * from "./schema.js";

// ─── Database Initialization ─────────────────────────────────────────────────

const DB_FILENAME = "analytics.db";

function getDatabasePath(): string {
	const analyticsDir = join(homedir(), ".pi", "agent", "analytics");
	return join(analyticsDir, DB_FILENAME);
}

type DbType = BetterSQLite3Database<typeof schema>;

let dbInstance: DbType | null = null;
let sqliteInstance: Database.Database | null = null;

export function getDatabase(customPath?: string): DbType {
	if (customPath) {
		// If a custom path is provided, create a new connection
		mkdirSync(dirname(customPath), { recursive: true });
		const sqlite = new Database(customPath);
		sqlite.pragma("journal_mode = WAL");
		sqlite.pragma("foreign_keys = ON");
		const customDb = drizzle(sqlite, { schema });
		return customDb;
	}

	if (dbInstance) {
		return dbInstance;
	}

	const dbPath = getDatabasePath();

	// Ensure directory exists
	mkdirSync(dirname(dbPath), { recursive: true });

	// Initialize better-sqlite3 with optimized settings
	sqliteInstance = new Database(dbPath);

	// Enable WAL mode for better concurrency and performance
	sqliteInstance.pragma("journal_mode = WAL");
	sqliteInstance.pragma("foreign_keys = ON");

	dbInstance = drizzle(sqliteInstance, { schema });

	return dbInstance;
}

export function closeDatabase(): void {
	if (sqliteInstance) {
		sqliteInstance.close();
		sqliteInstance = null;
	}
	dbInstance = null;
}

// ─── Session Operations ────────────────────────────────────────────────────

export function createSession(data: schema.NewSession): schema.Session {
	const db = getDatabase();
	const result = db.insert(schema.sessions).values(data).returning();
	return result[0];
}

export function endSession(sessionId: string): void {
	const db = getDatabase();
	db.update(schema.sessions).set({ endedAt: new Date() }).where(eq(schema.sessions.id, sessionId)).run();
}

export function getSessionById(id: string): schema.Session | null {
	const db = getDatabase();
	const result = db.query.sessions.findFirst({
		where: eq(schema.sessions.id, id),
	});
	return result ?? null;
}

export function getRecentSessions(limit: number = 50): schema.Session[] {
	const db = getDatabase();
	return db.query.sessions.findMany({
		limit,
		orderBy: desc(schema.sessions.startedAt),
	});
}

// ─── Codebase Operations ─────────────────────────────────────────────────────

export function upsertCodebase(data: schema.NewCodebase): schema.Codebase {
	const db = getDatabase();
	const existing = db.query.codebases.findFirst({
		where: eq(schema.codebases.id, data.id),
	});

	if (existing) {
		const result = db
			.update(schema.codebases)
			.set({
				gitBranch: data.gitBranch ?? existing.gitBranch,
				gitCommit: data.gitCommit ?? existing.gitCommit,
				lastSeenAt: data.lastSeenAt,
				sessionCount: existing.sessionCount + (data.sessionCount ?? 0),
				totalCost: existing.totalCost + (data.totalCost ?? 0),
				totalTurns: existing.totalTurns + (data.totalTurns ?? 0),
			})
			.where(eq(schema.codebases.id, data.id))
			.returning();
		return result[0];
	}

	const result = db.insert(schema.codebases).values(data).returning();
	return result[0];
}

export function getCodebaseByPath(absolutePath: string): schema.Codebase | null {
	const db = getDatabase();
	const result = db.query.codebases.findFirst({
		where: eq(schema.codebases.absolutePath, absolutePath),
	});
	return result ?? null;
}

export function getTopCodebasesByCost(limit: number = 20): schema.Codebase[] {
	const db = getDatabase();
	return db.query.codebases.findMany({
		limit,
		orderBy: desc(schema.codebases.totalCost),
	});
}

// ─── Provider Operations ─────────────────────────────────────────────────────

export function upsertProvider(data: schema.NewProvider): schema.Provider {
	const db = getDatabase();
	const existing = db.query.providers.findFirst({
		where: eq(schema.providers.id, data.id),
	});

	if (existing) {
		const result = db
			.update(schema.providers)
			.set({
				lastUsedAt: data.lastUsedAt,
				totalCost: existing.totalCost + (data.totalCost ?? 0),
				totalInputTokens: existing.totalInputTokens + (data.totalInputTokens ?? 0),
				totalOutputTokens: existing.totalOutputTokens + (data.totalOutputTokens ?? 0),
				totalTurns: existing.totalTurns + (data.totalTurns ?? 1),
			})
			.where(eq(schema.providers.id, data.id))
			.returning();
		return result[0];
	}

	const result = db.insert(schema.providers).values(data).returning();
	return result[0];
}

export function getAllProviders(): schema.Provider[] {
	const db = getDatabase();
	return db.query.providers.findMany({
		orderBy: desc(schema.providers.lastUsedAt),
	});
}

// ─── Model Operations ───────────────────────────────────────────────────────

export function upsertModel(data: schema.NewModel): schema.Model {
	const db = getDatabase();
	const existing = db.query.models.findFirst({
		where: eq(schema.models.id, data.id),
	});

	if (existing) {
		const newTurns = data.totalTurns ?? 1;
		const newCost = data.totalCost ?? 0;
		const newInput = data.totalInputTokens ?? 0;
		const newOutput = data.totalOutputTokens ?? 0;
		const newCacheRead = data.totalCacheReadTokens ?? 0;
		const newCacheWrite = data.totalCacheWriteTokens ?? 0;
		const totalTurns = existing.totalTurns + newTurns;
		const avgResponseTime =
			data.avgResponseTime != null
				? ((existing.avgResponseTime ?? 0) * existing.totalTurns + data.avgResponseTime * newTurns) / totalTurns
				: existing.avgResponseTime;

		const result = db
			.update(schema.models)
			.set({
				avgResponseTime,
				lastUsedAt: data.lastUsedAt,
				totalCacheReadTokens: existing.totalCacheReadTokens + newCacheRead,
				totalCacheWriteTokens: existing.totalCacheWriteTokens + newCacheWrite,
				totalCost: existing.totalCost + newCost,
				totalInputTokens: existing.totalInputTokens + newInput,
				totalOutputTokens: existing.totalOutputTokens + newOutput,
				totalTurns,
			})
			.where(eq(schema.models.id, data.id))
			.returning();
		return result[0];
	}

	const result = db.insert(schema.models).values(data).returning();
	return result[0];
}

export function getAllModels(): schema.Model[] {
	const db = getDatabase();
	return db.query.models.findMany({
		orderBy: desc(schema.models.lastUsedAt),
		with: { provider: true },
	});
}

export function getTopModelsByCost(limit: number = 20): schema.Model[] {
	const db = getDatabase();
	return db.query.models.findMany({
		limit,
		orderBy: desc(schema.models.totalCost),
		with: { provider: true },
	});
}

// ─── Turn Operations ─────────────────────────────────────────────────────────

export function recordTurn(data: schema.NewTurn): schema.Turn {
	const db = getDatabase();
	const result = db.insert(schema.turns).values(data).returning();

	// Update parent aggregations synchronously
	updateAggregationsFromTurn(data);

	return result[0];
}

function updateAggregationsFromTurn(turn: schema.NewTurn): void {
	// Update codebase stats
	if (turn.codebaseId) {
		upsertCodebaseDailyStat(turn.codebaseId, turn.dayBucket, {
			totalCost: turn.costTotal ?? 0,
			totalDurationMs: turn.durationMs ?? 0,
			totalInputTokens: turn.inputTokens ?? 0,
			totalOutputTokens: turn.outputTokens ?? 0,
			totalTurns: 1,
		});
	}

	// Update model stats
	upsertModelDailyStat(turn.modelId, turn.dayBucket, {
		totalCacheReadTokens: turn.cacheReadTokens ?? 0,
		totalCacheWriteTokens: turn.cacheWriteTokens ?? 0,
		totalCost: turn.costTotal ?? 0,
		totalDurationMs: turn.durationMs ?? 0,
		totalInputTokens: turn.inputTokens ?? 0,
		totalOutputTokens: turn.outputTokens ?? 0,
		totalTurns: 1,
	});

	// Update daily stats
	upsertDailyStat(turn.dayBucket, {
		totalCost: turn.costTotal ?? 0,
		totalDurationMs: turn.durationMs ?? 0,
		totalInputTokens: turn.inputTokens ?? 0,
		totalOutputTokens: turn.outputTokens ?? 0,
		totalTurns: 1,
	});
}

// ─── Rate Limit Snapshot Operations ──────────────────────────────────────────

export function recordRateLimitSnapshot(data: schema.NewRateLimitSnapshot): schema.RateLimitSnapshot {
	const db = getDatabase();
	const result = db.insert(schema.rateLimitSnapshots).values(data).returning();
	return result[0];
}

export function getLatestRateLimitSnapshots(providerId?: string): schema.RateLimitSnapshot[] {
	const db = getDatabase();

	if (providerId) {
		return db.query.rateLimitSnapshots.findMany({
			limit: 10,
			orderBy: desc(schema.rateLimitSnapshots.recordedAt),
			where: eq(schema.rateLimitSnapshots.providerId, providerId),
		});
	}

	return db.query.rateLimitSnapshots.findMany({
		limit: 40,
		orderBy: desc(schema.rateLimitSnapshots.recordedAt),
	});
}

// ─── Daily Stats Aggregation ─────────────────────────────────────────────────

function upsertDailyStat(
	dayBucket: string,
	increment: {
		totalTurns: number;
		totalCost: number;
		totalInputTokens: number;
		totalOutputTokens: number;
		totalDurationMs: number;
	},
): void {
	const db = getDatabase();
	const weekBucket = getWeekBucket(dayBucket);
	const monthBucket = getMonthBucket(dayBucket);

	const existing = db.query.dailyStats.findFirst({
		where: eq(schema.dailyStats.dayBucket, dayBucket),
	});

	if (existing) {
		db.update(schema.dailyStats)
			.set({
				lastActivityAt: new Date(),
				totalCost: existing.totalCost + increment.totalCost,
				totalDurationMs: existing.totalDurationMs + increment.totalDurationMs,
				totalInputTokens: existing.totalInputTokens + increment.totalInputTokens,
				totalOutputTokens: existing.totalOutputTokens + increment.totalOutputTokens,
				totalTurns: existing.totalTurns + increment.totalTurns,
				updatedAt: new Date(),
			})
			.where(eq(schema.dailyStats.dayBucket, dayBucket));
	} else {
		db.insert(schema.dailyStats).values({
			dayBucket,
			firstActivityAt: new Date(),
			id: dayBucket,
			lastActivityAt: new Date(),
			monthBucket,
			totalCost: increment.totalCost,
			totalDurationMs: increment.totalDurationMs,
			totalInputTokens: increment.totalInputTokens,
			totalOutputTokens: increment.totalOutputTokens,
			totalTurns: increment.totalTurns,
			updatedAt: new Date(),
			weekBucket,
		});
	}
}

function upsertModelDailyStat(
	modelId: string,
	dayBucket: string,
	increment: {
		totalTurns: number;
		totalCost: number;
		totalInputTokens: number;
		totalOutputTokens: number;
		totalCacheReadTokens: number;
		totalCacheWriteTokens: number;
		totalDurationMs: number;
	},
): void {
	const db = getDatabase();
	const id = `${modelId}:${dayBucket}`;
	const weekBucket = getWeekBucket(dayBucket);
	const monthBucket = getMonthBucket(dayBucket);

	const existing = db.query.modelDailyStats.findFirst({
		where: eq(schema.modelDailyStats.id, id),
	});

	if (existing) {
		const newTurns = existing.totalTurns + increment.totalTurns;
		const newInput = existing.totalInputTokens + increment.totalInputTokens;
		const newOutput = existing.totalOutputTokens + increment.totalOutputTokens;
		const newDuration = existing.totalDurationMs + increment.totalDurationMs;

		db.update(schema.modelDailyStats)
			.set({
				avgResponseTimeMs: newTurns > 0 ? newDuration / newTurns : 0,
				avgTokensPerTurn: newTurns > 0 ? (newInput + newOutput) / newTurns : 0,
				totalCacheReadTokens: existing.totalCacheReadTokens + increment.totalCacheReadTokens,
				totalCacheWriteTokens: existing.totalCacheWriteTokens + increment.totalCacheWriteTokens,
				totalCost: existing.totalCost + increment.totalCost,
				totalDurationMs: newDuration,
				totalInputTokens: newInput,
				totalOutputTokens: newOutput,
				totalTurns: newTurns,
				updatedAt: new Date(),
			})
			.where(eq(schema.modelDailyStats.id, id));
	} else {
		db.insert(schema.modelDailyStats).values({
			avgResponseTimeMs: increment.totalTurns > 0 ? increment.totalDurationMs / increment.totalTurns : 0,
			avgTokensPerTurn:
				increment.totalTurns > 0
					? (increment.totalInputTokens + increment.totalOutputTokens) / increment.totalTurns
					: 0,
			dayBucket,
			id,
			modelId,
			monthBucket,
			totalCacheReadTokens: increment.totalCacheReadTokens,
			totalCacheWriteTokens: increment.totalCacheWriteTokens,
			totalCost: increment.totalCost,
			totalDurationMs: increment.totalDurationMs,
			totalInputTokens: increment.totalInputTokens,
			totalOutputTokens: increment.totalOutputTokens,
			totalTurns: increment.totalTurns,
			updatedAt: new Date(),
			weekBucket,
		});
	}
}

function upsertCodebaseDailyStat(
	codebaseId: string,
	dayBucket: string,
	increment: {
		totalTurns: number;
		totalCost: number;
		totalInputTokens: number;
		totalOutputTokens: number;
		totalDurationMs: number;
	},
): void {
	const db = getDatabase();
	const id = `${codebaseId}:${dayBucket}`;
	const weekBucket = getWeekBucket(dayBucket);
	const monthBucket = getMonthBucket(dayBucket);

	const existing = db.query.codebaseDailyStats.findFirst({
		where: eq(schema.codebaseDailyStats.id, id),
	});

	if (existing) {
		db.update(schema.codebaseDailyStats)
			.set({
				totalCost: existing.totalCost + increment.totalCost,
				totalDurationMs: existing.totalDurationMs + increment.totalDurationMs,
				totalInputTokens: existing.totalInputTokens + increment.totalInputTokens,
				totalOutputTokens: existing.totalOutputTokens + increment.totalOutputTokens,
				totalTurns: existing.totalTurns + increment.totalTurns,
				updatedAt: new Date(),
			})
			.where(eq(schema.codebaseDailyStats.id, id));
	} else {
		db.insert(schema.codebaseDailyStats).values({
			codebaseId,
			dayBucket,
			id,
			monthBucket,
			sessionCount: 1,
			totalCost: increment.totalCost,
			totalDurationMs: increment.totalDurationMs,
			totalInputTokens: increment.totalInputTokens,
			totalOutputTokens: increment.totalOutputTokens,
			totalTurns: increment.totalTurns,
			uniqueModels: 1,
			updatedAt: new Date(),
			weekBucket,
		});
	}
}

// ─── Analytics Queries ───────────────────────────────────────────────────────

export function getDailyStatsRange(startDate: string, endDate: string): schema.DailyStat[] {
	const db = getDatabase();
	return db.query.dailyStats.findMany({
		orderBy: schema.dailyStats.dayBucket,
		where: and(gte(schema.dailyStats.dayBucket, startDate), lte(schema.dailyStats.dayBucket, endDate)),
	});
}

export function getModelUsageOverTime(modelId: string, days: number = 30): schema.ModelDailyStat[] {
	const db = getDatabase();
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);
	const cutoffStr = formatDate(cutoff);

	return db.query.modelDailyStats.findMany({
		orderBy: schema.modelDailyStats.dayBucket,
		where: and(eq(schema.modelDailyStats.modelId, modelId), gte(schema.modelDailyStats.dayBucket, cutoffStr)),
	});
}

export function getCodebaseUsageOverTime(codebaseId: string, days: number = 30): schema.CodebaseDailyStat[] {
	const db = getDatabase();
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);
	const cutoffStr = formatDate(cutoff);

	return db.query.codebaseDailyStats.findMany({
		orderBy: schema.codebaseDailyStats.dayBucket,
		where: and(
			eq(schema.codebaseDailyStats.codebaseId, codebaseId),
			gte(schema.codebaseDailyStats.dayBucket, cutoffStr),
		),
	});
}

export function getSummaryStats(): {
	totalTurns: number;
	totalCost: number;
	totalSessions: number;
	uniqueModels: number;
	uniqueCodebases: number;
} {
	const db = getDatabase();

	const [turnResult] = db.select({ count: sql<number>`count(*)`.as("count") }).from(schema.turns);

	const [costResult] = db.select({ sum: sql<number>`sum(cost_total)`.as("sum") }).from(schema.turns);

	const [sessionResult] = db.select({ count: sql<number>`count(*)`.as("count") }).from(schema.sessions);

	const [modelResult] = db.select({ count: sql<number>`count(*)`.as("count") }).from(schema.models);

	const [codebaseResult] = db.select({ count: sql<number>`count(*)`.as("count") }).from(schema.codebases);

	return {
		totalCost: costResult?.sum ?? 0,
		totalSessions: sessionResult?.count ?? 0,
		totalTurns: turnResult?.count ?? 0,
		uniqueCodebases: codebaseResult?.count ?? 0,
		uniqueModels: modelResult?.count ?? 0,
	};
}

// ─── Helper Functions ────────────────────────────────────────────────────────

export function formatDateBucket(date: Date = new Date()): string {
	return date.toISOString().split("T")[0];
}

export function formatHourBucket(date: Date = new Date()): string {
	return `${date.toISOString().split("T")[0]} ${String(date.getUTCHours()).padStart(2, "0")}:00:00`;
}

export function formatWeekBucket(date: Date = new Date()): string {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
	return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function formatMonthBucket(date: Date = new Date()): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatDate(date: Date): string {
	return date.toISOString().split("T")[0];
}

function getWeekBucket(dayBucket: string): string {
	const [year, month, day] = dayBucket.split("-").map(Number);
	const date = new Date(year, month - 1, day);
	return formatWeekBucket(date);
}

function getMonthBucket(dayBucket: string): string {
	return dayBucket.slice(0, 7);
}

// ─── Word Frequency Operations ────────────────────────────────────────────────

export function recordWordFrequency(modelId: string, dayBucket: string, word: string, count: number = 1): void {
	const db = getDatabase();
	const id = `${modelId}:${dayBucket}:${word}`;

	const existing = db.query.wordFrequencies.findFirst({
		where: eq(schema.wordFrequencies.id, id),
	});

	if (existing) {
		db.update(schema.wordFrequencies)
			.set({
				count: existing.count + count,
				updatedAt: new Date(),
			})
			.where(eq(schema.wordFrequencies.id, id));
	} else {
		db.insert(schema.wordFrequencies).values({
			count,
			dayBucket,
			id,
			modelId,
			word,
		});
	}
}

export function getTopWords(modelId: string, days: number = 30, limit: number = 50): schema.WordFrequency[] {
	const db = getDatabase();
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);
	const cutoffStr = formatDate(cutoff);

	return db.query.wordFrequencies.findMany({
		limit,
		orderBy: desc(schema.wordFrequencies.count),
		where: and(eq(schema.wordFrequencies.modelId, modelId), gte(schema.wordFrequencies.dayBucket, cutoffStr)),
	});
}

export function getGlobalTopWords(days: number = 30, limit: number = 100): schema.WordFrequency[] {
	const db = getDatabase();
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);
	const cutoffStr = formatDate(cutoff);

	// Get top words across all models
	return db.query.wordFrequencies.findMany({
		limit,
		orderBy: desc(schema.wordFrequencies.count),
		where: gte(schema.wordFrequencies.dayBucket, cutoffStr),
	});
}

// ─── Misspelling Operations ────────────────────────────────────────────────────

export function recordMisspelling(
	modelId: string,
	dayBucket: string,
	misspelledWord: string,
	correctedWord: string,
	contextWindow?: string,
): void {
	const db = getDatabase();
	const id = `${modelId}:${dayBucket}:${misspelledWord}:${correctedWord}`;

	const existing = db.query.misspellings.findFirst({
		where: eq(schema.misspellings.id, id),
	});

	if (existing) {
		db.update(schema.misspellings)
			.set({
				lastSeenAt: new Date(),
				occurrenceCount: existing.occurrenceCount + 1,
			})
			.where(eq(schema.misspellings.id, id));
	} else {
		db.insert(schema.misspellings).values({
			contextWindow: contextWindow ?? null,
			correctedWord,
			dayBucket,
			id,
			misspelledWord,
			modelId,
		});
	}
}

export function getTopMisspellings(modelId: string, days: number = 30, limit: number = 50): schema.Misspelling[] {
	const db = getDatabase();
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);
	const cutoffStr = formatDate(cutoff);

	return db.query.misspellings.findMany({
		limit,
		orderBy: desc(schema.misspellings.occurrenceCount),
		where: and(eq(schema.misspellings.modelId, modelId), gte(schema.misspellings.dayBucket, cutoffStr)),
	});
}

// ─── Session Event Operations (real-time activity stream) ─────────────────────

export function createSessionEvent(data: schema.NewSessionEvent): schema.SessionEvent {
	const db = getDatabase();
	const result = db.insert(schema.sessionEvents).values(data).returning();
	return result[0];
}

export function completeSessionEvent(
	eventId: string,
	updates: Partial<
		Pick<
			schema.SessionEvent,
			| "completedAt"
			| "durationMs"
			| "inputTokens"
			| "outputTokens"
			| "costTotal"
			| "status"
			| "errorMessage"
			| "isStreaming"
		>
	>,
): void {
	const db = getDatabase();
	db.update(schema.sessionEvents)
		.set({ ...updates, isStreaming: updates.isStreaming ?? false })
		.where(eq(schema.sessionEvents.id, eventId));
}

export function getActiveEvents(): schema.SessionEvent[] {
	const db = getDatabase();
	return db.query.sessionEvents.findMany({
		limit: 50,
		orderBy: desc(schema.sessionEvents.startedAt),
		where: eq(schema.sessionEvents.isStreaming, true),
	});
}

export function getRecentEvents(limit: number = 50): schema.SessionEvent[] {
	const db = getDatabase();
	return db.query.sessionEvents.findMany({
		limit,
		orderBy: desc(schema.sessionEvents.startedAt),
	});
}
