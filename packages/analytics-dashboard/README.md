# @ifi/pi-analytics-dashboard

Visual dashboard for tracking your Pi AI usage metrics — models, tokens, costs, codebases, and more.

![Pi Analytics Dashboard](screenshot-overview.png)

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server (mock data mode)
pnpm dev

# Run with real data from SQLite (API mode)
VITE_API_MODE=api pnpm dev

# Or start both the API server and dashboard
pnpm dev:full
```

## API Modes

The dashboard supports two data modes controlled by `VITE_API_MODE`:

| Mode     | Value            | Description                                             |
| -------- | ---------------- | ------------------------------------------------------- |
| **Mock** | `mock` (default) | Uses generated mock data — no database needed           |
| **API**  | `api`            | Fetches from the Express server which reads from SQLite |

### Mock Mode (default)

No database or server required. Uses simulated data for demos and UI development:

```bash
pnpm dev
# or explicitly
VITE_API_MODE=mock pnpm dev
```

### API Mode

Reads real data from `~/.pi/agent/analytics/analytics.db`:

```bash
# Terminal 1: Start the API server
pnpm dev:server

# Terminal 2: Start the dashboard
VITE_API_MODE=api pnpm dev

# Or start both at once
pnpm dev:full
```

## Pages

| Page          | Description                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| **Overview**  | Summary metrics, time series chart, cost breakdown, top models/codebases, activity heatmap, usage insights |
| **Models**    | Per-model stats, token usage breakdown, cost distribution, model comparison table                          |
| **Codebases** | Per-project stats, cost/tokens charts, codebase cards with highlight                                       |
| **Insights**  | Emotional tone analysis, most common words, most common misspellings, usage insights                       |

### Insights Page 🧠

The Insights page provides fun analytics:

- **Emotional Tone**: Tracks sentiment per message (curious, focused, frustrated, satisfied, etc.) and shows a trend over time
- **Most Common Words**: Word cloud of frequently-used words in your prompts
- **Most Common Misspellings**: Tracks words you misspell most often, with corrections
- **Usage Insights**: Trend alerts, model comparisons, and anomaly detection

## Development

```bash
# Type checking
pnpm typecheck

# Unit tests (Vitest + jsdom)
pnpm test

# E2E browser tests (Playwright)
pnpm test:e2e

# Lint
npx oxlint src/

# Build for production
pnpm build
```

## Tech Stack

- **React 19** + **TypeScript**
- **Vite 8** for bundling
- **TanStack Query** for data fetching
- **Zustand** for state management
- **Recharts** for charts
- **Tailwind CSS v4** for styling
- **Express 5** for API server (optional, for real data mode)
- **Playwright** for E2E tests

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Dashboard (React SPA)                         │
│                                                 │
│  mockApi ──→ generated data                     │
│  realApi ──→ fetch('/api/*') ──→ Express server │
│                                       │          │
└───────────────────────────────────────┼──────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────┐
│  Express API Server (src/server/index.ts)       │
│                                                 │
│  /api/health      → DB health check             │
│  /api/overview     → summary + daily stats      │
│  /api/models       → model usage data           │
│  /api/codebases    → codebase usage data         │
│  /api/providers    → provider comparison         │
│  /api/turns        → recent turns               │
│  /api/words        → word frequencies            │
│  /api/misspellings → top misspellings           │
│  /api/live         → active session events       │
│  /api/sessions     → session history             │
│                                                 │
└─────────┬───────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│  @ifi/pi-analytics-db (SQLite + Drizzle ORM)    │
│                                                 │
│  ~/.pi/agent/analytics/analytics.db             │
└─────────────────────────────────────────────────┘
```

## Environment Variables

| Variable            | Default                              | Description                                    |
| ------------------- | ------------------------------------ | ---------------------------------------------- |
| `VITE_API_MODE`     | `mock`                               | `mock` for generated data, `api` for real data |
| `VITE_API_BASE`     | `http://localhost:31415`             | API server base URL                            |
| `PORT`              | `31415`                              | API server port                                |
| `ANALYTICS_DB_PATH` | `~/.pi/agent/analytics/analytics.db` | SQLite database path                           |
