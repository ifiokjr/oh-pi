/* C8 ignore file */
/**
 * Pi Analytics Database Migrations
 *
 * Handles database schema migration for the analytics database.
 */

import Database from "better-sqlite3";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const MIGRATIONS_TABLE = "__drizzle_migrations";

function getDatabasePath(): string {
	const analyticsDir = join(homedir(), ".pi", "agent", "analytics");
	return join(analyticsDir, "analytics.db");
}

function getMigrationsDir(): string {
	return join(dirname(new URL(import.meta.url).pathname), "..", "migrations");
}

/**
 * Ensure migrations table exists
 */
function ensureMigrationsTable(db: Database.Database): void {
	db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);
}

/**
 * Get applied migrations
 */
function getAppliedMigrations(db: Database.Database): Set<string> {
	ensureMigrationsTable(db);
	try {
		const rows = db.prepare(`SELECT hash FROM ${MIGRATIONS_TABLE}`).all() as {
			hash: string;
		}[];
		return new Set(rows.map((r) => r.hash));
	} catch {
		return new Set();
	}
}

/**
 * Mark migration as applied
 */
function recordMigration(db: Database.Database, hash: string): void {
	db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (hash) VALUES (?)`).run(hash);
}

/**
 * Run pending migrations
 */
export function runMigrations(): void {
	const dbPath = getDatabasePath();
	mkdirSync(dirname(dbPath), { recursive: true });

	const db = new Database(dbPath);
	db.pragma("journal_mode = WAL");

	try {
		const applied = getAppliedMigrations(db);
		const migrationsDir = getMigrationsDir();

		let migrationFiles: string[];
		try {
			migrationFiles = readdirSync(migrationsDir)
				.filter((f) => f.endsWith(".sql"))
				.toSorted();
		} catch {
			// No migrations directory yet — initial creation
			return;
		}

		for (const file of migrationFiles) {
			const filePath = join(migrationsDir, file);
			const content = readFileSync(filePath, "utf8");
			const hash = `${file}:${content.length}`;

			if (applied.has(hash)) {
				continue;
			}

			try {
				db.exec(content);
				recordMigration(db, hash);
			} catch (error) {
				console.error(`Migration ${file} failed:`, error);
				throw error;
			}
		}
	} finally {
		db.close();
	}
}

/**
 * Reset database (for development/testing)
 */
export function resetDatabase(): void {
	const dbPath = getDatabasePath();

	try {
		const db = new Database(dbPath);
		const tables = db
			.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
			.all() as { name: string }[];

		for (const { name } of tables) {
			db.exec(`DROP TABLE IF EXISTS "${name}"`);
		}

		db.close();
	} catch {
		// Database doesn't exist yet
	}
}

/**
 * Get current schema version (number of applied migrations)
 */
export function getSchemaVersion(): number {
	const dbPath = getDatabasePath();

	try {
		const db = new Database(dbPath);
		ensureMigrationsTable(db);
		const result = db.prepare(`SELECT COUNT(*) as count FROM ${MIGRATIONS_TABLE}`).get() as { count: number };
		db.close();
		return result.count;
	} catch {
		return 0;
	}
}
