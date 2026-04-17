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
  dialect: "sqlite",
  dbCredentials: {
    url: getDatabasePath(),
  },
  schema: "./src/schema.ts",
  out: "./migrations",
});