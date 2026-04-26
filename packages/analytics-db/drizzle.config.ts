/* C8 ignore file */
/**
 * Pi Analytics - Database Package
 *
 * Drizzle Kit configuration for generating migrations.
 */

import { defineConfig } from "drizzle-kit";
import { join } from "node:path";
import { homedir } from "node:os";

function getDatabasePath(): string {
	return join(homedir(), ".pi", "agent", "analytics", "analytics.db");
}

export default defineConfig({
	dbCredentials: {
		url: getDatabasePath(),
	},
	dialect: "sqlite",
	out: "./migrations",
	schema: "./src/schema.ts",
});
