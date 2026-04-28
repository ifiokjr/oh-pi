/* C8 ignore file */
/**
 * Pi Analytics Database - Main Entry Point
 *
 * Comprehensive analytics tracking for Pi usage with SQLite persistence.
 */

export * from "./db.js";
export { getSchemaVersion, resetDatabase, runMigrations } from "./migrations.js";
export * from "./schema.js";

export const VERSION = "0.2.0";
