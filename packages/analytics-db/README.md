# `@ifi/pi-analytics-db`

> SQLite database layer for pi analytics with Drizzle ORM and migrations.

Provides the schema, typed query helpers, and migration system that `@ifi/pi-analytics-extension`
and `@ifi/pi-analytics-dashboard` use to store and retrieve AI usage data.

## Why use this?

If you're building on top of oh-pi analytics — writing your own dashboard, running custom queries,
or extending the data model — this package gives you the typed ORM client without duplicating the
schema.

## Schema overview

| Table             | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `sessions`        | One row per pi session (start/end/duration/codebase) |
| `turns`           | One row per turn (model/provider/tokens/cost)        |
| `codebases`       | Normalized codebase lookup (path hashed for privacy) |
| `models`          | Normalized model catalog                             |
| `providers`       | Normalized provider catalog                          |
| `session_hourly`  | Pre-aggregated hourly stats                          |
| `session_daily`   | Pre-aggregated daily stats                           |
| `session_weekly`  | Pre-aggregated weekly stats                          |
| `session_monthly` | Pre-aggregated monthly stats                         |

## Exports

```ts
// Schema types
import type { NewSession, NewTurn, NewCodebase } from "@ifi/pi-analytics-db";

// ORM client + migrations
import { createSession, recordTurn, endSession, upsertModel, upsertProvider } from "@ifi/pi-analytics-db";

// Utility exports
import { runMigrations } from "@ifi/pi-analytics-db/migrations";
import { formatDateBucket, formatHourBucket, formatWeekBucket, formatMonthBucket } from "@ifi/pi-analytics-db";
```

## Usage

```ts
import { createSession, recordTurn, endSession } from "@ifi/pi-analytics-db";
import { runMigrations } from "@ifi/pi-analytics-db/migrations";

// Run migrations once on startup
await runMigrations();

// Create a session
const sessionId = await createSession({
	sessionId: `sess-${Date.now()}`,
	codebaseHash: "abc123def456",
	codebasePath: "/home/user/projects/my-app",
});

// Record a turn
await recordTurn({
	turnId: `turn-${Date.now()}`,
	sessionId,
	modelId: "claude-sonnet-4",
	providerId: "anthropic",
	inputTokens: 4500,
	outputTokens: 1200,
	costUsd: 0.042,
});

// End a session
await endSession(sessionId);
```

## Tech stack

- **`better-sqlite3`** — synchronous, fast, zero-config SQLite for Node.js
- **`drizzle-orm`** — type-safe query builder with schema definitions
- **`drizzle-kit`** — migration generation tool

## Related packages

- [`@ifi/pi-analytics-extension`](../analytics-extension) — hooks into pi events to record data
- [`@ifi/pi-analytics-dashboard`](../analytics-dashboard) — React SPA that visualizes the data
