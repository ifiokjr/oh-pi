import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface SqliteStatement {
	run(...args: unknown[]): { lastInsertRowid: number | bigint };
	get(...args: unknown[]): unknown;
	all(...args: unknown[]): unknown[];
}

interface SqliteDb {
	pragma(sql: string): void;
	exec(sql: string): void;
	prepare(sql: string): SqliteStatement;
}

interface SqliteConstructor {
	new (filename: string): SqliteDb;
}

let DatabaseCtor: SqliteConstructor | undefined;
try {
	DatabaseCtor = (await import("better-sqlite3")).default as SqliteConstructor;
} catch {
	/* optional dependency */
}

const KB_DIR = join(homedir(), ".pi/context-kb");
const DB_PATH = join(KB_DIR, "sessions.db");

export interface IndexEntry {
	sessionId: string;
	projectDir: string;
	content: string;
	role: "user" | "assistant" | "toolResult";
	timestamp: number;
}

export interface SearchResult {
	sessionId: string;
	content: string;
	role: string;
	timestamp: number;
	rank: number;
}

let _db: SqliteDb | null = null;

function getDb(): SqliteDb {
	if (!DatabaseCtor) throw new Error("better-sqlite3 is not installed. Run: pnpm add better-sqlite3");
	if (_db) return _db;
	mkdirSync(KB_DIR, { recursive: true });
	_db = new DatabaseCtor(DB_PATH);
	_db.pragma("journal_mode = WAL");
	_db.exec(`
		CREATE TABLE IF NOT EXISTS entries (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL,
			project_dir TEXT NOT NULL,
			content TEXT NOT NULL,
			role TEXT NOT NULL,
			timestamp INTEGER NOT NULL
		);
		CREATE VIRTUAL TABLE IF NOT EXISTS fts_entries USING fts5(
			content,
			role,
			session_id UNINDEXED,
			project_dir UNINDEXED,
			timestamp UNINDEXED,
			content_rowid='id',
			tokenize='porter'
		);
		CREATE INDEX IF NOT EXISTS idx_entries_sid ON entries(session_id);
		CREATE INDEX IF NOT EXISTS idx_entries_proj ON entries(project_dir);
	`);
	return _db;
}

export function indexEntry(entry: IndexEntry): void {
	const db = getDb();
	const { sessionId, projectDir, content, role, timestamp } = entry;
	const result = db
		.prepare("INSERT INTO entries (session_id, project_dir, content, role, timestamp) VALUES (?, ?, ?, ?, ?)")
		.run(sessionId, projectDir, content, role, timestamp);
	db.prepare(
		"INSERT INTO fts_entries (rowid, content, role, session_id, project_dir, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
	).run(result.lastInsertRowid, content, role, sessionId, projectDir, timestamp);
}

export function searchKB(query: string, projectDir?: string, limit = 5): SearchResult[] {
	const db = getDb();
	const sql = projectDir
		? `SELECT e.*, rank FROM fts_entries fe JOIN entries e ON e.id = fe.rowid WHERE fts_entries MATCH ? AND e.project_dir = ? ORDER BY rank LIMIT ?`
		: `SELECT e.*, rank FROM fts_entries fe JOIN entries e ON e.id = fe.rowid WHERE fts_entries MATCH ? ORDER BY rank LIMIT ?`;
	const stmt = db.prepare(sql);
	const rows = projectDir ? stmt.all(query, projectDir, limit) : stmt.all(query, limit);
	return (rows as Array<Record<string, unknown>>).map((r) => ({
		sessionId: r.session_id as string,
		content: r.content as string,
		role: r.role as string,
		timestamp: r.timestamp as number,
		rank: r.rank as number,
	}));
}

export function purgeAll(): void {
	if (_db) {
		_db.exec("DELETE FROM entries; DELETE FROM fts_entries;");
	}
}

export function getStats(): { totalEntries: number; dbPath: string; ftsEnabled: boolean } {
	if (!DatabaseCtor) return { totalEntries: 0, dbPath: DB_PATH, ftsEnabled: false };
	const db = getDb();
	const row = db.prepare("SELECT COUNT(*) as c FROM entries").get() as { c: number };
	return { totalEntries: row.c, dbPath: DB_PATH, ftsEnabled: true };
}
