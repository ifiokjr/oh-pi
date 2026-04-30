# `@ifi/pi-analytics-extension`

> Pi extension for analytics tracking with SQLite persistence.

Tracks your AI usage — which models you call, how many tokens you burn, what you spend — and stores it all in a local SQLite database so you can query trends over time.

## Why use this?

The built-in usage tracker shows session-level costs. This extension goes further: it records
**every turn** across **every session** for **every project**, giving you long-term visibility into
your AI spend and usage patterns.

- **Answer questions like:** "Did my token spend increase after switching to Sonnet 4?"
- **Spot trends:** Are you using more tokens per turn over time?
- **Correlate with codebases:** Which projects cost the most?

## What it tracks

Each time you interact with pi, this extension silently records:

| Data point       | Description                                  |
| ---------------- | -------------------------------------------- |
| Session          | Start time, end time, duration, project path |
| Turn             | Model, provider, input/output tokens, cost   |
| Codebase         | Working directory (hashed for privacy)       |
| Model / Provider | Auto-inferred from model ID                  |

All data lives in a SQLite database at `~/.pi/agent/analytics.db`.

## Installation

```bash
pi install npm:@ifi/pi-analytics-extension
```

> **Note:** This package is opt-in. It is **not** installed by `npx @ifi/oh-pi`.

## Usage

### Terminal stats

```bash
# Quick terminal summary
/analytics
```

Shows session counts, total tokens, total cost, and recent activity.

### Browser dashboard

```bash
# Open the full React dashboard
/analytics-dashboard
```

The dashboard provides charts and tables for:

- **Overview** — total spend, sessions, tokens by period
- **Models** — cost and token breakdown by model
- **Codebases** — which projects drive the most usage
- **Insights** — usage patterns across time

## How it works

- Hooks into `session_start`, `turn_end`, and `session_end` events
- Auto-infers provider from model ID (e.g., `claude-sonnet-4` → `anthropic`)
- Uses `@ifi/pi-analytics-db` for schema, migrations, and query helpers
- Database at `~/.pi/agent/analytics.db` using better-sqlite3 + Drizzle ORM

## Dashboard

The companion browser dashboard (`@ifi/pi-analytics-dashboard`) visualizes all data:

```bash
cd packages/analytics-dashboard
pnpm dev
```

It reads directly from the same SQLite database.

## Related packages

- [`@ifi/pi-analytics-db`](../analytics-db) — SQLite schema, migrations, typed queries
- [`@ifi/pi-analytics-dashboard`](../analytics-dashboard) — React visualization SPA
