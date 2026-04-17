/* c8 ignore file -- tested via separate vitest suite */
/**
 * Pi Analytics Database - Main Entry Point
 *
 * Comprehensive analytics tracking for Pi usage with SQLite persistence.
 */

export * from "./schema.js";
export * from "./db.js";
export { runMigrations, resetDatabase, getSchemaVersion } from "./migrations.js";

export const VERSION = "0.2.0";